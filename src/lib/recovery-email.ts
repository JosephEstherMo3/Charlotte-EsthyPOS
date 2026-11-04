import dns from "node:dns";

try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

export type EmailConfig =
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

  // 1. Check EmailJS configuration
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

  if (config.provider === "emailjs") {
    try {
      const payload: Record<string, unknown> = {
        service_id: config.serviceId,
        template_id: config.templateId,
        user_id: config.publicKey,
        template_params: {
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
): Promise<EmailResult> {
  const link = `${config.origin}/activate?token=${encodeURIComponent(token)}`;
  const roleDisplay = role === "cashier" ? "Cashier" : role === "manager" ? "Store Manager" : "Staff Member";

  if (config.provider === "emailjs") {
    try {
      const payload: Record<string, unknown> = {
        service_id: config.serviceId,
        template_id: config.templateId,
        user_id: config.publicKey,
        template_params: {
          to_name: fullName || "Staff Member",
          name: fullName || "Staff Member",
          user_name: fullName || "Staff Member",
          to_email: email,
          user_email: email,
          email,
          activation_link: link,
          verification_link: link,
          link,
          token,
          business_name: businessName || "Charlotte Esthy POS",
          company_name: businessName || "Charlotte Esthy POS",
          role: roleDisplay,
          logo_url: "https://raw.githubusercontent.com/JosephEstherMo3/Charlotte-EsthyPOS/main/public/logo.png",
          support_email: "charlotteesthy49@gmail.com",
          app_url: config.origin,
          subject: `You have been invited to join ${businessName} as ${roleDisplay}`,
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

  if (config.provider === "emailjs") {
    try {
      const payload: Record<string, unknown> = {
        service_id: config.serviceId,
        template_id: config.resetTemplateId,
        user_id: config.publicKey,
        template_params: {
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
