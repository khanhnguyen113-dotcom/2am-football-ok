import Link from "next/link";
import type { ReactNode } from "react";
import { money } from "@/lib/format";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Panel({ children, className, cut }: { children: ReactNode; className?: string; cut?: boolean }) {
  return <section className={cx("panel", cut && "panel-cut", className)}>{children}</section>;
}

export function SectionHead({ title, action, sub }: { title: string; action?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="section-title">{title}</h2>
        {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("chip", className ?? "bg-white/10 text-fg")}>{children}</span>;
}

export function StatusChip({ map, value }: { map: Record<string, { label: string; cls: string }>; value: string }) {
  const s = map[value] ?? { label: value, cls: "bg-white/10 text-muted" };
  return <Chip className={s.cls}>{s.label}</Chip>;
}

export function Stat({
  label, value, hint, tone = "fg", big,
}: { label: string; value: ReactNode; hint?: ReactNode; tone?: "fg" | "neon" | "gold" | "danger" | "info" | "teal"; big?: boolean }) {
  const toneCls = { fg: "text-fg", neon: "text-neon glow-text", gold: "text-gold", danger: "text-danger", info: "text-info", teal: "text-teal" }[tone];
  return (
    <div className="min-w-0">
      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted">{label}</div>
      <div className={cx("font-display font-extrabold leading-none tabular-nums", big ? "mt-1 whitespace-nowrap text-[2rem] sm:text-5xl" : "mt-1 whitespace-nowrap text-xl sm:text-2xl", toneCls)}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-dim">{hint}</div> : null}
    </div>
  );
}

export function Money({ v, className }: { v: number | string | null | undefined; className?: string }) {
  return <span className={cx("tabular-nums", className)}>{money(v)}</span>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/12 px-4 py-8 text-center">
      <div className="font-display text-lg font-bold uppercase tracking-wide text-muted">{title}</div>
      {children ? <div className="mt-1 text-sm text-dim">{children}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode }) {
  const cls = {
    info: "border-info/30 bg-info/10 text-info",
    warn: "border-warn/30 bg-warn/10 text-warn",
    danger: "border-danger/30 bg-danger/10 text-danger",
    ok: "border-neon/30 bg-neon/10 text-neon",
  }[tone];
  return <div className={cx("rounded-lg border px-3 py-2 text-sm", cls)}>{children}</div>;
}

export function Pager({ page, total, size, href }: { page: number; total: number; size: number; href: (p: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <nav className="mt-3 flex items-center justify-between gap-2 text-sm" aria-label="Phân trang">
      {page > 1 ? <Link className="btn btn-ghost btn-sm" href={href(page - 1)}>‹ Trước</Link> : <span />}
      <span className="text-muted">Trang {page}/{pages} · {total} dòng</span>
      {page < pages ? <Link className="btn btn-ghost btn-sm" href={href(page + 1)}>Sau ›</Link> : <span />}
    </nav>
  );
}

export function Tabs({ items, active }: { items: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <div className="scrollbar-none -mx-1 mb-4 flex gap-1 overflow-x-auto px-1">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          className={cx(
            "relative shrink-0 px-3 py-2 font-display text-base font-bold uppercase tracking-wider transition-colors",
            t.key === active ? "text-neon" : "text-muted hover:text-fg",
          )}
        >
          {t.label}
          {t.key === active ? <span className="absolute inset-x-2 -bottom-0.5 h-[3px] -skew-x-12 rounded bg-neon" /> : null}
        </Link>
      ))}
    </div>
  );
}

export function PageHeader({ kicker, title, children }: { kicker?: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-5">
      {kicker ? <div className="font-display text-sm font-bold uppercase tracking-[0.3em] text-teal">{kicker}</div> : null}
      <h1 className="font-display text-4xl font-black uppercase italic leading-none tracking-wide sm:text-5xl">{title}</h1>
      {children ? <div className="mt-2 text-sm text-muted">{children}</div> : null}
    </header>
  );
}
