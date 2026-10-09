import Link from "next/link";
import { FutCard, informSet, tierFor } from "@/components/fut-card";
import { Empty } from "@/components/ui";
import type { FormRow } from "@/server/public-data";
import { displayName, type MemberStats, type PubMember } from "@/lib/domain";
import { monthLabel } from "@/lib/format";

/** Monthly form ranking: score = trận + 2 × bàn (confirmed only); ties share a rank, season score orders within ties. */
export function FormRanking({ month, months, form, stats, members, heroIds, hrefFor }: {
  month: string; months: string[]; form: FormRow[]; stats: Map<string, MemberStats>; members: PubMember[];
  heroIds: Set<string>; hrefFor: (m: string) => string;
}) {
  const mm = new Map(members.map((m) => [m.id, m]));
  const rows = form.filter((r) => mm.get(r.member_id)?.status === "active");
  const ranked = rows.map((r) => ({ ...r, rank: 1 + rows.filter((o) => o.score > r.score).length }));
  const inform = informSet(form);
  const top = ranked.slice(0, 4);
  const rest = ranked.slice(4);

  return (
    <div>
      <div className="scrollbar-none -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1">
        {months.map((m) => (
          <Link key={m} href={hrefFor(m)} scroll={false}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${m === month ? "border-neon bg-neon/15 text-neon" : "border-white/10 text-muted hover:text-fg"}`}>
            {monthLabel(m)}
          </Link>
        ))}
      </div>
      {ranked.every((r) => r.score === 0) ? (
        <Empty title={`Chưa có dữ liệu ${monthLabel(month)}`}>Phong độ được tính khi có trận đã hoàn tất và điểm danh được xác nhận.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {top.map((r) => {
              const m = mm.get(r.member_id)!;
              return (
                <Link key={r.member_id} href={`/members/${m.id}`} className="relative block">
                  <span className={`absolute -left-1 -top-1 z-10 grid h-9 w-9 place-items-center rounded-full font-display text-lg font-black italic shadow-lg ${r.rank === 1 ? "bg-gold text-black" : "bg-ink-950 text-neon ring-1 ring-neon/50"}`}>
                    {r.rank}
                  </span>
                  <FutCard member={m} stats={stats.get(m.id)} tier={tierFor(m, stats.get(m.id), { heroIds, informIds: inform })} />
                  <div className="mt-1.5 text-center text-xs text-muted">Điểm phong độ <b className="font-display text-base text-neon">{r.score}</b></div>
                </Link>
              );
            })}
          </div>
          {rest.length > 0 ? (
            <ol className="mt-5 divide-y divide-white/5 rounded-xl border border-white/8">
              {rest.map((r) => {
                const m = mm.get(r.member_id)!;
                return (
                  <li key={r.member_id}>
                    <Link href={`/members/${m.id}`} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 px-3 py-2 text-sm hover:bg-white/4">
                      <span className="font-display text-lg font-black italic text-muted">{r.rank}</span>
                      <span className="truncate"><b className="mr-1 font-display text-dim">#{m.shirt_number ?? "–"}</b>{displayName(m)}</span>
                      <span className="text-right text-xs text-muted">{r.appearances} trận · {r.goals} bàn · <b className="font-display text-base text-fg">{r.score}</b> điểm</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </>
      )}
      <p className="mt-3 text-xs text-dim">Điểm phong độ tháng = số trận đã thi đấu + 2 × bàn thắng đã xác nhận. Dùng để tự xếp đội hình dự kiến.</p>
    </div>
  );
}
