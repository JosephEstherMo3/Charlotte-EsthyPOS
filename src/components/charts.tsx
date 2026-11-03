"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useApp } from "@/components/app-context";

export type Bucket = "day" | "week" | "month";

export interface Summary {
  transactions: number;
  gross: number;
  refunds: number;
  refundCount: number;
  voids: number;
  voidedAmount: number;
  net: number;
  average: number;
  discounts: number;
  discountedSales: number;
  tax: number;
}

export interface SeriesPoint {
  bucket: string;
  transactions: number;
  gross: number;
  refunds: number;
  net: number;
}

export function fmtBucket(key: string, bucket: Bucket, locale: string): string {
  const d = new Date(`${key}T00:00:00Z`);
  const opts: Intl.DateTimeFormatOptions =
    bucket === "month" ? { month: "short", year: "numeric", timeZone: "UTC" } : { month: "short", day: "numeric", timeZone: "UTC" };
  const s = new Intl.DateTimeFormat(locale, opts).format(d);
  return bucket === "week" ? `Week of ${s}` : s;
}

export function BucketToggle({ value, onChange }: { value: Bucket; onChange: (b: Bucket) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm p-0.5" role="group" aria-label="Group by">
      {(["day", "week", "month"] as Bucket[]).map((b) => (
        <button
          key={b}
          type="button"
          aria-pressed={value === b}
          onClick={() => onChange(b)}
          className={`h-7.5 px-3 text-xs font-semibold capitalize rounded-lg transition-colors ${value === b ? "bg-slate-950 text-white shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
        >
          {b === "day" ? "Daily" : b === "week" ? "Weekly" : "Monthly"}
        </button>
      ))}
    </div>
  );
}

export function TrendChart({ data, metric, bucket }: { data: SeriesPoint[]; metric: "net" | "transactions"; bucket: Bucket }) {
  const app = useApp();
  const locale = app.settings.locale;
  const fmtX = (k: string) => fmtBucket(k, bucket, locale);
  const compact = (v: number) => new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(v);
  const tick = { fontSize: 12, fill: "#64748b" };
  return (
    <div className="h-72 w-full" role="img" aria-label={metric === "net" ? "Net revenue over time" : "Transactions over time"}>
      <ResponsiveContainer width="100%" height="100%">
        {metric === "net" ? (
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ceRev" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0c4a9e" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#0c4a9e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="bucket" tickFormatter={fmtX} tick={tick} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tickFormatter={compact} tick={tick} tickLine={false} axisLine={false} width={48} />
            <Tooltip labelFormatter={(l) => fmtX(String(l))} formatter={(v) => app.money(Number(v))} />
            <Area type="monotone" dataKey="net" name="Net revenue" stroke="#0c4a9e" strokeWidth={2.5} fill="url(#ceRev)" />
          </AreaChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="bucket" tickFormatter={fmtX} tick={tick} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis allowDecimals={false} tick={tick} tickLine={false} axisLine={false} width={32} />
            <Tooltip labelFormatter={(l) => fmtX(String(l))} />
            <Bar dataKey="transactions" name="Transactions" fill="#0c4a9e" radius={[6, 6, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
