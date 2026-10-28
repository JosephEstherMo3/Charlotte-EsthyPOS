import "server-only";

/**
 * Password reset mail is available only when the provider, verified sender and
 * a trusted application origin have all been configured on the server. Never
 * build a password reset URL from an untrusted request Host header.
 */
export function resetEmailConfiguration(): { key: string; from: string; origin: string } | null {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const appUrl = process.env.APP_URL?.trim();
  if (!key || !from || !appUrl) return null;
  try {
    const url = new URL(appUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return { key, from, origin: url.origin };
  } catch {
    return null;
  }
}

/** Email-address confirmation link. Same provider and trusted-origin rules as password reset. */
export async function sendVerificationEmail(
  config: NonNullable<ReturnType<typeof resetEmailConfiguration>>,
  email: string,
  token: string,
): Promise<boolean> {
  const link = `${config.origin}/verify-email?token=${encodeURIComponent(token)}`;
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

/** Resend's documented POST /emails API. Secrets and reset links stay on the server. */
export async function sendResetEmail(config: NonNullable<ReturnType<typeof resetEmailConfiguration>>, email: string, token: string): Promise<boolean> {
  const link = `${config.origin}/reset-password?token=${encodeURIComponent(token)}`;
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
