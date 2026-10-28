"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { AppProvider, type AppValue } from "@/components/app-context";
import { AppShell } from "@/components/app-shell";
import { BrandLogo, Attribution } from "@/components/brand";
import { Alert, Button, Spinner } from "@/components/ui";
import { ApiError, apiFetch } from "@/lib/client";
import { clearEmbeddedSession, getEmbeddedToken } from "@/lib/embedded-session";

/**
 * The server cannot read sessionStorage during a page navigation. When there is
 * no httpOnly cookie it renders ONLY this gate (no private content or app
 * shell). The gate verifies the tab-scoped token against PostgreSQL through the
 * API and renders the app only after the server returns the business and role.
 */
export function EmbeddedAppGate({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AppValue | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => { setError(""); setAttempt((n) => n + 1); }, []);

  useEffect(() => {
    let alive = true;
    const token = getEmbeddedToken();
    if (!token) {
      // Nothing to verify — a plain sign-in prompt. Never claim a session expired
      // when the visitor simply has not signed in yet.
      window.location.replace("/login");
      return;
    }
    apiFetch<{ auth: AppValue }>("/api/auth/context")
      .then((data) => {
        if (alive) setAuth(data.auth);
      })
      .catch((err: ApiError) => {
        if (!alive) return;
        if (err.status === 401) {
          clearEmbeddedSession();
          window.location.replace("/login?expired=1");
        } else {
          setError(err.message || "We couldn't verify your session. Try again.");
        }
      });
    return () => { alive = false; };
  }, [attempt]);

  if (auth) return <AppProvider value={auth}><AppShell>{children}</AppShell></AppProvider>;

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50 px-5">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="flex justify-center"><BrandLogo /></div>
        {error ? (
          <div className="mt-6 space-y-4">
            <Alert tone="error">{error}</Alert>
            <div className="flex justify-center gap-2">
              <Button variant="secondary" onClick={retry}>Try again</Button>
              <Link href="/login" className="inline-flex h-10 items-center rounded-lg bg-navy-900 px-4 text-sm font-medium text-white">Sign in</Link>
            </div>
          </div>
        ) : (
          <div role="status" className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-600">
            <Spinner /> <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden /> Restoring your secure session…
          </div>
        )}
        <Attribution className="mt-8" />
      </div>
    </main>
  );
}
