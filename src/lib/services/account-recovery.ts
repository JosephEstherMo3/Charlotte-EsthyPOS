import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, authHandoffs, embeddedSessions, memberships, passwordResets, sessions, users } from "@/db/schema";
import { hashPassword } from "@/lib/password";
import { emailField } from "@/lib/validation";

/**
 * Operator-only account recovery. NEVER call this from an HTTP route. The
 * process must already have trusted access to DATABASE_URL (server shell).
 * No temporary password is stored in plaintext, logged by the app, emailed
 * without configuration, or returned to browser clients.
 */
export async function resetPasswordAsOperator(rawEmail: string): Promise<{ temporaryPassword: string; fullName: string }> {
  const email = emailField.parse(rawEmail);
  const temporaryPassword = randomBytes(24).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);

  const fullName = await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: users.id, fullName: users.fullName, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.email, email))
      .for("update")
      .limit(1);
    if (!user) throw new Error("No active account exists for that email.");
    const [member] = await tx.select({ businessId: memberships.businessId }).from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.status, "active"))).limit(1);
    if (!member) throw new Error("No active business membership exists for that account.");

    await tx.update(users).set({ passwordHash, emailVerifiedAt: user.emailVerifiedAt ?? new Date() }).where(eq(users.id, user.id));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await tx.delete(embeddedSessions).where(eq(embeddedSessions.userId, user.id));
    await tx.delete(authHandoffs).where(eq(authHandoffs.userId, user.id));
    await tx.delete(passwordResets).where(eq(passwordResets.userId, user.id));
    await tx.insert(auditEvents).values({
      businessId: member.businessId,
      userId: user.id,
      action: "auth.operator_password_reset",
      entityType: "user",
      entityId: user.id,
      metadata: { via: "server-cli" },
    });
    return user.fullName;
  });

  return { temporaryPassword, fullName };
}
