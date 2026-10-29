"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { BarChart3, Boxes, CheckCircle2, Eye, EyeOff, ReceiptText, ShieldCheck } from "lucide-react";
import { Attribution, BrandLogo } from "@/components/brand";
import { Alert, Button, TextField } from "@/components/ui";
import { ApiError, apiFetch, useApi } from "@/lib/client";
import { clearEmbeddedSession, getEmbeddedToken, setEmbeddedSession } from "@/lib/embedded-session";

export type AuthMode = "login" | "register" | "forgot-password" | "reset-password" | "verify-email";

function PasswordField({
  label,
  value,
  onChange,
  error,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete: string;
  hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <TextField
        label={label}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        error={error}
        hint={hint}
        autoComplete={autoComplete}
        required
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2 top-[30px] rounded p-1 text-slate-500 hover:text-slate-800"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function useSubmit() {
  const router = useRouter();
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
  function enter(session: { token: string; expiresAt: string }) {
    setEmbeddedSession(session);
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
    // Already signed in in this tab (cookie or fallback credential).
    let alive = true;
    if (!getEmbeddedToken()) return;
    apiFetch<{ authenticated: boolean }>("/api/auth/session")
      .then(({ authenticated }) => {
        if (alive && authenticated) s.enter({ token: getEmbeddedToken()!, expiresAt: "" });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form
      action="#"
      onSubmit={(e) => {
        e.preventDefault();
        s.run(async () => {
          clearEmbeddedSession();
          const result = await apiFetch<{ session: { token: string; expiresAt: string } }>("/api/auth/login", {
            method: "POST",
            body: { email, password },
          });
          s.enter(result.session);
        });
      }}
      className="space-y-4"
      noValidate
    >
      {params.get("expired") && (
        <Alert tone="warning">Your session ended before its normal expiry, so we signed you out for security. Please sign in again.</Alert>
      )}
      {params.get("reset") && <Alert tone="success">Password updated. You can now sign in.</Alert>}
      {params.get("verified") && (
        <Alert tone="success">Your account has been created successfully. Sign in to continue.</Alert>
      )}
      {s.error && <Alert tone="error">{s.error}</Alert>}
      <TextField label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={s.fields.email} autoComplete="email" required autoFocus />
      <PasswordField label="Password" value={password} onChange={setPassword} error={s.fields.password} autoComplete="current-password" />
      <div className="flex justify-end">
        <Link href="/forgot-password" className="text-sm font-medium text-emerald-700 hover:text-emerald-800">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" size="lg" className="w-full" loading={s.loading}>
        {s.loading ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-xs text-slate-500">
        Authorized personnel only. Contact your administrator for access.
      </p>
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
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <p className="font-semibold text-emerald-900">Your account has been created successfully.</p>
          <p className="mt-1 text-sm text-emerald-800">
            {verificationRequired
              ? `We sent a verification link to ${email}. Open it to verify your email address, then sign in with the password you just chose.`
              : `You can now sign in with ${email} and the password you just chose.`}
          </p>
        </div>
      </div>
      {!verificationRequired && !emailConfigured && (
        <Alert tone="info">
          Email delivery is not configured on this server, so no verification message could be sent. Your address is
          recorded as verified — see the README to switch on emailed verification.
        </Alert>
      )}
      <Link
        href={verificationRequired ? "/login?verified=1" : "/login"}
        className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-navy-900 px-5 text-base font-medium text-white hover:bg-navy-800"
      >
        Go to sign in
      </Link>
    </div>
  );
}

function RegisterForm() {
  return (
    <div className="space-y-6 text-center">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-left">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-amber-900">Registration Restricted</h3>
            <p className="text-sm text-amber-800">
              This point of sale system is for authorized users only. Public self-registration is disabled.
            </p>
            <p className="text-xs text-amber-700 pt-1">
              If you need access as a cashier or manager, please contact your store owner to have your account added.
            </p>
          </div>
        </div>
      </div>
      <Link
        href="/login"
        className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-navy-900 px-4 text-sm font-medium text-white transition-colors hover:bg-navy-800"
      >
        Return to Sign in
      </Link>
    </div>
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
        <Link href="/login" className="block text-center text-sm font-medium text-emerald-700">
          Go to sign in
        </Link>
      </div>
    );
  }
  if (state === "working") {
    return <p className="text-sm text-slate-600">Verifying your email address…</p>;
  }
  if (state === "error") {
    return (
      <div className="space-y-4">
        <Alert tone="error">{error}</Alert>
        <Link href="/login" className="block text-center text-sm font-medium text-emerald-700">
          Go to sign in
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <p className="font-semibold text-emerald-900">Your account has been created successfully.</p>
          <p className="mt-1 text-sm text-emerald-800">Your email address is verified. Sign in to start using Charlotte Esthy.</p>
        </div>
      </div>
      <Link
        href="/login?verified=1"
        className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-navy-900 px-5 text-base font-medium text-white hover:bg-navy-800"
      >
        Go to sign in
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
  if (!config.data) return <p className="text-sm text-slate-600">Checking recovery options…</p>;

  if (!config.data.resetEmailConfigured) {
    return (
      <div className="space-y-4">
        <Alert tone="warning">
          <strong>Email password recovery isn’t configured on this server.</strong> No email can be sent and no reset
          link has been created.
        </Alert>
        <div className="space-y-2 text-sm text-slate-700">
          <p>
            <strong>Know your password?</strong>{" "}
            <Link href="/login" className="font-medium text-emerald-700 underline">
              Sign in here
            </Link>
            . If you forgot it, only someone with authorised server access can reset it until email delivery is
            configured.
          </p>
          <p>
            <strong>Staff account?</strong> Your business owner can set a new password under Team &amp; Permissions.
            Managers cannot reset accounts.
          </p>
          <p className="text-slate-500">
            Server operators: see the “Password recovery” section in the README for the secure command and email setup.
          </p>
        </div>
      </div>
    );
  }

  if (requested) {
    return (
      <div className="space-y-4">
        <Alert tone="info">
          If <strong>{email}</strong> belongs to an account and the email provider accepts the request, you’ll receive a
          reset link. Check your inbox and spam folder.
        </Alert>
        <Link href="/login" className="block text-center text-sm font-medium text-emerald-700">
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
      <TextField label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={s.fields.email} autoComplete="email" required autoFocus />
      <Button type="submit" size="lg" className="w-full" loading={s.loading}>
        Request reset email
      </Button>
      <Link href="/login" className="block text-center text-sm font-medium text-emerald-700">
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
      <PasswordField label="New password" value={password} onChange={setPassword} error={s.fields.password} autoComplete="new-password" hint="At least 8 characters." />
      <TextField label="Confirm new password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={s.fields.confirm} autoComplete="new-password" required />
      <Button type="submit" size="lg" className="w-full" loading={s.loading}>
        Update password
      </Button>
    </form>
  );
}

const COPY: Record<AuthMode, { title: string; subtitle: string }> = {
  login: { title: "Welcome back", subtitle: "Sign in to continue to your point of sale." },
  register: { title: "Authorized access only", subtitle: "Public self-registration is disabled for this system." },
  "forgot-password": { title: "Password recovery", subtitle: "Check the available recovery options for your account." },
  "reset-password": { title: "Choose a new password", subtitle: "Pick a strong password you haven't used before." },
  "verify-email": { title: "Verify your email", subtitle: "One quick step to finish creating your account." },
};

export function AuthScreen({ mode }: { mode: AuthMode }) {
  const copy = COPY[mode];
  let form: ReactNode;
  if (mode === "login") form = <LoginForm />;
  else if (mode === "register") form = <RegisterForm />;
  else if (mode === "forgot-password") form = <ForgotForm />;
  else if (mode === "verify-email") form = <VerifyEmailForm />;
  else form = <ResetForm />;

  const features = [
    { icon: ReceiptText, text: "Receipts you can print, download and share" },
    { icon: Boxes, text: "Live inventory with full stock history" },
    { icon: BarChart3, text: "Sales analytics from your real data" },
    { icon: ShieldCheck, text: "Role-based access for every team member" },
  ];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden overflow-hidden bg-navy-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/10 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-navy-600/30 blur-3xl" />
        <BrandLogo light size={44} />
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Sell faster. Know your numbers. Stay in control.</h2>
          <p className="mt-4 text-navy-200">A calm, dependable point of sale built for shops that care about every receipt.</p>
          <ul className="mt-8 space-y-4">
            {features.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm text-navy-100">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-emerald-400">
                  <f.icon className="h-[18px] w-[18px]" />
                </span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
        <Attribution light className="relative" />
      </aside>

      <main className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <BrandLogo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy-900">{copy.title}</h1>
          <p className="mb-6 mt-1.5 text-sm text-slate-500">{copy.subtitle}</p>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">{form}</div>
          <Attribution className="mt-8" />
        </div>
      </main>
    </div>
  );
}
