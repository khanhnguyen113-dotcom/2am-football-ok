/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

export function Crest({ size = 56, className }: { size?: number; className?: string }) {
  return (
    <span className={`relative inline-block shrink-0 ${className ?? ""}`} style={{ width: size, height: size }}>
      <span className="absolute inset-[8%] rounded-full bg-teal/25 blur-xl" aria-hidden />
      <img src="/brand/logo.webp" alt="Logo 2AM FC" width={size} height={size} className="crest relative h-full w-full object-cover" />
    </span>
  );
}

export function Wordmark({ name, tagline }: { name: string; tagline?: string }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      <Crest size={52} />
      <span className="leading-none">
        <span className="block font-display text-2xl font-black uppercase italic tracking-wide">
          {name.replace(/FC$/i, "").trim()} <span className="text-neon">FC</span>
        </span>
        {tagline ? <span className="mt-1 block text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted">{tagline}</span> : null}
      </span>
    </Link>
  );
}
