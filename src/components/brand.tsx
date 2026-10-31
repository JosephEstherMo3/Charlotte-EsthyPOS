import Link from "next/link";

export const ATTRIBUTION = "Created during internship at Hamplus Hub";

/**
 * Brand mark icon using the official Charlotte Esthy Point of Sale badge.
 * On dark backgrounds (light=true) the white JPG bg is blended away via mix-blend-mode:screen.
 */
export function BrandMark({ size = 36, light = false, className = "" }: { size?: number; light?: boolean; className?: string }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${light ? "" : "bg-white shadow-sm ring-1 ring-slate-200/50"} ${className}`}
    >
      <img
        src="/logo.jpg"
        alt="Charlotte Esthy Logo"
        className="h-full w-full object-contain"
        style={light ? { mixBlendMode: "screen" } : undefined}
      />
    </div>
  );
}

/**
 * Official Charlotte Esthy Point of Sale logo for the sidebar, navbar, and auth screens.
 * When `light` is true (placed on a dark navy sidebar) the white JPEG background is
 * blended away using mix-blend-mode:screen so the logo integrates with the sidebar color.
 */
export function BrandLogo({
  light = false,
  size = 46,
  className = "",
  href,
}: {
  light?: boolean;
  size?: number;
  className?: string;
  href?: string;
}) {
  const content = (
    <div className={`flex items-center ${className}`}>
      <img
        src="/logo.jpg"
        alt="Charlotte Esthy — Point of Sale"
        style={{
          height: size,
          // On dark backgrounds: screen blend makes white areas transparent,
          // revealing the dark navy beneath, so the logo pops without a white box.
          mixBlendMode: light ? "screen" : undefined,
          // Slight brightness boost on dark bg so colours read clearly
          filter: light ? "brightness(1.15) saturate(1.1)" : undefined,
        }}
        className="w-auto max-w-full object-contain"
      />
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex transition-transform hover:scale-[1.01]">
        {content}
      </Link>
    );
  }

  return <div className="inline-flex">{content}</div>;
}

export function Attribution({ className = "", light = false }: { className?: string; light?: boolean }) {
  return (
    <p className={`flex items-center justify-center gap-2 text-xs ${light ? "text-navy-300" : "text-slate-500"} ${className}`}>
      <span aria-hidden className="h-px w-5 bg-emerald-500/70" />
      <span className="italic">{ATTRIBUTION}</span>
      <span aria-hidden className="h-px w-5 bg-emerald-500/70" />
    </p>
  );
}
