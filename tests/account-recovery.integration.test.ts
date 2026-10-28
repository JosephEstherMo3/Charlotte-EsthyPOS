import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db, pool } from "@/db";
import { auditEvents, authHandoffs, businesses, businessSettings, embeddedSessions, memberships, passwordResets, sessions, users } from "@/db/schema";
import { hashPassword, hashToken, newToken, verifyPassword } from "@/lib/password";
import { resetPasswordAsOperator } from "@/lib/services/account-recovery";

const label = `recovery-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const email = `${label}@test.local`;
let userId = "";
let businessId = "";
const expiration = new Date(Date.now() + 3_600_000);

beforeAll(async () => {
  const [user] = await db.insert(users).values({ email, fullName: "Account Recovery Test", passwordHash: await hashPassword("OldPassword123!") }).returning();
  userId = user.id;
  const [business] = await db.insert(businesses).values({ name: label }).returning();
  businessId = business.id;
  await db.insert(businessSettings).values({ businessId, receiptBusinessName: label });
  await db.insert(memberships).values({ userId, businessId, role: "owner" });
  await db.insert(sessions).values({ userId, tokenHash: hashToken(newToken()), expiresAt: expiration });
  await db.insert(embeddedSessions).values({ userId, tokenHash: hashToken(newToken()), expiresAt: expiration });
  await db.insert(authHandoffs).values({ userId, tokenHash: hashToken(newToken()), expiresAt: expiration });
  await db.insert(passwordResets).values({ userId, tokenHash: hashToken(newToken()), expiresAt: expiration });
});

afterAll(async () => {
  await db.delete(businesses).where(eq(businesses.id, businessId));
  await db.delete(users).where(like(users.email, `${label}%`));
  await pool.end();
});

describe("operator-only private account recovery", () => {
  it("refuses to reset a missing or malformed account", async () => {
    await expect(resetPasswordAsOperator("not-present@example.com")).rejects.toThrow(/no active account/i);
    await expect(resetPasswordAsOperator("not-an-email")).rejects.toThrow();
  });

  it("changes the password, revokes sessions and recovery tokens, and audits the operation", async () => {
    const result = await resetPasswordAsOperator(email.toUpperCase());
    expect(result.fullName).toBe("Account Recovery Test");
    expect(result.temporaryPassword).toMatch(/^[A-Za-z0-9_-]{32}$/);
    const [account] = await db.select().from(users).where(eq(users.id, userId));
    expect(account.passwordHash).not.toContain(result.temporaryPassword);
    expect(await verifyPassword(result.temporaryPassword, account.passwordHash)).toBe(true);
    expect(await verifyPassword("OldPassword123!", account.passwordHash)).toBe(false);
    for (const [table, label] of [
      [sessions, "cookie sessions"],
      [embeddedSessions, "embedded sessions"],
      [authHandoffs, "handoff tickets"],
      [passwordResets, "reset links"],
    ] as const) {
      const rows = await db.select().from(table).where(eq(table.userId, userId));
      expect(rows, label).toHaveLength(0);
    }
    const audit = await db.select().from(auditEvents).where(eq(auditEvents.userId, userId));
    expect(audit.some((event) => event.businessId === businessId && event.action === "auth.operator_password_reset")).toBe(true);
  });
});
