import "server-only";

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

/**
 * Email delivery configuration. Supports EmailJS and Resend.
 * Builds verification and password reset links pointing to a trusted application origin.
 */
export function resetEmailConfiguration(): EmailConfig | null {
  const appUrl = process.env.APP_URL?.trim() || "http://localhost:3000";
  let origin = "http://localhost:3000";
  try {
    const url = new URL(appUrl);
    origin = url.origin;
  } catch {
    /* fallback to default */
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
): Promise<boolean> {
  const link = `${config.origin}/verify-email?token=${encodeURIComponent(token)}`;

  if (config.provider === "emailjs") {
    try {
      const payload: Record<string, unknown> = {
        service_id: config.serviceId,
        template_id: config.templateId,
        user_id: config.publicKey,
        template_params: {
          to_name: fullName || "Valued User",
          to_email: email,
          user_email: email,
          email,
          verification_link: link,
          token,
          business_name: businessName || "Charlotte Esthy",
          app_url: config.origin,
          subject: "Verify your email for Charlotte Esthy",
        },
      };
      if (config.privateKey) {
        payload.accessToken = config.privateKey;
      }

      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[EmailJS] Verification email failed:", res.status, text);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[EmailJS] Network or timeout error sending verification email:", err);
      return false;
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
        subject: "Verify your email for Charlotte Esthy",
        html: `<p>Welcome to Charlotte Esthy.</p><p><a href="${link}">Verify your email address</a> to finish creating your account.</p><p>This link expires in 24 hours. If you did not create this account, you can ignore this email.</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Send password reset email via EmailJS or Resend.
 */
export async function sendResetEmail(
  config: NonNullable<ReturnType<typeof resetEmailConfiguration>>,
  email: string,
  token: string,
): Promise<boolean> {
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
          token,
          app_url: config.origin,
          subject: "Reset your Charlotte Esthy password",
        },
      };
      if (config.privateKey) {
        payload.accessToken = config.privateKey;
      }

      const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        console.error("[EmailJS] Reset email failed:", res.status, text);
        return false;
      }
      return true;
    } catch (err) {
      console.error("[EmailJS] Error sending reset email:", err);
      return false;
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
        html: `<p>We received a request to reset your Charlotte Esthy password.</p><p><a href="${link}">Choose a new password</a></p><p>This link expires in 60 minutes. If you did not request it, you can ignore this email.</p>`,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
