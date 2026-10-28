import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { and, asc, eq, getTableColumns, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  authHandoffs,
  businesses,
  businessSettings,
  emailVerifications,
  embeddedSessions,
  memberships,
  sessions,
  users,
  type Settings,
} from "@/db/schema";
import { HttpError } from "@/lib/errors";
import { hashToken, newToken } from "@/lib/password";
import type { Role } from "@/lib/permissions";

export const SESSION_COOKIE = "ce_session";
const SESSION_DAYS = 14;

export interface AuthContext {
  user: { id: string; email: string; fullName: string; phone: string | null };
  business: { id: string; name: string };
  role: Role;
  /** Settings without the (potentially large) logo data URL. */
  settings: Omit<Settings, "logoUrl">;
}

/**
 * True when the browser reached us over HTTPS. Reverse proxies differ in what they forward,
 * so several signals are checked (any one is enough): X-Forwarded-Proto, the RFC 7239
 * `Forwarded` header, the Origin / Referer the browser sent, APP_URL, or the request URL.
 */
export function isHttpsRequest(h: Pick<Headers, "get">, requestUrl?: string): boolean {
  const xfp = (h.get("x-forwarded-proto") ?? "").toLowerCase();
  if (xfp.split(",").some((p) => p.trim() === "https")) return true;
  if (/proto=https/i.test(h.get("forwarded") ?? "")) return true;
  if ((h.get("x-forwarded-ssl") ?? "").toLowerCase() === "on") return true;
  if ((h.get("origin") ?? "").toLowerCase().startsWith("https://")) return true;
  if ((h.get("referer") ?? "").toLowerCase().startsWith("https://")) return true;
  if ((process.env.APP_URL ?? "").toLowerCase().startsWith("https://")) return true;
  return (requestUrl ?? "").toLowerCase().startsWith("https://");
}

/**
 * Cookie attributes. Over HTTPS the cookie is `SameSite=None; Secure; Partitioned` so that sign-in also
 * works when the app is shown inside an embedded preview/iframe from another site (a `Lax` cookie is
 * silently dropped there, which made it look like sign-in failed right after creating an account).
 * Cross-site request forgery is still prevented server-side (see assertSameSiteRequest in src/lib/api.ts).
 * Over plain HTTP (local development) it stays `Lax`.
 */
export function sessionCookieOptions(secure: boolean, expires: Date) {
  return {
    httpOnly: true,
    path: "/",
    expires,
    ...(secure
      ? { secure: true, sameSite: "none" as const, partitioned: true }
      : { secure: false, sameSite: "lax" as const }),
  };
}

export async function createSession(userId: string): Promise<void> {
  const token = newToken();
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    userAgent: (h.get("user-agent") ?? "").slice(0, 200),
    expiresAt,
  });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(isHttpsRequest(h), expiresAt));
}

/**
 * Issue a short-lived, cookie-independent session after password authentication.
 * Only used by the preview's explicit embedded-mode sign-in. The raw token is
 * returned once in a no-store HTTPS response; the database stores only its hash.
 */
export async function createEmbeddedSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + EMBEDDED_SESSION_DAYS * 86_400_000);
  await db.insert(embeddedSessions).values({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt: expiresAt.toISOString() };
}

// Same lifetime as the httpOnly cookie session: a preview reload must not
// sign somebody out in the middle of a working day.
const EMBEDDED_SESSION_DAYS = 14;
const VERIFICATION_HOURS = 24;
const BEARER_PATTERN = /^Bearer ([A-Za-z0-9_-]{43})$/i;

/** Returns null for missing/malformed headers; never accepts a token in a URL or cookie. */
export function extractEmbeddedToken(value: string | null): string | null {
  return value?.match(BEARER_PATTERN)?.[1] ?? null;
}

/**
 * Single-use email-verification link. Only the hash is stored; the raw token
 * goes to the account owner's inbox and never into a log or API response.
 */
export async function createEmailVerification(userId: string): Promise<string> {
  const token = newToken();
  await db.insert(emailVerifications).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + VERIFICATION_HOURS * 3_600_000),
  });
  return token;
}

/** Marks the account verified. Locking the row stops two tabs using one link. */
export async function consumeEmailVerification(token: string): Promise<{ email: string; fullName: string }> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(emailVerifications)
      .where(and(eq(emailVerifications.tokenHash, hashToken(token)), isNull(emailVerifications.usedAt), gt(emailVerifications.expiresAt, now)))
      .for("update");
    if (!row) throw new HttpError(400, "This verification link is invalid or has expired. Sign in to request a new one.");
    await tx.update(emailVerifications).set({ usedAt: now }).where(eq(emailVerifications.tokenHash, hashToken(token)));
    const [user] = await tx
      .update(users)
      .set({ emailVerifiedAt: now })
      .where(eq(users.id, row.userId))
      .returning({ email: users.email, fullName: users.fullName });
    return user;
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const h = await headers();
  const cookieToken = jar.get(SESSION_COOKIE)?.value;
  const bearerToken = extractEmbeddedToken(h.get("authorization"));
  if (cookieToken || bearerToken) {
    await db.transaction(async (tx) => {
      const userIds = new Set<string>();
      if (cookieToken) {
        const [s] = await tx.delete(sessions).where(eq(sessions.tokenHash, hashToken(cookieToken))).returning({ userId: sessions.userId });
        if (s) userIds.add(s.userId);
      }
      if (bearerToken) {
        const [s] = await tx.delete(embeddedSessions).where(eq(embeddedSessions.tokenHash, hashToken(bearerToken))).returning({ userId: embeddedSessions.userId });
        if (s) userIds.add(s.userId);
      }
      for (const userId of userIds) await tx.delete(authHandoffs).where(eq(authHandoffs.userId, userId));
    });
  }
  // Expire with the same attributes it was set with (a partitioned cookie is only cleared by a partitioned one).
  jar.set(SESSION_COOKIE, "", { ...sessionCookieOptions(isHttpsRequest(h), new Date(0)), maxAge: 0 });
}

export async function currentTokenHash(): Promise<string | null> {
  const h = await headers();
  const authorization = h.get("authorization");
  const token = authorization !== null ? extractEmbeddedToken(authorization) : (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

const { logoUrl: _logo, ...settingsColumns } = getTableColumns(businessSettings);
void _logo;

/** Resolves the authenticated user, active business membership and role. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const authorization = (await headers()).get("authorization");
  const bearer = authorization !== null ? extractEmbeddedToken(authorization) : null;
  // An explicit but malformed Authorization header MUST NOT fall back to someone else's cookie.
  if (authorization !== null && !bearer) return null;
  const cookie = authorization === null ? (await cookies()).get(SESSION_COOKIE)?.value : undefined;
  if (!bearer && !cookie) return null;

  const now = new Date();
  const tokenHash = hashToken(bearer ?? cookie!);
  let session: { userId: string } | undefined;
  if (bearer) {
    // A bearer can be a tab-scoped embedded credential OR the session token that
    // a handoff redemption returned as a cookie fallback. Look in both tables so
    // a restricted tab is never stranded after its one-time code was spent.
    [session] = await db.select({ userId: embeddedSessions.userId }).from(embeddedSessions)
      .where(and(eq(embeddedSessions.tokenHash, tokenHash), gt(embeddedSessions.expiresAt, now))).limit(1);
    if (!session) {
      [session] = await db.select({ userId: sessions.userId }).from(sessions)
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now))).limit(1);
    }
  } else {
    [session] = await db.select({ userId: sessions.userId }).from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now))).limit(1);
  }
  if (!session) return null;

  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      phone: users.phone,
      role: memberships.role,
      businessId: businesses.id,
      businessName: businesses.name,
    })
    .from(users)
    .innerJoin(memberships, and(eq(memberships.userId, users.id), eq(memberships.status, "active")))
    .innerJoin(businesses, eq(businesses.id, memberships.businessId))
    .where(eq(users.id, session.userId))
    .orderBy(asc(memberships.createdAt))
    .limit(1);
  if (!row) return null;
  const [settings] = await db.select(settingsColumns).from(businessSettings).where(eq(businessSettings.businessId, row.businessId));
  if (!settings) return null;
  return {
    user: { id: row.userId, email: row.email, fullName: row.fullName, phone: row.phone },
    business: { id: row.businessId, name: row.businessName },
    role: row.role,
    settings,
  };
});

/** For server components/layouts: redirects to /login when unauthenticated. */
export async function requireAuthPage(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return auth;
}
