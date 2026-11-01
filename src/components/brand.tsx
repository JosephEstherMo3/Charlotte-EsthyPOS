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
 * Official Charlotte Esthy Point of Sale logo for the sidebar, navbar, and auth screens.
 * - When `light` is true (placed on the dark navy sidebar or dark auth background),
 *   it renders `/logo-light.png` with transparent background, crisp white "Charlotte",
 *   vibrant royal blue "Esthy", and white "POINT OF SALE".
 * - When `light` is false (on light/white backgrounds), it renders `/logo.png` with
 *   dark navy & vibrant blue branding.
 */
export function BrandLogo({
  light = false,
  size = 54,
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
      <span aria-hidden className="h-px w-5 bg-sky-500/70" />
      <span className="italic">{ATTRIBUTION}</span>
      <span aria-hidden className="h-px w-5 bg-sky-500/70" />
    </p>
  );
}
