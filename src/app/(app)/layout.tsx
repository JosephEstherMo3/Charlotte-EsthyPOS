import type { ReactNode } from "react";
import { AppProvider, type AppValue } from "@/components/app-context";
import { AppShell } from "@/components/app-shell";
import { EmbeddedAppGate } from "@/components/embedded-app-gate";
import { getAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const auth = await getAuth();
  // No business data is sent to a signed-out browser. When the session lives in
  // tab storage rather than a cookie, the client gate verifies it with the
  // server before rendering anything.
  if (!auth) return <EmbeddedAppGate>{children}</EmbeddedAppGate>;

  const s = auth.settings;
  const value: AppValue = {
    user: auth.user,
    business: auth.business,
    role: auth.role,
    settings: {
      currency: s.currency,
      locale: s.locale,
      timezone: s.timezone,
      taxName: s.taxName,
      taxRate: s.taxRate,
      taxInclusive: s.taxInclusive,
      defaultLowStockThreshold: s.defaultLowStockThreshold,
      allowNegativeStock: s.allowNegativeStock,
      receiptWidth: s.receiptWidth,
      receiptBusinessName: s.receiptBusinessName,
    },
  };

  return (
    <AppProvider value={value}>
      <AppShell>{children}</AppShell>
    </AppProvider>
  );
}
