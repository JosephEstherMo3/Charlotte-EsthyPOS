import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { HttpError, parseId, route } from "@/lib/api";
import { createActivationToken } from "@/lib/auth";
import { resetEmailConfiguration, sendCashierInvitationEmail } from "@/lib/recovery-email";

export const POST = route({ permission: "team.manage" }, async ({ auth, params }) => {
  const id = parseId(params.id);
  const biz = auth.business.id;

  const [target] = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      role: memberships.role,
      status: memberships.status,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.id, id), eq(memberships.businessId, biz)));

  if (!target) throw new HttpError(404, "Team member not found");

  if (auth.role !== "owner" && target.role !== "cashier") {
    throw new HttpError(403, "Managers can only resend invitations to cashiers.");
  }

  const emailConfig = resetEmailConfiguration();
  const token = await createActivationToken(target.userId);
  const activationLink = `${emailConfig?.origin || process.env.APP_URL || "http://localhost:3000"}/activate?token=${encodeURIComponent(token)}`;

  let emailSent = false;
  let emailError: string | undefined;

  if (emailConfig) {
    const res = await sendCashierInvitationEmail(
      emailConfig,
      target.email,
      token,
      target.fullName,
      auth.business.name,
      target.role,
    );
    emailSent = res.ok;
    emailError = res.error;
  } else {
    emailError = "No email provider (EmailJS/Resend) configured in environment.";
  }

  return Response.json({
    ok: true,
    emailSent,
    emailError,
    activationLink,
    email: target.email,
    fullName: target.fullName,
  });
});
