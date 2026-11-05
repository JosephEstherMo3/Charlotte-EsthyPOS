import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { HttpError, readJson, route } from "@/lib/api";
import { audit } from "@/lib/audit";
import { createActivationToken } from "@/lib/auth";
import { hashPassword, newToken } from "@/lib/password";
import { getOriginFromRequest, resetEmailConfiguration, sendCashierInvitationEmail } from "@/lib/recovery-email";
import { emailField } from "@/lib/validation";

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
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.businessId, auth.business.id))
    .orderBy(asc(memberships.createdAt));

  return Response.json(
    {
      members: rows.map((m) => ({
        ...m,
        isActivated: Boolean(m.emailVerifiedAt),
        createdAt: m.createdAt.toISOString(),
        isYou: m.userId === auth.user.id,
      })),
    },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
});

const schema = z.object({
  fullName: z.string().trim().min(2, "Enter the member's full name").max(100),
  email: emailField,
  password: z.string().min(8, "Default password must be at least 8 characters").max(128),
  role: z.enum(["owner", "manager", "cashier"]).default("cashier"),
});

/**
 * Creates an authorized account for a team member and emails an invitation with an activation link.
 * Cashiers set their own passwords upon activation.
 */
export const POST = route({ permission: "team.manage" }, async ({ req, auth }) => {
  const input = await readJson(req, schema);
  if (auth.role !== "owner" && input.role !== "cashier") {
    throw new HttpError(403, "Managers can only add cashier accounts.");
  }

  const normalizedEmail = input.email.toLowerCase().trim();

  // Check if account already exists
  const [existingUser] = await db
    .select({ id: users.id, email: users.email, emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(sql`lower(${users.email}) = ${normalizedEmail}`);

  let targetUserId = existingUser?.id;
  let memberId: string;
  let isRetry = false;

  if (existingUser) {
    // Check if user is already a member of this business
    const [existingMember] = await db
      .select({ id: memberships.id, role: memberships.role, status: memberships.status })
      .from(memberships)
      .where(and(eq(memberships.businessId, auth.business.id), eq(memberships.userId, existingUser.id)));

    if (existingMember) {
      if (existingMember.status === "disabled") {
        await db.update(memberships).set({ status: "active", role: input.role }).where(eq(memberships.id, existingMember.id));
        if (input.password) {
          await db.update(users).set({ passwordHash: await hashPassword(input.password), emailVerifiedAt: new Date() }).where(eq(users.id, existingUser.id));
        }
        memberId = existingMember.id;
      } else if (!existingUser.emailVerifiedAt) {
        isRetry = true;
        if (input.password) {
          await db.update(users).set({ passwordHash: await hashPassword(input.password), emailVerifiedAt: new Date() }).where(eq(users.id, existingUser.id));
        }
        memberId = existingMember.id;
      } else {
        throw new HttpError(409, "A team member with this email address already exists and is active.", {
          email: "A team member with this email address already exists.",
        });
      }
    } else {
      // User exists in system, attach to this business
      if (input.password) {
        await db.update(users).set({ passwordHash: await hashPassword(input.password), emailVerifiedAt: new Date() }).where(eq(users.id, existingUser.id));
      }
      const [m] = await db
        .insert(memberships)
        .values({ businessId: auth.business.id, userId: existingUser.id, role: input.role })
        .returning({ id: memberships.id });
      memberId = m.id;
    }
  } else {
    // Create new user with unverified status (until activated)
    // Use dummy random hash if password not provided so account cannot be accessed without activation
    const passwordHash = await hashPassword(input.password || newToken());
    const isManualPassword = Boolean(input.password);

    const result = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          email: normalizedEmail,
          passwordHash,
          fullName: input.fullName,
          emailVerifiedAt: isManualPassword ? new Date() : null,
        })
        .returning({ id: users.id });

      const [m] = await tx
        .insert(memberships)
        .values({ businessId: auth.business.id, userId: u.id, role: input.role })
        .returning({ id: memberships.id });

      await audit(tx, {
        businessId: auth.business.id,
        userId: auth.user.id,
        action: "team.member_added",
        entityType: "membership",
        entityId: m.id,
        metadata: { email: normalizedEmail, role: input.role, manualPassword: isManualPassword },
      });

      return { userId: u.id, memberId: m.id };
    });

    targetUserId = result.userId;
    memberId = result.memberId;
  }

  // Generate activation token & activation link
  const origin = getOriginFromRequest(req);
  const emailConfig = resetEmailConfiguration(origin);
  const token = await createActivationToken(targetUserId!);
  const activationLink = `${emailConfig?.origin || origin}/activate?token=${encodeURIComponent(token)}`;

  let emailSent = false;
  let emailError: string | undefined;

  if (emailConfig) {
    const res = await sendCashierInvitationEmail(
      emailConfig,
      normalizedEmail,
      token,
      input.fullName,
      auth.business.name,
      input.role,
      input.password,
    );
    emailSent = res.ok;
    emailError = res.error;
  } else {
    emailError = "No email provider (EmailJS/Resend) configured in environment.";
  }

  const loginLink = `${emailConfig?.origin || origin}/login?email=${encodeURIComponent(normalizedEmail)}`;

  return Response.json(
    {
      id: memberId,
      email: normalizedEmail,
      fullName: input.fullName,
      role: input.role,
      password: input.password,
      isRetry,
      emailSent,
      emailError,
      activationLink,
      loginLink,
    },
    { status: isRetry ? 200 : 201 },
  );
});
