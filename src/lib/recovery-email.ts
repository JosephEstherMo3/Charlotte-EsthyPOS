import dns from "node:dns";
import nodemailer from "nodemailer";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

export type EmailConfig =
  | {
      provider: "gmail";
      user: string;
      pass: string;
      origin: string;
    }
  | {
      provider: "emailjs";
      serviceId: string;
      templateId: string;
      resetTemplateId: string;
      publicKey: string;
      privateKey?: string;
      origin: string;
    }
  | {
      provider: "resend";
      key: string;
      from: string;
      origin: string;
    };

export interface EmailResult {
  ok: boolean;
  error?: string;
}

/**
 * Helper to extract the actual origin URL from an incoming Next.js request.
 * Automatically handles localhost, custom domains, and Vercel deployments.
 */
export function getOriginFromRequest(req: Request): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost || req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (host) {
    return `${proto}://${host}`;
  }
  return (
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  );
}

/**
 * Email delivery configuration. Supports EmailJS and Resend.
 * Builds verification, activation and password reset links pointing to a trusted application origin.
 */
export function resetEmailConfiguration(preferredOrigin?: string): EmailConfig | null {
  let origin = preferredOrigin;
  if (!origin) {
    const rawUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");
    try {
      const parsed = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
      origin = parsed.origin;
    } catch {
      origin = "http://localhost:3000";
    }
  }

  // 1. Check Gmail Direct SMTP configuration (Priority: zero watermark, 100% free)
  const gmailPass = process.env.GMAIL_APP_PASSWORD?.trim();
  const gmailUser = process.env.GMAIL_USER?.trim() || "charlotteesthy49@gmail.com";
  if (gmailPass) {
    return {
      provider: "gmail" as const,
      user: gmailUser,
      pass: gmailPass,
      origin,
    };
  }

  // 2. Check EmailJS configuration
  const emailJsServiceId = process.env.EMAILJS_SERVICE_ID?.trim();
  const emailJsTemplateId = (process.env.EMAILJS_TEMPLATE_ID || process.env.EMAILJS_VERIFICATION_TEMPLATE_ID)?.trim();
  const emailJsPublicKey = (process.env.EMAILJS_PUBLIC_KEY || process.env.EMAILJS_USER_ID)?.trim();
  const emailJsPrivateKey = (process.env.EMAILJS_PRIVATE_KEY || process.env.EMAILJS_ACCESS_TOKEN)?.trim();
  const emailJsResetTemplateId = (process.env.EMAILJS_RESET_TEMPLATE_ID || emailJsTemplateId)?.trim();

  if (emailJsServiceId && emailJsTemplateId && emailJsPublicKey) {
    return {
      provider: "emailjs",
      serviceId: emailJsServiceId,
      templateId: emailJsTemplateId,
      resetTemplateId: emailJsResetTemplateId || emailJsTemplateId,
      publicKey: emailJsPublicKey,
      privateKey: emailJsPrivateKey || undefined,
      origin,
    };
  }

  // 2. Check Resend configuration
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const resendFrom = process.env.EMAIL_FROM?.trim();
  if (resendKey && resendFrom) {
    return {
      provider: "resend",
      key: resendKey,
      from: resendFrom,
      origin,
    };
  }

  return null;
}

/**
 * Send email confirmation link via EmailJS or Resend.
 */
export async function sendVerificationEmail(
  config: NonNullable<ReturnType<typeof resetEmailConfiguration>>,
  email: string,
  token: string,
  fullName?: string,
  businessName?: string,
): Promise<EmailResult> {
  const link = `${config.origin}/verify-email?token=${encodeURIComponent(token)}`;

  if (config.provider === "gmail") {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: config.user,
          pass: config.pass,
        },
      });

      await transporter.sendMail({
        from: `"${businessName || "Charlotte Esthy POS"} Administration" <${config.user}>`,
        to: email,
        replyTo: "admin.charlotteesthy49@gmail.com",
        subject: `Verify your email for ${businessName || "Charlotte Esthy POS"}`,
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);">
          <tr>
            <td align="center" style="padding: 36px 32px 24px 32px; border-bottom: 1px solid #f1f5f9;">
              <img src="https://raw.githubusercontent.com/JosephEstherMo3/Charlotte-EsthyPOS/main/public/logo.png" alt="Charlotte Esthy POS" width="140" style="display: block; border: 0;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 12px 0; color: #0a132c; font-size: 22px; font-weight: 700;">
                Verify Your Email Address
              </h1>
              <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 1.6;">
                Hello <strong>${fullName || "User"}</strong>,<br />
                Welcome to <strong>${businessName || "Charlotte Esthy POS"}</strong>. Please confirm your email address by clicking the button below:
              </p>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${link}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0c4a9e 0%, #0284c7 100%); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(12, 74, 158, 0.25);">
                      Verify Email Address &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px 0; color: #64748b; font-size: 12px; line-height: 1.5; text-align: center;">
                If you did not create an account, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                &copy; Charlotte Esthy Point of Sale. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      });

      return { ok: true };
    } catch (err: any) {
      console.error("[Gmail SMTP] Verification email failed:", err);
      return { ok: false, error: err?.message || "Failed to send email via Gmail" };
    }
  }

  if (config.provider === "emailjs") {
    try {
      const payload: Record<string, unknown> = {
        service_id: config.serviceId,
        template_id: config.templateId,
        user_id: config.publicKey,
        template_params: {
          from_name: `${businessName || "Charlotte Esthy POS"} Administration`,
          sender_name: `${businessName || "Charlotte Esthy POS"} Administration`,
          from_email: "admin@charlotteesthy.com",
          reply_to: "charlotteesthy49@gmail.com",
          to_name: fullName || "Valued User",
          name: fullName || "Valued User",
          user_name: fullName || "Valued User",
          to_email: email,
          user_email: email,
          email,
          verification_link: link,
          activation_link: link,
          link,
          token,
          business_name: businessName || "Charlotte Esthy POS",
          company_name: businessName || "Charlotte Esthy POS",
          logo_url: "https://raw.githubusercontent.com/JosephEstherMo3/Charlotte-EsthyPOS/main/public/logo.png",
          support_email: "charlotteesthy49@gmail.com",
          app_url: config.origin,
          subject: `Verify your email for ${businessName || "Charlotte Esthy POS"}`,
        },
      };
      if (config.privateKey) {
        payload.accessToken = config.privateKey;
      }

      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "CharlotteEsthyPOS/1.0 (Windows NT 10.0; Win64; x64)",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const errorMsg = `EmailJS error (${res.status}): ${text || "Failed to send email"}`;
        console.error("[EmailJS] Verification email failed:", errorMsg);
        return { ok: false, error: errorMsg };
      }
      return { ok: true };
    } catch (err: any) {
      const errorMsg = err?.message || "Network timeout connecting to EmailJS";
      console.error("[EmailJS] Network or timeout error sending verification email:", errorMsg);
      return { ok: false, error: errorMsg };
    }
  }

  // Resend fallback
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: [email],
        subject: "Verify your email for Charlotte Esthy POS",
        html: `
          <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 24px;">
            <h2>Charlotte Esthy POS</h2>
            <p>Hello ${fullName || "User"},</p>
            <p>Welcome to <strong>${businessName || "Charlotte Esthy"}</strong>. Click below to verify your email address:</p>
            <p style="margin: 24px 0;"><a href="${link}" style="background: #0c4a9e; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Verify Email Address</a></p>
            <p style="font-size: 12px; color: #64748b;">Or paste: ${link}</p>
          </div>
        `,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Resend error (${res.status}): ${text}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to deliver email" };
  }
}

export function generateStaffInvitationHtml({
  businessName,
  fullName,
  roleDisplay,
  email,
  defaultPassword,
  loginUrl,
  adderTitle,
  adderEmail,
}: {
  businessName: string;
  fullName: string;
  roleDisplay: string;
  email: string;
  defaultPassword?: string;
  loginUrl: string;
  adderTitle: string;
  adderEmail: string;
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to ${businessName}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);">
          <tr>
            <td align="center" style="padding: 36px 32px 24px 32px; border-bottom: 1px solid #f1f5f9;">
              <img src="https://raw.githubusercontent.com/JosephEstherMo3/Charlotte-EsthyPOS/main/public/logo.png" alt="Charlotte Esthy POS" width="140" style="display: block; border: 0;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 12px 0; color: #0a132c; font-size: 22px; font-weight: 700; line-height: 1.3;">
                Welcome to ${businessName}!
              </h1>
              <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 1.6;">
                Hello <strong>${fullName || "Staff Member"}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; color: #475569; font-size: 14px; line-height: 1.6;">
                Your staff account has been created on <strong>Charlotte Esthy POS</strong> with the role of <strong style="color: #0c4a9e;">${roleDisplay}</strong>. Your login credentials are provided below:
              </p>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 28px;">
                <tr>
                  <td style="padding: 20px;">
                    <p style="margin: 0 0 12px 0; color: #0f172a; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                      Your Login Details
                    </p>
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="35%" style="padding: 6px 0; color: #64748b; font-size: 13px;">Login Email:</td>
                        <td style="padding: 6px 0; color: #0f172a; font-size: 13px; font-weight: 600; font-family: monospace;">${email}</td>
                      </tr>
                      ${
                        defaultPassword
                          ? `<tr>
                        <td width="35%" style="padding: 6px 0; color: #64748b; font-size: 13px;">Default Password:</td>
                        <td style="padding: 6px 0; color: #0c4a9e; font-size: 14px; font-weight: 700; font-family: monospace; letter-spacing: 0.5px;">${defaultPassword}</td>
                      </tr>`
                          : ""
                      }
                      <tr>
                        <td width="35%" style="padding: 6px 0; color: #64748b; font-size: 13px;">Assigned Role:</td>
                        <td style="padding: 6px 0; color: #0f172a; font-size: 13px; font-weight: 600;">${roleDisplay}</td>
                      </tr>
                      <tr>
                        <td width="35%" style="padding: 6px 0; color: #64748b; font-size: 13px;">Authorized By:</td>
                        <td style="padding: 6px 0; color: #0f172a; font-size: 13px; font-weight: 600;">${adderTitle} (${adderEmail})</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${loginUrl}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0c4a9e 0%, #0284c7 100%); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(12, 74, 158, 0.25);">
                      Sign in to Store &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px 0; color: #64748b; font-size: 12px; line-height: 1.5; text-align: center;">
                If the button above does not work, copy and paste this link into your browser:<br />
                <a href="${loginUrl}" style="color: #0c4a9e; word-break: break-all; text-decoration: underline;">${loginUrl}</a>
              </p>
              <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
              <p style="margin: 0; color: #94a3b8; font-size: 11px; line-height: 1.5;">
                <strong>Security Notice:</strong> Please keep your credentials secure. For any assistance, contact your ${adderTitle} at <a href="mailto:${adderEmail}" style="color: #0c4a9e; font-weight: 600;">${adderEmail}</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                &copy; Charlotte Esthy Point of Sale. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Send cashier/staff account invitation email with a secure password creation link.
 */
export async function sendCashierInvitationEmail(
  config: NonNullable<ReturnType<typeof resetEmailConfiguration>>,
  email: string,
  token: string,
  fullName: string,
  businessName: string,
  role: string,
  defaultPassword?: string,
  addedBy?: {
    role: "owner" | "manager" | "cashier";
    name?: string;
    email?: string;
  },
): Promise<EmailResult> {
  const loginUrl = `${config.origin}/login?email=${encodeURIComponent(email)}`;
  const link = defaultPassword ? loginUrl : `${config.origin}/activate?token=${encodeURIComponent(token)}`;
  
  // Who added the member (Administrator or Store Manager)
  const isAdderOwner = !addedBy || addedBy.role === "owner";
  const adderTitle = isAdderOwner ? "Store Administrator" : "Store Manager";
  const adderEmail = isAdderOwner ? "admin.charlotteesthy49@gmail.com" : "manager.charlotteesthy49@gmail.com";
  const fromName = isAdderOwner ? "Charlotte Esthy Admin" : `Charlotte Esthy Manager (${addedBy?.name || "Manager"})`;
  
  // Role of the new staff member
  const roleDisplay = role === "owner" ? "Administrator" : role === "manager" ? "Store Manager" : "Cashier";

  // 1. Direct Gmail SMTP (100% free, zero watermarks, zero EmailJS ads)
  if (config.provider === "gmail") {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: config.user,
          pass: config.pass,
        },
      });

      await transporter.sendMail({
        from: `"${fromName}" <${config.user}>`,
        to: email,
        replyTo: adderEmail,
        subject: `Official Notification: You have been added to ${businessName} as ${roleDisplay}`,
        html: generateStaffInvitationHtml({
          businessName,
          fullName,
          roleDisplay,
          email,
          defaultPassword,
          loginUrl,
          adderTitle,
          adderEmail,
        }),
      });

      return { ok: true };
    } catch (err: any) {
      console.error("[Gmail SMTP] Invitation email failed:", err);
      return { ok: false, error: err?.message || "Failed to send email via Gmail" };
    }
  }

  if (config.provider === "emailjs") {
    try {
      const payload: Record<string, unknown> = {
        service_id: config.serviceId,
        template_id: config.templateId,
        user_id: config.publicKey,
        template_params: {
          from_name: fromName,
          sender_name: fromName,
          from_email: adderEmail,
          sender_email: adderEmail,
          reply_to: adderEmail,
          support_email: adderEmail,
          added_by_title: adderTitle,
          added_by_name: addedBy?.name || adderTitle,
          added_by_email: adderEmail,
          to_name: fullName || "Staff Member",
          name: fullName || "Staff Member",
          user_name: fullName || "Staff Member",
          to_email: email,
          user_email: email,
          email,
          default_password: defaultPassword || "",
          password: defaultPassword || "",
          activation_link: link,
          verification_link: link,
          login_link: loginUrl,
          link,
          token,
          business_name: businessName || "Charlotte Esthy POS",
          company_name: businessName || "Charlotte Esthy POS",
          role: roleDisplay,
          logo_url: "https://raw.githubusercontent.com/JosephEstherMo3/Charlotte-EsthyPOS/main/public/logo.png",
          app_url: config.origin,
          subject: `Official Notification: You have been added to ${businessName} as ${roleDisplay}`,
        },
      };
      if (config.privateKey) {
        payload.accessToken = config.privateKey;
      }

      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "CharlotteEsthyPOS/1.0 (Windows NT 10.0; Win64; x64)",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const errorMsg = `EmailJS error (${res.status}): ${text || "Failed to send email"}`;
        console.error("[EmailJS] Cashier invitation email failed:", errorMsg);
        return { ok: false, error: errorMsg };
      }
      return { ok: true };
    } catch (err: any) {
      const errorMsg = err?.message || "Network timeout connecting to EmailJS";
      console.error("[EmailJS] Network or timeout error sending invitation email:", errorMsg);
      return { ok: false, error: errorMsg };
    }
  }

  // Resend fallback
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: [email],
        subject: `You have been invited to join ${businessName} as ${roleDisplay}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; background: #fff; padding: 32px; border-radius: 16px; border: 1px solid #e2e8f0;">
            <h2 style="color: #0a132c; margin-top: 0;">Charlotte Esthy POS</h2>
            <p>Hello <strong>${fullName}</strong>,</p>
            <p>You have been invited by the store owner to join <strong>${businessName}</strong> as a <strong>${roleDisplay}</strong>.</p>
            <p>Please click the button below to activate your account and set your password:</p>
            <div style="margin: 28px 0;">
              <a href="${link}" style="background: #0c4a9e; color: #fff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: bold; display: inline-block;">
                Activate Account &rarr;
              </a>
            </div>
            <p style="font-size: 12px; color: #64748b;">Or paste this activation link into your browser:<br/><span style="color: #0c4a9e;">${link}</span></p>
            <p style="font-size: 12px; color: #94a3b8; margin-top: 24px;">This activation link expires in 48 hours. If you did not expect this invitation, you can ignore this email.</p>
          </div>
        `,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Resend error (${res.status}): ${text}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to deliver email" };
  }
}

/**
 * Send password reset email via EmailJS or Resend.
 */
export async function sendResetEmail(
  config: NonNullable<ReturnType<typeof resetEmailConfiguration>>,
  email: string,
  token: string,
): Promise<EmailResult> {
  const link = `${config.origin}/reset-password?token=${encodeURIComponent(token)}`;

  if (config.provider === "gmail") {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: config.user,
          pass: config.pass,
        },
      });

      await transporter.sendMail({
        from: `"Charlotte Esthy Security" <${config.user}>`,
        to: email,
        replyTo: "admin.charlotteesthy49@gmail.com",
        subject: "Reset your Charlotte Esthy password",
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);">
          <tr>
            <td align="center" style="padding: 36px 32px 24px 32px; border-bottom: 1px solid #f1f5f9;">
              <img src="https://raw.githubusercontent.com/JosephEstherMo3/Charlotte-EsthyPOS/main/public/logo.png" alt="Charlotte Esthy POS" width="140" style="display: block; border: 0;" />
            </td>
          </tr>
          <tr>
            <td style="padding: 32px;">
              <h1 style="margin: 0 0 12px 0; color: #0a132c; font-size: 22px; font-weight: 700;">
                Password Reset Request
              </h1>
              <p style="margin: 0 0 20px 0; color: #475569; font-size: 14px; line-height: 1.6;">
                We received a request to reset the password for your account associated with <strong>${email}</strong>.
              </p>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <a href="${link}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #0c4a9e 0%, #0284c7 100%); color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 12px rgba(12, 74, 158, 0.25);">
                      Reset My Password &rarr;
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 16px 0; color: #64748b; font-size: 12px; line-height: 1.5; text-align: center;">
                If you did not request this password reset, you can safely ignore this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                &copy; Charlotte Esthy Point of Sale. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
      });

      return { ok: true };
    } catch (err: any) {
      console.error("[Gmail SMTP] Password reset email failed:", err);
      return { ok: false, error: err?.message || "Failed to send email via Gmail" };
    }
  }

  if (config.provider === "emailjs") {
    try {
      const payload: Record<string, unknown> = {
        service_id: config.serviceId,
        template_id: config.resetTemplateId,
        user_id: config.publicKey,
        template_params: {
          from_name: "Charlotte Esthy Security",
          sender_name: "Charlotte Esthy Security",
          from_email: "security@charlotteesthy.com",
          reply_to: "charlotteesthy49@gmail.com",
          to_email: email,
          user_email: email,
          email,
          reset_link: link,
          activation_link: link,
          verification_link: link,
          link,
          token,
          logo_url: "https://raw.githubusercontent.com/JosephEstherMo3/Charlotte-EsthyPOS/main/public/logo.png",
          support_email: "charlotteesthy49@gmail.com",
          app_url: config.origin,
          subject: "Reset your Charlotte Esthy password",
        },
      };
      if (config.privateKey) {
        payload.accessToken = config.privateKey;
      }

      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "CharlotteEsthyPOS/1.0 (Windows NT 10.0; Win64; x64)",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const errorMsg = `EmailJS error (${res.status}): ${text || "Failed to send reset email"}`;
        console.error("[EmailJS] Reset email failed:", errorMsg);
        return { ok: false, error: errorMsg };
      }
      return { ok: true };
    } catch (err: any) {
      const errorMsg = err?.message || "Network timeout connecting to EmailJS";
      console.error("[EmailJS] Network or timeout error sending reset email:", errorMsg);
      return { ok: false, error: errorMsg };
    }
  }

  // Resend fallback
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: [email],
        subject: "Reset your Charlotte Esthy password",
        html: `<p>We received a request to reset your Charlotte Esthy password.</p><p><a href="${link}">Choose a new password</a></p><p>This link expires in 1 hour.</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `Resend error (${res.status}): ${text}` };
    }
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to deliver email" };
  }
}
