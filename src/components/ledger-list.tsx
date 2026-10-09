import Link from "next/link";
import type { LedgerRow } from "@/server/public-data";
import { fmtDate, money, monthLabel } from "@/lib/format";
import { Chip, Empty } from "@/components/ui";

/** Public ledger rows as mobile-friendly cards (no receipts, account numbers or private notes). */
export function LedgerList({ rows, emptyTitle = "Chưa có khoản chi trong kỳ" }: { rows: LedgerRow[]; emptyTitle?: string }) {
  if (rows.length === 0) return <Empty title={emptyTitle}>Mọi khoản thực chi đã ghi sổ sẽ hiện ở đây.</Empty>;
  return (
    <ul className="divide-y divide-white/5">
      {rows.map((r) => {
        const isRev = r.source_type === "reversal";
        const out = r.direction === "out";
        const lateNote = r.occurred_at.slice(0, 7) !== r.posting_month;
        return (
          <li key={r.id} className="flex items-start gap-3 py-3">
            <div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-lg font-display text-lg font-black ${out ? "bg-danger/12 text-danger" : "bg-neon/12 text-neon"}`}>
              {out ? "−" : "+"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-semibold">{r.public_description}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span>{fmtDate(r.occurred_at)}</span>
                <Chip className="bg-white/8 text-muted">{r.category}</Chip>
                {out && !isRev ? <Chip className="bg-neon/12 text-neon">Đã chi</Chip> : null}
                {isRev ? <Chip className="bg-warn/15 text-warn">Điều chỉnh</Chip> : null}
                {r.reversed_by ? <Chip className="bg-warn/15 text-warn">Đã được điều chỉnh</Chip> : null}
                {lateNote ? <span className="text-dim">· ghi sổ {monthLabel(r.posting_month)}</span> : null}
                {r.match_id && r.match_opponent ? (
                  <Link href={`/matches/${r.match_id}`} className="text-teal hover:underline">· trận vs {r.match_opponent}</Link>
                ) : null}
              </div>
              {r.period_note ? <div className="mt-1 text-xs text-dim">{r.period_note}</div> : null}
            </div>
            <div className={`shrink-0 text-right font-display text-lg font-extrabold tabular-nums ${out ? "text-fg" : "text-neon"}`}>
              {out ? "−" : "+"}{money(r.amount)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function MonthNav({ month, months, base, extra }: { month: string; months: string[]; base: string; extra?: Record<string, string | undefined> }) {
  const q = (m: string) => {
    const p = new URLSearchParams();
    p.set("month", m);
    Object.entries(extra ?? {}).forEach(([k, v]) => v && p.set(k, v));
    return `${base}?${p.toString()}`;
  };
  return (
    <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
      {months.map((m) => (
        <Link key={m} href={q(m)} scroll={false}
          className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${m === month ? "border-neon bg-neon/15 text-neon" : "border-white/10 text-muted hover:text-fg"}`}>
          {monthLabel(m)}
        </Link>
      ))}
    </div>
  );
}
