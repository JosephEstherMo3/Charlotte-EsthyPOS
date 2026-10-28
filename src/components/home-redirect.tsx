"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand";
import { Spinner } from "@/components/ui";
import { getEmbeddedToken } from "@/lib/embedded-session";

/** The server cannot read sessionStorage on /, so choose the destination client-side. */
export function HomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getEmbeddedToken() ? "/dashboard" : "/login");
  }, [router]);
  return (
    <main className="grid min-h-dvh place-items-center bg-slate-50" role="status">
      <div className="flex flex-col items-center gap-4"><BrandLogo /><Spinner /><span className="text-sm text-slate-500">Opening Charlotte Esthy…</span></div>
    </main>
  );
}
