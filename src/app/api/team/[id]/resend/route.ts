import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { memberships, users } from "@/db/schema";
import { HttpError, parseId, route } from "@/lib/api";
import { createActivationToken } from "@/lib/auth";
import { getOriginFromRequest, resetEmailConfiguration, sendCashierInvitationEmail } from "@/lib/recovery-email";

export const POST = route({ permission: "team.manage" }, async ({ req, auth, params }) => {
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

  const origin = getOriginFromRequest(req);
  const emailConfig = resetEmailConfiguration(origin);
  const token = await createActivationToken(target.userId);
  const activationLink = `${emailConfig?.origin || origin}/activate?token=${encodeURIComponent(token)}`;

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
      undefined,
      {
        role: auth.role,
        name: auth.user.fullName,
        email: auth.user.email,
      },
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

