"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  BarChart3,
  Boxes,
  CheckCircle2,
  Eye,
  EyeOff,
  Handshake,
  Loader2,
  Lock,
  LogIn,
  Mail,
  Printer,
  ShieldCheck,
  Store,
  User,
  UserPlus,
} from "lucide-react";
import { ATTRIBUTION, BrandLogo } from "@/components/brand";
import { Alert, cn } from "@/components/ui";
import { ApiError, apiFetch, useApi } from "@/lib/client";
import { clearEmbeddedSession, getEmbeddedToken, setEmbeddedSession } from "@/lib/embedded-session";

export type AuthMode = "login" | "register" | "forgot-password" | "reset-password" | "verify-email";

function AuthField({
  id,
  label,
  icon: Icon,
  error,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  icon?: typeof Mail;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-800">
        {Icon && <Icon className="h-4 w-4 text-navy-900 shrink-0" aria-hidden />}
        <span>
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-xs font-medium text-red-600 pl-1">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-500 pl-1">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const inputCls = (invalid = false) =>
  cn(
    "h-12 w-full rounded-2xl border bg-white px-4 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400",
    "focus:outline-none focus:ring-4",
    invalid
      ? "border-red-400 focus:border-red-500 focus:ring-red-500/10"
      : "border-slate-200 hover:border-slate-300 focus:border-blue-500 focus:ring-blue-500/15"
  );

function PasswordField({
  id = "pwd",
  label = "Password",
  value,
  onChange,
  error,
  autoComplete,
  hint,
  placeholder = "Enter your password",
}: {
  id?: string;
  label?: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete: string;
  hint?: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <AuthField id={id} label={label} icon={Lock} error={error} hint={hint} required>
      <div className="relative">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
          className={cn(inputCls(!!error), "pr-11")}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-slate-700 transition-colors"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </AuthField>
  );
}

function useSubmit() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  async function run(fn: () => Promise<void>, e?: FormEvent) {
    e?.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    setFields({});
    try {
      await fn();
    } catch (err) {
      const ae = err as ApiError;
      setError(ae.message || "Something went wrong. Please try again.");
      setFields(ae.fieldErrors ?? {});
    } finally {
      setLoading(false);
    }
  }

  /** Store the fallback credential, then open the dashboard. */
  function enter(session?: { token: string; expiresAt: string }) {
    if (session && session.expiresAt) {
      setEmbeddedSession(session);
    }
    window.location.href = "/dashboard";
  }

  return { loading, error, fields, run, enter, setError, setFields };
}

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const s = useSubmit();

  useEffect(() => {
    let alive = true;
    if (!getEmbeddedToken()) return;
    apiFetch<{ authenticated: boolean }>("/api/auth/session")
      .then(({ authenticated }) => {
        if (alive && authenticated) s.enter();
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    s.run(async () => {
      clearEmbeddedSession();
      const result = await apiFetch<{ session: { token: string; expiresAt: string } }>("/api/auth/login", {
        method: "POST",
        body: { email: email.trim().toLowerCase(), password },
      });
      s.enter(result.session);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {params.get("expired") && (
        <Alert tone="warning">Your session ended before its normal expiry, so we signed you out for security. Please sign in again.</Alert>
      )}
      {params.get("reset") && <Alert tone="success">Password updated. You can now sign in.</Alert>}
      {params.get("verified") && (
        <Alert tone="success">Your account has been created successfully. Sign in to continue.</Alert>
      )}
      {s.error && <Alert tone="error">{s.error}</Alert>}

      <AuthField id="login-email" label="Email address" icon={Mail} error={s.fields.email} required>
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email address"
          autoComplete="email"
          required
          autoFocus
          className={inputCls(!!s.fields.email)}
        />
      </AuthField>

      <PasswordField
        id="login-pwd"
        label="Password"
        value={password}
        onChange={setPassword}
        error={s.fields.password}
        autoComplete="current-password"
        placeholder="Enter your password"
      />

      <div className="flex justify-end pt-1">
        <Link href="/forgot-password" className="text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline">
          Forgot password? &gt;
        </Link>
      </div>

      <button
        type="submit"
        disabled={s.loading}
        className="mt-2 flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-600 to-sky-500 px-6 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:from-blue-700 hover:to-sky-600 hover:shadow-blue-500/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {s.loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
        <span>{s.loading ? "Signing in…" : "Sign in"}</span>
      </button>

      <div className="mt-4 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 text-center">
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-700">
          <ShieldCheck className="h-4 w-4 text-blue-600" />
          <span>Authorized Staff Access Only</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-500 leading-normal">
          Accounts are provisioned by store owners. Contact your administrator or manager for credentials.
        </p>
      </div>
    </form>
  );
}

function CreatedPanel({
  email,
  verificationRequired,
  emailConfigured,
}: {
  email: string;
  verificationRequired: boolean;
  emailConfigured: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <p className="font-bold text-emerald-900">Your account has been created successfully.</p>
          <p className="mt-1.5 text-sm leading-relaxed text-emerald-800">
            {verificationRequired
              ? `We sent a verification link to ${email}. Open it to verify your email address, then sign in with the password you just chose.`
              : `You can now sign in with ${email} and the password you just chose.`}
          </p>
        </div>
      </div>
      {!verificationRequired && !emailConfigured && (
        <Alert tone="info">
          Email delivery is not configured on this server, so no verification message could be sent. Your address is
          recorded as verified.
        </Alert>
      )}
      <Link
        href={verificationRequired ? "/login?verified=1" : "/login"}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-6 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-700 hover:to-sky-600 active:scale-[0.99]"
      >
        <LogIn className="h-5 w-5" />
        <span>Go to sign in</span>
      </Link>
    </div>
  );
}

function AuthorizedOnlyPanel() {
  return (
    <div className="space-y-6 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 border border-amber-200 shadow-sm">
        <ShieldCheck className="h-8 w-8" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold text-slate-900">
          Self-Registration Closed
        </h2>
        <p className="text-sm leading-relaxed text-slate-600">
          Charlotte Esthy POS is a private store system. Accounts are only issued to authorized staff by store administrators in <strong>Team &amp; Permissions</strong>.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-left space-y-2.5">
        <p className="text-xs font-semibold text-slate-700">Need an account?</p>
        <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
          <li>Ask your store owner or manager to add your account from their dashboard.</li>
          <li>Already received your login credentials? Sign in below.</li>
        </ul>
      </div>

      <Link
        href="/login"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-6 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-700 hover:to-sky-600 active:scale-[0.99]"
      >
        <LogIn className="h-5 w-5" />
        <span>Return to Sign in</span>
      </Link>
    </div>
  );
}

function RegisterForm() {
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState<{ email: string; verificationRequired: boolean } | null>(null);
  const config = useApi<{ resetEmailConfigured: boolean; allowPublicRegistration?: boolean }>("/api/auth/config");
  const s = useSubmit();

  if (config.data && !config.data.allowPublicRegistration) {
    return <AuthorizedOnlyPanel />;
  }

  if (done) {
    return (
      <CreatedPanel
        email={done.email}
        verificationRequired={done.verificationRequired}
        emailConfigured={Boolean(config.data?.resetEmailConfigured)}
      />
    );
  }

  const handleRegister = (e: FormEvent) => {
    e.preventDefault();
    s.run(async () => {
      const res = await apiFetch<{ ok: boolean; verificationRequired: boolean; email: string }>("/api/auth/register", {
        method: "POST",
        body: { fullName, businessName, email: email.trim().toLowerCase(), password },
      });
      setDone({ email: res.email, verificationRequired: res.verificationRequired });
    });
  };

  return (
    <form onSubmit={handleRegister} className="space-y-4" noValidate>
      {s.error && <Alert tone="error">{s.error}</Alert>}

      <AuthField id="reg-name" label="Full name" icon={User} error={s.fields.fullName} required>
        <input
          id="reg-name"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Enter your full name"
          autoComplete="name"
          required
          autoFocus
          className={inputCls(!!s.fields.fullName)}
        />
      </AuthField>

      <AuthField id="reg-biz" label="Store or Boutique name" icon={Store} error={s.fields.businessName} required>
        <input
          id="reg-biz"
          type="text"
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          placeholder="Enter your store or boutique name"
          required
          className={inputCls(!!s.fields.businessName)}
        />
      </AuthField>

      <AuthField id="reg-email" label="Email address" icon={Mail} error={s.fields.email} required>
        <input
          id="reg-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email address"
          autoComplete="email"
          required
          className={inputCls(!!s.fields.email)}
        />
      </AuthField>

      <PasswordField
        id="reg-pwd"
        label="Password"
        value={password}
        onChange={setPassword}
        error={s.fields.password}
        autoComplete="new-password"
        hint="At least 8 characters."
        placeholder="Enter your password"
      />

      <button
        type="submit"
        disabled={s.loading}
        className="mt-2 flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-600 to-sky-500 px-6 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:from-blue-700 hover:to-sky-600 hover:shadow-blue-500/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {s.loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
        <span>{s.loading ? "Creating account…" : "Create store account"}</span>
      </button>

      <p className="text-center text-sm text-slate-500 pt-2">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-blue-600 hover:text-blue-700 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function VerifyEmailForm() {
  const token = useSearchParams().get("token") ?? "";
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token);
  const [state, setState] = useState<"working" | "done" | "error">(valid ? "working" : "error");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    apiFetch("/api/auth/verify", { method: "POST", body: { token } })
      .then(() => {
        if (alive) setState("done");
      })
      .catch((err: ApiError) => {
        if (!alive) return;
        setError(err.message || "We could not verify this link. Please try again.");
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, [token, valid]);

  if (!valid) {
    return (
      <div className="space-y-4">
        <Alert tone="error">This verification link is incomplete. Open the link from your email again.</Alert>
        <Link href="/login" className="block text-center text-sm font-semibold text-blue-600 hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }
  if (state === "working") {
    return <p className="text-sm text-slate-600 text-center py-4">Verifying your email address…</p>;
  }
  if (state === "error") {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error}</Alert>
        <Link href="/login" className="block text-center text-sm font-semibold text-blue-600 hover:underline">
          Go to sign in
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5 shadow-sm">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <p className="font-bold text-emerald-900">Your account has been created successfully.</p>
          <p className="mt-1.5 text-sm leading-relaxed text-emerald-800">Your email address is verified. Sign in to start using Charlotte Esthy.</p>
        </div>
      </div>
      <Link
        href="/login?verified=1"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 px-6 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-700 hover:to-sky-600 active:scale-[0.99]"
      >
        <LogIn className="h-5 w-5" />
        <span>Go to sign in</span>
      </Link>
    </div>
  );
}

function ForgotForm() {
  const [email, setEmail] = useState("");
  const [requested, setRequested] = useState(false);
  const config = useApi<{ resetEmailConfigured: boolean }>("/api/auth/config");
  const s = useSubmit();

  if (config.error && !config.data) return <Alert tone="error">{config.error}</Alert>;
  if (!config.data) return <p className="text-sm text-slate-600 text-center py-4">Checking recovery options…</p>;

  if (!config.data.resetEmailConfigured) {
    return (
      <div className="space-y-4">
        <Alert tone="warning">
          <strong>Email password recovery isn&apos;t configured on this server.</strong> No email can be sent and no reset
          link has been created.
        </Alert>
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            <strong>Know your password?</strong>{" "}
            <Link href="/login" className="font-semibold text-blue-600 underline">
              Sign in here
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  if (requested) {
    return (
      <div className="space-y-4">
        <Alert tone="info">
          If <strong>{email}</strong> belongs to an account, you&apos;ll receive a reset link shortly.
        </Alert>
        <Link href="/login" className="block text-center text-sm font-semibold text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) =>
        s.run(async () => {
          await apiFetch("/api/auth/forgot", { method: "POST", body: { email } });
          setRequested(true);
        }, e)
      }
    >
      {s.error && <Alert tone="error">{s.error}</Alert>}
      <AuthField id="forgot-email" label="Email address" icon={Mail} error={s.fields.email} required>
        <input
          id="forgot-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email address"
          autoComplete="email"
          required
          autoFocus
          className={inputCls(!!s.fields.email)}
        />
      </AuthField>
      <button
        type="submit"
        disabled={s.loading}
        className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-600 to-sky-500 px-6 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-700 hover:to-sky-600 active:scale-[0.99] disabled:opacity-60"
      >
        {s.loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
        <span>{s.loading ? "Requesting…" : "Request reset email"}</span>
      </button>
      <Link href="/login" className="block text-center text-sm font-semibold text-blue-600 hover:underline pt-1">
        Back to sign in
      </Link>
    </form>
  );
}

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const s = useSubmit();
  if (!token) {
    return <Alert tone="error">This reset link is missing its token. Please request a new link from the sign-in page.</Alert>;
  }
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) =>
        s.run(async () => {
          if (password !== confirm) throw new ApiError("Passwords do not match", 0, { confirm: "Passwords do not match" });
          await apiFetch("/api/auth/reset", { method: "POST", body: { token, password } });
          window.location.href = "/login?reset=1";
        }, e)
      }
    >
      {s.error && <Alert tone="error">{s.error}</Alert>}
      <PasswordField
        id="new-pwd"
        label="New password"
        value={password}
        onChange={setPassword}
        error={s.fields.password}
        autoComplete="new-password"
        hint="At least 8 characters."
        placeholder="Enter your new password"
      />
      <PasswordField
        id="confirm-pwd"
        label="Confirm new password"
        value={confirm}
        onChange={setConfirm}
        error={s.fields.confirm}
        autoComplete="new-password"
        placeholder="Confirm your new password"
      />
      <button
        type="submit"
        disabled={s.loading}
        className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-600 to-sky-500 px-6 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all hover:from-blue-700 hover:to-sky-600 active:scale-[0.99] disabled:opacity-60"
      >
        {s.loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Lock className="h-5 w-5" />}
        <span>{s.loading ? "Updating…" : "Update password"}</span>
      </button>
    </form>
  );
}

const COPY: Record<AuthMode, { title: string; subtitle: string }> = {
  login: { title: "Welcome back", subtitle: "Sign in to continue to your point of sale." },
  register: { title: "Welcome back", subtitle: "Sign in to continue to your point of sale." },
  "forgot-password": { title: "Password recovery", subtitle: "Enter your email to receive recovery instructions." },
  "reset-password": { title: "Choose a new password", subtitle: "Pick a strong password you haven't used before." },
  "verify-email": { title: "Verify your email", subtitle: "One quick step to finish creating your account." },
};

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const isRegister = mode === "register";
  const title = isRegister ? "Authorized Access" : COPY[mode].title;
  const subtitle = isRegister ? "Charlotte Esthy POS staff portal" : COPY[mode].subtitle;

  let form: ReactNode;
  if (mode === "login") form = <LoginForm />;
  else if (mode === "register") form = <RegisterForm />;
  else if (mode === "forgot-password") form = <ForgotForm />;
  else if (mode === "verify-email") form = <VerifyEmailForm />;
  else form = <ResetForm />;

  const features = [
    {
      icon: Printer,
      text: "Receipts you can print, download and share",
      iconBg: "bg-blue-600/30 text-sky-300 border border-blue-400/30 shadow-[0_0_15px_rgba(56,189,248,0.25)]",
    },
    {
      icon: Boxes,
      text: "Live inventory with full stock history",
      iconBg: "bg-emerald-600/30 text-emerald-300 border border-emerald-400/30 shadow-[0_0_15px_rgba(52,211,153,0.25)]",
    },
    {
      icon: BarChart3,
      text: "Sales analytics from your real data",
      iconBg: "bg-purple-600/30 text-purple-300 border border-purple-400/30 shadow-[0_0_15px_rgba(192,132,252,0.25)]",
    },
    {
      icon: ShieldCheck,
      text: "Role-based access for every team member",
      iconBg: "bg-amber-600/30 text-amber-300 border border-amber-400/30 shadow-[0_0_15px_rgba(251,191,36,0.25)]",
    },
  ];

  return (
    <div className="relative min-h-dvh w-full overflow-hidden bg-[#f8fafc] flex flex-col lg:flex-row">
      {/* ──────────────── LEFT HERO PANEL (DESKTOP) ──────────────── */}
      <aside className="relative hidden lg:flex lg:w-[48%] xl:w-[50%] flex-col justify-between overflow-hidden bg-gradient-to-b from-[#020b22] via-[#061743] to-[#030e2f] p-10 xl:p-14 text-white">
        {/* Ambient radial glows */}
        <div aria-hidden className="pointer-events-none absolute -left-20 -top-20 h-96 w-96 rounded-full bg-sky-500/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute right-10 top-1/3 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />

        {/* Ambient POS Terminal illustration on counter */}
        <div aria-hidden className="pointer-events-none absolute -right-6 bottom-16 hidden xl:block w-72 select-none opacity-85 drop-shadow-[0_20px_40px_rgba(2,132,199,0.35)]">
          <img src="/pos-device-wide.png" alt="POS Terminal" className="h-auto w-full object-contain" />
        </div>

        {/* Flowing decorative wave divider on right edge */}
        <div aria-hidden className="pointer-events-none absolute -right-[1px] inset-y-0 hidden lg:block w-28 xl:w-36 overflow-visible z-10">
          <svg viewBox="0 0 120 800" preserveAspectRatio="none" fill="none" className="h-full w-full">
            <path
              d="M-20,0 C90,160 30,380 95,580 C130,700 80,780 120,800 L120,0 Z"
              fill="url(#cyanGlow)"
              opacity="0.3"
            />
            <path
              d="M-10,0 C85,160 25,380 90,580 C125,700 75,780 115,800"
              stroke="#00d2ff"
              strokeWidth="4"
              strokeLinecap="round"
              opacity="0.75"
            />
            <path
              d="M0,0 C75,160 15,380 80,580 C115,700 65,780 105,800 L120,800 L120,0 Z"
              className="fill-[#f8fafc]"
            />
            <defs>
              <linearGradient id="cyanGlow" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00d2ff" />
                <stop offset="50%" stopColor="#0284c7" />
                <stop offset="100%" stopColor="#38bdf8" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Top Logo */}
        <div className="relative z-20">
          <BrandLogo light size={44} />
        </div>

        {/* Middle Value Proposition & Features */}
        <div className="relative z-20 my-auto py-8 max-w-lg">
          <h2 className="text-3xl sm:text-4xl xl:text-5xl font-bold leading-[1.15] tracking-tight text-white">
            Sell faster.<br />
            Know your numbers.<br />
            <span className="bg-gradient-to-r from-sky-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
              Stay in control.
            </span>
          </h2>
          <p className="mt-4 max-w-md text-sm sm:text-base leading-relaxed text-blue-100/80">
            A calm, dependable point of sale built for shops that care about every receipt.
          </p>

          <ul className="mt-8 space-y-4">
            {features.map((f) => (
              <li key={f.text} className="flex items-center gap-3.5 text-sm text-blue-50/90 font-medium">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", f.iconBg)}>
                  <f.icon className="h-5 w-5" />
                </span>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom Attribution with handshake icon */}
        <div className="relative z-20 flex items-center gap-3 text-xs text-blue-200/80">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-500/20 text-sky-300 shadow-sm">
            <Handshake className="h-4 w-4" />
          </div>
          <span className="italic">{ATTRIBUTION}</span>
          <span aria-hidden className="h-px flex-1 max-w-[140px] bg-gradient-to-r from-sky-400/50 to-transparent" />
        </div>
      </aside>

      {/* ──────────────── RIGHT FORM CONTAINER ──────────────── */}
      <main className="relative flex flex-1 flex-col items-center justify-center bg-gradient-to-br from-[#f8fafc] via-[#f1f5f9] to-[#e0f2fe]/40 px-4 py-10 sm:px-8 sm:py-16">
        {/* Subtle decorative dot grid pattern in top right */}
        <div aria-hidden className="pointer-events-none absolute right-6 top-6 sm:right-10 sm:top-10 grid grid-cols-6 gap-2.5 opacity-35">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          ))}
        </div>

        {/* Mobile Header Logo */}
        <div className="mb-6 flex justify-center lg:hidden">
          <BrandLogo size={44} />
        </div>

        {/* Floating White Card */}
        <div className="relative z-20 w-full max-w-[480px] rounded-[32px] border border-slate-100/90 bg-white p-7 sm:p-10 shadow-[0_25px_60px_-15px_rgba(2,132,199,0.12),0_10px_20px_-10px_rgba(15,23,42,0.06)]">
          {/* Top Avatar Circle Badge */}
          <div className="mx-auto mb-5 flex h-18 w-18 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-gradient-to-b from-sky-400 via-blue-500 to-blue-600 text-white shadow-xl shadow-blue-500/30 ring-8 ring-blue-50">
            <User className="h-9 w-9 sm:h-10 sm:w-10 fill-white/15" strokeWidth={2.4} />
          </div>

          {/* Title & Subtitle */}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-center">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500 text-center mb-6">
            {subtitle}
          </p>

          {/* Form Content */}
          {form}
        </div>

        {/* Footer Attribution on mobile */}
        <div className="mt-8 lg:hidden">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Handshake className="h-4 w-4 text-blue-600" />
            <span className="italic">{ATTRIBUTION}</span>
          </div>
        </div>
      </main>
    </div>
  );
}
