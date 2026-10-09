import type { CSSProperties, ReactNode } from "react";
import { avatarUrl, displayName, type MemberStats, type PubMember } from "@/lib/domain";
import { moneyShort } from "@/lib/format";

export type Tier = "hero" | "inform" | "gold" | "silver" | "bronze" | "inactive";

const TIER: Record<Tier, { bg: string; fg: string; sub: string; edge: string; label: string }> = {
  hero: {
    bg: "radial-gradient(120% 70% at 70% 15%, #ff7ad0 0%, transparent 55%), linear-gradient(155deg, #2a0f55 0%, #5a28b8 45%, #1a0b3a 100%)",
    fg: "#ffe9a8", sub: "#ffd1f1", edge: "#ff8bd6", label: "HERO",
  },
  inform: {
    bg: "radial-gradient(120% 70% at 70% 12%, rgb(243 210 122 / 0.35) 0%, transparent 55%), linear-gradient(155deg, #262626 0%, #121212 55%, #050505 100%)",
    fg: "#f3d27a", sub: "#e8d9a8", edge: "#f3d27a", label: "IN-FORM",
  },
  gold: {
    bg: "radial-gradient(120% 70% at 70% 10%, #fff7d6 0%, transparent 50%), linear-gradient(155deg, #fbe7a1 0%, #e9c45f 30%, #c4962c 62%, #8a6014 100%)",
    fg: "#2b1d03", sub: "#4a3510", edge: "#fff1bd", label: "VÀNG",
  },
  silver: {
    bg: "radial-gradient(120% 70% at 70% 10%, #ffffff 0%, transparent 50%), linear-gradient(155deg, #f4f7fa 0%, #cfd7df 35%, #98a5b2 70%, #66717e 100%)",
    fg: "#18212a", sub: "#34414e", edge: "#ffffff", label: "BẠC",
  },
  bronze: {
    bg: "radial-gradient(120% 70% at 70% 10%, #ffe2c7 0%, transparent 50%), linear-gradient(155deg, #f0c39b 0%, #cf8c58 35%, #985629 70%, #643512 100%)",
    fg: "#2a1406", sub: "#4b2a12", edge: "#ffd9b8", label: "ĐỒNG",
  },
  inactive: {
    bg: "linear-gradient(155deg, #4a5560 0%, #2c343c 60%, #1a1f24 100%)",
    fg: "#c9d2da", sub: "#9aa6b1", edge: "#7d8a96", label: "NGHỈ",
  },
};

export function tierFor(m: PubMember, s: MemberStats | undefined, opts: { heroIds: Set<string>; informIds: Set<string> }): Tier {
  if (m.status !== "active") return "inactive";
  if (opts.heroIds.has(m.id)) return "hero";
  if (opts.informIds.has(m.id)) return "inform";
  const apps = Number(s?.appearances ?? 0);
  if (apps >= 3) return "gold";
  if (apps >= 1) return "silver";
  return "bronze";
}

/** Top-3 of the month's form ranking. A tie group gets the badge only if the whole group fits in the top 3 (never random). */
export function informSet(form: { member_id: string; score: number }[]): Set<string> {
  const scored = form.filter((x) => x.score > 0);
  return new Set(scored.filter((x) => scored.filter((o) => o.score >= x.score).length <= 3).map((x) => x.member_id));
}
export function Silhouette({ color, id }: { color: string; id: string }) {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`sil-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.55" />
          <stop offset="1" stopColor={color} stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="36" r="19" fill={`url(#sil-${id})`} />
      <path d="M12 100c2-24 18-38 38-38s36 14 38 38z" fill={`url(#sil-${id})`} />
    </svg>
  );
}

export function FutCard({
  member, stats, tier, footer, className,
}: { member: PubMember; stats?: MemberStats; tier: Tier; footer?: ReactNode; className?: string }) {
  const t = TIER[tier];
  const img = avatarUrl(member.avatar_path);
  const pos = member.primary_position ?? member.positions[0] ?? "—";
  const s = stats;
  const cells: [string, string | number][] = [
    [String(s?.appearances ?? 0), "TRẬN"],
    [String(s?.goals ?? 0), "BÀN"],
    [String(s?.gatherings ?? 0), "L.HOAN"],
    [String(s?.rsvp_yes ?? 0), "X.NHẬN"],
    [String(s?.rewards ?? 0), "THƯỞNG"],
    [moneyShort(s?.paid_amount ?? 0), "QUỸ"],
  ];
  const style = { containerType: "inline-size", color: t.fg } as CSSProperties;

  return (
    <div className={`group relative w-full ${className ?? ""}`} style={{ filter: "drop-shadow(0 10px 18px rgb(0 0 0 / 0.45))" }}>
      <div
        className="relative aspect-[0.7] w-full overflow-hidden transition-transform duration-300 group-hover:-translate-y-1"
        style={{ ...style, background: t.bg, clipPath: "polygon(15% 0, 85% 0, 100% 6.5%, 100% 89%, 50% 100%, 0 89%, 0 6.5%)" }}
      >
        {/* edge highlight + texture */}
        <div className="pointer-events-none absolute inset-[3%] opacity-60" style={{ border: `1px solid ${t.edge}`, clipPath: "polygon(15% 0, 85% 0, 100% 6.5%, 100% 89%, 50% 100%, 0 89%, 0 6.5%)" }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "repeating-linear-gradient(120deg, #fff 0 1px, transparent 1px 9px)" }} />
        {tier === "hero" || tier === "inform" ? <div className="shine pointer-events-none absolute inset-0 overflow-hidden" /> : null}

        {/* number / position */}
        <div className="absolute left-[9%] top-[11%] flex flex-col items-center font-display leading-none">
          <span className="font-black italic" style={{ fontSize: "17cqw" }}>{member.shirt_number ?? "–"}</span>
          <span className="font-extrabold" style={{ fontSize: "8.5cqw", marginTop: "1cqw" }}>{pos}</span>
          <span className="mt-[2cqw] block h-px w-[10cqw]" style={{ background: t.sub, opacity: 0.6 }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo.webp" alt="" className="mt-[2cqw] rounded-full object-cover" style={{ width: "10cqw", height: "10cqw" }} />
        </div>

        {/* photo */}
        <div className="absolute right-[6%] top-[7%] h-[46%] w-[62%]">
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt={displayName(member)} className="h-full w-full object-cover object-top [mask-image:linear-gradient(180deg,#000_70%,transparent)]" />
          ) : (
            <Silhouette color={t.fg} id={member.id} />
          )}
        </div>

        {/* name */}
        <div className="absolute inset-x-[8%] top-[53.5%] text-center">
          <div className="truncate font-display font-black uppercase" style={{ fontSize: "10cqw", lineHeight: 1 }}>{displayName(member)}</div>
          <div className="mx-auto mt-[1.5cqw] h-px w-4/5" style={{ background: t.sub, opacity: 0.5 }} />
        </div>

        {/* stats */}
        <div className="absolute inset-x-[11%] top-[64.5%] grid grid-cols-2 gap-x-[5cqw] gap-y-[0.4cqw] font-display" style={{ color: t.fg }}>
          {cells.map(([v, l], i) => (
            <div key={l} className={`flex items-baseline gap-[1.5cqw] ${i % 2 === 1 ? "border-l pl-[4cqw]" : ""}`} style={{ borderColor: `${t.sub}55` }}>
              <span className="font-black tabular-nums" style={{ fontSize: "7cqw" }}>{v}</span>
              <span className="font-semibold" style={{ fontSize: "4.6cqw", color: t.sub }}>{l}</span>
            </div>
          ))}
        </div>

        <div className="absolute bottom-[3.2%] left-1/2 -translate-x-1/2 font-display font-bold tracking-[0.25em]" style={{ fontSize: "3.6cqw", color: t.sub }}>
          {t.label}
        </div>
      </div>
      {footer ? <div className="mt-2">{footer}</div> : null}
    </div>
  );
}
