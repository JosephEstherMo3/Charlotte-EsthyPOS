import type { NextRequest } from "next/server";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  authHandoffs,
  businesses,
  businessSettings,
  emailVerifications,
  embeddedSessions,
  memberships,
  passwordResets,
  sessions,
  users,
} from "@/db/schema";
import { clearRateLimit, clientIp, HttpError, publicRoute, rateLimit, readJson } from "@/lib/api";
import { audit } from "@/lib/audit";
import {
  consumeEmailVerification,
  createEmailVerification,
  createEmbeddedSession,
  createSession,
  destroySession,
  getAuth,
} from "@/lib/auth";
import { DUMMY_HASH, hashPassword, hashToken, newToken, verifyPassword } from "@/lib/password";
import { resetEmailConfiguration, sendResetEmail, sendVerificationEmail } from "@/lib/recovery-email";
import { emailField, passwordField } from "@/lib/validation";

/**
 * Registration creates the account and business but does NOT sign anyone in.
 * The owner confirms the address first (when email delivery is configured) and
 * then signs in with the same credentials.
 */
async function register(_req: NextRequest) {
  throw new HttpError(403, "Registration is for authorized users only.");
}

async function login(req: NextRequest) {
  const input = await readJson(
    req,
    z.object({ email: emailField, password: z.string().min(1, "Enter your password").max(128) }),
  );
  const key = `login:${clientIp(req)}:${input.email}`;
  rateLimit(key, 10, 15 * 60 * 1000);
  const matchingUsers = await db.select().from(users).where(sql`lower(${users.email}) = ${input.email}`).limit(2);
  if (matchingUsers.length > 1) {
    throw new HttpError(409, "More than one account matches this email address. Contact your administrator.");
  }
  const [u] = matchingUsers;
  const ok = await verifyPassword(input.password, u?.passwordHash ?? DUMMY_HASH); // constant-ish time
  if (!u || !ok) throw new HttpError(401, "Incorrect email or password.");
  if (!u.emailVerifiedAt) {
    throw new HttpError(403, "Please verify your email address before signing in. Check your inbox for the verification link.");
  }
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, u.id), eq(memberships.status, "active")))
    .limit(1);
  if (!m) throw new HttpError(403, "Your account is not active. Please contact your business owner.");

  clearRateLimit(key);
  await createSession(u.id);
  // Extra cookie-independent credential for browsers that reject cookies in an
  // embedded frame. The httpOnly cookie stays the primary session.
  const session = await createEmbeddedSession(u.id);
  await audit(db, { businessId: m.businessId, userId: u.id, action: "auth.login" });
  return Response.json({ ok: true, session }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
}

async function verifyEmail(token: string) {
  // The token is a 256-bit single-use secret, so guessing is not a concern.
  const user = await consumeEmailVerification(token);
  return Response.json({ ok: true, email: user.email, fullName: user.fullName }, { headers: { "Cache-Control": "no-store" } });
}

async function forgot(req: NextRequest) {
  const input = await readJson(req, z.object({ email: emailField }));
  const config = resetEmailConfiguration();
  if (!config) {
    throw new HttpError(503, "Email password recovery is not configured on this server. Sign in with your existing password, or ask the server operator to reset your account securely.");
  }
  rateLimit(`forgot:${clientIp(req)}`, 5, 15 * 60 * 1000);
  const [u] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.email, input.email));
  if (u) {
    const token = newToken();
    const [resetRequest] = await db.insert(passwordResets).values({
      userId: u.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    }).returning({ id: passwordResets.id });
    if (!(await sendResetEmail(config, u.email, token))) {
      await db.delete(passwordResets).where(eq(passwordResets.id, resetRequest.id));
      // Never put links/tokens into a log. The response is intentionally identical
      // for unknown accounts and provider errors to prevent account enumeration.
      console.error("[password-reset] Email provider did not accept a recovery request.");
    }
  }
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

async function reset(req: NextRequest) {
  const input = await readJson(req, z.object({ token: z.string().min(10).max(200), password: passwordField }));
  rateLimit(`reset:${clientIp(req)}`, 12, 15 * 60 * 1000);
  const passwordHash = await hashPassword(input.password);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(passwordResets)
      .where(and(eq(passwordResets.tokenHash, hashToken(input.token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())))
      .for("update");
    if (!row) throw new HttpError(400, "This reset link is invalid or has expired. Please request a new one.");
    await tx.update(users).set({ passwordHash, emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
    await tx.delete(embeddedSessions).where(eq(embeddedSessions.userId, row.userId));
    await tx.delete(authHandoffs).where(eq(authHandoffs.userId, row.userId));
    await tx.delete(emailVerifications).where(eq(emailVerifications.userId, row.userId));
    await audit(tx, { businessId: null, userId: row.userId, action: "auth.password_reset" });
  });
  return { ok: true };
}

export const GET = publicRoute(async ({ req, params }) => {
  if (params.action === "config") {
    return Response.json(
      { resetEmailConfigured: Boolean(resetEmailConfiguration()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
  if (params.action === "session") {
    return Response.json({ authenticated: Boolean(await getAuth()) }, { headers: { "Cache-Control": "no-store" } });
  }
  if (params.action === "context") {
    const auth = await getAuth();
    if (!auth) throw new HttpError(401, "Please sign in to continue.");
    return Response.json({ auth }, { headers: { "Cache-Control": "no-store" } });
  }
  throw new HttpError(404, "Not found");
});

export const POST = publicRoute(async ({ req, params }) => {
  switch (params.action) {
    case "register":
      return register(req);
    case "login":
      return login(req);
    case "verify": {
      const input = await readJson(req, z.object({ token: z.string().trim().regex(/^[A-Za-z0-9_-]{43}$/, "Invalid verification link") }));
      return verifyEmail(input.token);
    }
    case "logout":
      await destroySession();
      return { ok: true };
    case "forgot":
      return forgot(req);
    case "reset":
      return reset(req);
    default:
      throw new HttpError(404, "Not found");
  }
});
