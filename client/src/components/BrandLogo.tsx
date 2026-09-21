import { useState } from "react";
import clsx from "clsx";

/**
 * Fruitified brand mark.
 *
 * Drop the client's real logo at `client/public/brand-logo.png` and it is used
 * automatically. Until then (or if it fails to load) a lotus + wordmark drawn in
 * the brand palette renders, so the app is always branded.
 */
export function BrandLogo({
  className,
  showWordmark = true,
  markSize = 40,
}: {
  className?: string;
  showWordmark?: boolean;
  markSize?: number;
}) {
  const [imgOk, setImgOk] = useState(true);

  if (imgOk) {
    return (
      <img
        src="/brand-logo.png"
        alt="Fruitified"
        onError={() => setImgOk(false)}
        style={{ height: markSize * (showWordmark ? 1.5 : 1) }}
        className={clsx("w-auto object-contain", className)}
      />
    );
  }

  // Fallback: lotus mark + wordmark.
  return (
    <div className={clsx("flex items-center gap-2.5", className)}>
      <LotusMark size={markSize} />
      {showWordmark && (
        <div className="leading-none">
          <div
            className="font-extrabold uppercase tracking-wide text-brand-600"
            style={{ fontSize: markSize * 0.52 }}
          >
            Fruitified
          </div>
          <div
            className="font-semibold uppercase tracking-[0.2em] text-gold"
            style={{ fontSize: markSize * 0.2, marginTop: 2 }}
          >
            by Kamala
          </div>
        </div>
      )}
    </div>
  );
}

/** A small lotus of fruit-coloured petals — echoes the Fruitified logo. */
export function LotusMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {/* outer petals */}
      <path d="M32 58C14 50 8 36 12 26c8 2 16 10 20 22 4-12 12-20 20-22 4 10-2 24-20 32Z" fill="#586b4d" />
      <path d="M32 56C20 50 15 40 17 32c7 2 12 9 15 18 3-9 8-16 15-18 2 8-3 18-15 24Z" fill="#c3cdb7" />
      {/* side petals */}
      <path d="M32 54C24 42 24 30 32 20c8 10 8 22 0 34Z" fill="#d7a15c" />
      <path d="M32 52C27 42 27 32 32 24c-6 3-10 9-10 16 0 5 4 9 10 12Z" fill="#5f6e9e" />
      <path d="M32 52c5-10 5-20 0-28 6 3 10 9 10 16 0 5-4 9-10 12Z" fill="#c85f2f" />
      {/* center */}
      <circle cx="32" cy="30" r="4.5" fill="#f7f1e6" />
    </svg>
  );
}
