import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { HttpError, readJson, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/password";
import { emailField, passwordField } from "@/lib/validation";

export const GET = route({ permission: "team.view" }, async ({ auth }) => {
  const rows = await db
    .select({
      id: memberships.id,
      userId: users.id,
      fullName: users.fullName,
      email: users.email,
      phone: users.phone,
      role: memberships.role,
      status: memberships.status,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.businessId, auth.business.id))
    .orderBy(asc(memberships.createdAt));
  return { members: rows.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), isYou: m.userId === auth.user.id })) };
});

const schema = z.object({
  fullName: z.string().trim().min(2, "Enter the member's full name").max(100),
  email: emailField,
  password: passwordField,
  role: z.enum(["owner", "manager", "cashier"]),
});

/** Creates an account for a team member with a temporary password. Managers may only create cashiers. */
export const POST = route({ permission: "team.manage" }, async ({ req, auth }) => {
  const input = await readJson(req, schema);
  if (auth.role !== "owner" && input.role !== "cashier") {
    throw new HttpError(403, "Managers can only add cashier accounts.");
  }
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
  if (exists) throw new HttpError(409, "An account with this email already exists.", { email: "An account with this email already exists." });
  const passwordHash = await hashPassword(input.password);
  const id = await db.transaction(async (tx) => {
    // The owner vouches for this person and hands them a temporary password;
    // there is no email-verification step for staff accounts.
    const [u] = await tx
      .insert(users)
      .values({ email: input.email, passwordHash, fullName: input.fullName, emailVerifiedAt: new Date() })
      .returning({ id: users.id });
    const [m] = await tx.insert(memberships).values({ businessId: auth.business.id, userId: u.id, role: input.role }).returning({ id: memberships.id });
    await audit(tx, { businessId: auth.business.id, userId: auth.user.id, action: "team.member_added", entityType: "membership", entityId: m.id, metadata: { email: input.email, role: input.role } });
    return m.id;
  });
  return Response.json({ id }, { status: 201 });
});
