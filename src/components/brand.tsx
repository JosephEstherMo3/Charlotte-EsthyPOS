import Link from "next/link";

export const ATTRIBUTION = "Created during internship at Hamplus Hub";

/**
 * Brand mark icon using the official Charlotte Esthy Point of Sale receipt badge.
 */
export function BrandMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
    >
      <img
        src="/logo-badge.png"
        alt="Charlotte Esthy Logo"
        className="h-full w-full object-contain"
      />
    </div>
  );
}

/**
 * Branded Sidebar Logo matching the Charlotte Esthy POS UI design:
 * Receipt badge in a gold/amber accented ring, with "Charlotte Esthy POS"
 * and "Fast • Smart • Reliable" subtitle.
 */
export function BrandSidebarLogo({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center text-center transition-transform hover:scale-[1.02]"
    >
      <div className="relative mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/5 p-1.5 shadow-inner ring-1 ring-white/10 group-hover:ring-amber-400/40">
        <img
          src="/logo-badge.png"
          alt="Charlotte Esthy Logo"
          className="h-full w-full object-contain drop-shadow"
        />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-lg font-extrabold tracking-tight text-white">Charlotte Esthy</span>
        <span className="rounded-md bg-amber-400/20 px-1.5 py-0.5 text-xs font-black tracking-wide text-amber-400 ring-1 ring-amber-400/40">
          POS
        </span>
      </div>
      <p className="mt-0.5 text-[11px] font-medium italic tracking-wider text-navy-200/80">
        Fast • Smart • Reliable
      </p>
    </Link>
  );
}

/**
 * Official Charlotte Esthy Point of Sale logo for horizontal contexts:
 * - When `light` is true (placed on the dark navy sidebar or dark auth background),
 *   it renders `/logo-light.png` with transparent background, crisp white "Charlotte",
 *   vibrant royal blue "Esthy", and white "POINT OF SALE".
 * - When `light` is false (on light/white backgrounds), it renders `/logo.png` with
 *   dark navy & vibrant blue branding.
 */
export function BrandLogo({
  light = false,
  size = 48,
  className = "",
  href,
}: {
  light?: boolean;
  size?: number;
  className?: string;
  href?: string;
}) {
  const content = (
    <div className={`flex items-center justify-center ${className}`}>
      <img
        src={light ? "/logo-light.png" : "/logo.png"}
        alt="Charlotte Esthy — Point of Sale"
        style={{ height: size }}
        className="w-auto max-w-full object-contain"
      />
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex transition-transform hover:scale-[1.02]">
        {content}
      </Link>
    );
  }

  return <div className="inline-flex">{content}</div>;
}

export function Attribution({ className = "", light = false }: { className?: string; light?: boolean }) {
  return (
    <p className={`flex items-center justify-center gap-2 text-xs ${light ? "text-navy-300" : "text-slate-500"} ${className}`}>
      <span aria-hidden className="h-px w-5 bg-amber-400/70" />
      <span className="italic">{ATTRIBUTION}</span>
      <span aria-hidden className="h-px w-5 bg-amber-400/70" />
    </p>
  );
}
