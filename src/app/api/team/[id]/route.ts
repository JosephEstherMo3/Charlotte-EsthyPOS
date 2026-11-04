import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  authHandoffs,
  emailVerifications,
  embeddedSessions,
  memberships,
  passwordResets,
  sales,
  sessions,
  users,
} from "@/db/schema";
import { HttpError, parseId, readJson, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { passwordField } from "@/lib/validation";

const schema = z.object({
  role: z.enum(["owner", "manager", "cashier"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
  password: passwordField.optional(),
});

export const PATCH = route({ permission: "team.manage" }, async ({ req, auth, params }) => {
  const id = parseId(params.id);
  const input = await readJson(req, schema);
  if (input.role === undefined && input.status === undefined && input.password === undefined) {
    throw new HttpError(400, "Nothing to update");
  }
  const biz = auth.business.id;

  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ m: memberships, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.id, id), eq(memberships.businessId, biz)))
      .for("update", { of: memberships });
    if (!target) throw new HttpError(404, "Team member not found");
    const isSelf = target.m.userId === auth.user.id;

    if (auth.role !== "owner" && (target.m.role !== "cashier" || (input.role && input.role !== "cashier"))) {
      throw new HttpError(403, "Managers can only manage cashier accounts.");
    }
    if (isSelf && ((input.role && input.role !== target.m.role) || input.status === "disabled")) {
      throw new HttpError(400, "You can't change your own role or disable your own account.");
    }
    if (isSelf && input.password) {
      throw new HttpError(400, "Use Settings → Account to change your own password.");
    }
    const losingOwner =
      target.m.role === "owner" && target.m.status === "active" && ((input.role && input.role !== "owner") || input.status === "disabled");
    if (losingOwner) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(memberships)
        .where(and(eq(memberships.businessId, biz), eq(memberships.role, "owner"), eq(memberships.status, "active")));
      if (n <= 1) throw new HttpError(400, "A business must keep at least one active owner.");
    }

    const set: Partial<typeof memberships.$inferInsert> = {};
    if (input.role) set.role = input.role;
    if (input.status) set.status = input.status;
    if (Object.keys(set).length) await tx.update(memberships).set(set).where(eq(memberships.id, id));

    if (input.password) {
      await tx.update(users).set({ passwordHash: await hashPassword(input.password) }).where(eq(users.id, target.m.userId));
    }
    if (input.password || input.status === "disabled") {
      await tx.delete(sessions).where(eq(sessions.userId, target.m.userId)); // force sign-out
      await tx.delete(embeddedSessions).where(eq(embeddedSessions.userId, target.m.userId));
      await tx.delete(authHandoffs).where(eq(authHandoffs.userId, target.m.userId));
    }
    await audit(tx, {
      businessId: biz,
      userId: auth.user.id,
      action: input.password ? "team.password_reset" : input.status ? `team.member_${input.status === "active" ? "enabled" : "disabled"}` : "team.role_changed",
      entityType: "membership",
      entityId: id,
      metadata: { email: target.email, ...(input.role ? { role: { from: target.m.role, to: input.role } } : {}) },
    });
  });
  return { ok: true };
});

export const DELETE = route({ permission: "team.manage" }, async ({ auth, params }) => {
  const id = parseId(params.id);
  const biz = auth.business.id;

  await db.transaction(async (tx) => {
    const [target] = await tx
      .select({ m: memberships, email: users.email })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.id, id), eq(memberships.businessId, biz)))
      .for("update", { of: memberships });

    if (!target) throw new HttpError(404, "Team member not found");

    if (target.m.userId === auth.user.id) {
      throw new HttpError(400, "You cannot delete your own account from the team.");
    }

    if (auth.role !== "owner" && target.m.role !== "cashier") {
      throw new HttpError(403, "Managers can only remove cashier accounts.");
    }

    if (target.m.role === "owner") {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(memberships)
        .where(and(eq(memberships.businessId, biz), eq(memberships.role, "owner"), eq(memberships.status, "active")));
      if (n <= 1) throw new HttpError(400, "A business must keep at least one active owner.");
    }

    // Integrity check: Did this cashier record sales?
    const [saleRecord] = await tx
      .select({ id: sales.id })
      .from(sales)
      .where(eq(sales.cashierId, target.m.userId))
      .limit(1);

    if (saleRecord) {
      throw new HttpError(
        400,
        "This member has recorded sales and cannot be deleted due to financial and transaction history. Please set their status to 'Disabled' instead to revoke access.",
      );
    }

    // Revoke any active sessions & pending tokens
    await tx.delete(sessions).where(eq(sessions.userId, target.m.userId));
    await tx.delete(embeddedSessions).where(eq(embeddedSessions.userId, target.m.userId));
    await tx.delete(authHandoffs).where(eq(authHandoffs.userId, target.m.userId));
    await tx.delete(passwordResets).where(eq(passwordResets.userId, target.m.userId));
    await tx.delete(emailVerifications).where(eq(emailVerifications.userId, target.m.userId));

    // Delete membership from this business
    await tx.delete(memberships).where(eq(memberships.id, id));

    // If the user does not belong to any other businesses, delete user record entirely
    const [otherMembership] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(eq(memberships.userId, target.m.userId))
      .limit(1);

    if (!otherMembership) {
      await tx.delete(users).where(eq(users.id, target.m.userId));
    }

    await audit(tx, {
      businessId: biz,
      userId: auth.user.id,
      action: "team.member_removed",
      entityType: "membership",
      entityId: id,
      metadata: { email: target.email, role: target.m.role },
    });
  });

  return { ok: true };
});
