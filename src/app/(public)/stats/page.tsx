import Link from "next/link";
import type { Metadata } from "next";
import { getMembers, getMemberStats } from "@/server/public-data";
import { sp, type SP } from "@/server/view-helpers";
import { Empty, PageHeader, Panel, Tabs } from "@/components/ui";
import { displayName, type MemberStats } from "@/lib/domain";
import { money, vnToday } from "@/lib/format";

export const metadata: Metadata = { title: "Thống kê" };

const METRICS: { key: keyof MemberStats; label: string; short: string }[] = [
  { key: "appearances", label: "Số lần ra sân", short: "Ra sân" },
  { key: "goals", label: "Bàn thắng (đã xác nhận)", short: "Bàn" },
  { key: "gatherings", label: "Số lần liên hoan", short: "L.hoan" },
  { key: "rsvp_yes", label: "Xác nhận tham gia (khác ra sân)", short: "XN đi" },
  { key: "rewards", label: "Số lần nhận thưởng", short: "Thưởng" },
  { key: "paid_amount", label: "Tiền quỹ đã đóng (theo ngày ghi sổ)", short: "Quỹ" },
];

export default async function StatsPage({ searchParams }: { searchParams: SP }) {
  const q = await sp(searchParams);
  const today = vnToday();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from ?? "") ? q.from! : `${today.slice(0, 4)}-01-01`;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(q.to ?? "") ? q.to! : today;
  const sort = (METRICS.find((m) => m.key === q.sort)?.key ?? "appearances") as keyof MemberStats;
  const [members, stats] = await Promise.all([getMembers(), getMemberStats(from, to)]);
  const rows = members
    .map((m) => ({ m, s: stats.get(m.id) }))
    .filter((r) => r.s && (r.m.status === "active" || Number(r.s.appearances) + Number(r.s.paid_amount) > 0))
    .sort((a, b) => Number(b.s![sort]) - Number(a.s![sort]) || displayName(a.m).localeCompare(displayName(b.m), "vi"));

  // standard competition ranking: ties share a rank (1,1,3), never a random tie-break
  const ranked = rows.map((r) => ({ ...r, rank: 1 + rows.filter((o) => Number(o.s![sort]) > Number(r.s![sort])).length }));
  const link = (patch: Record<string, string>) => `/stats?${new URLSearchParams({ from, to, sort, ...patch }).toString()}`;

  return (
    <div>
      <PageHeader kicker="2AM FC" title="Bảng xếp hạng" />
      <form action="/stats" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="sort" value={sort} />
        <label><span className="label">Từ ngày</span><input type="date" name="from" defaultValue={from} className="field" /></label>
        <label><span className="label">Đến ngày</span><input type="date" name="to" defaultValue={to} className="field" /></label>
        <button className="btn btn-ghost">Lọc</button>
      </form>
      <Tabs active={sort} items={METRICS.map((m) => ({ key: m.key, label: m.short, href: link({ sort: m.key }) }))} />
      <Panel className="overflow-hidden p-0">
        {ranked.length === 0 ? <div className="p-5"><Empty title="Không có dữ liệu trong khoảng này" /></div> : (
          <ul className="divide-y divide-white/5">
            {ranked.map(({ m, s, rank }) => (
              <li key={m.id}>
                <Link href={`/members/${m.id}`} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 px-4 py-3 hover:bg-white/4 sm:grid-cols-[3rem_1fr_repeat(6,4.5rem)]">
                  <span className={`font-display text-2xl font-black italic ${rank === 1 ? "text-gold" : rank <= 3 ? "text-neon" : "text-muted"}`}>{rank}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{displayName(m)}</span>
                    <span className="block text-xs text-dim">#{m.shirt_number ?? "–"} · {m.primary_position ?? "—"}</span>
                  </span>
                  <span className="text-right font-display text-2xl font-black tabular-nums text-neon sm:hidden">
                    {sort === "paid_amount" ? money(s![sort]) : s![sort]}
                  </span>
                  {METRICS.map((mt) => (
                    <span key={mt.key} className={`hidden text-right tabular-nums sm:block ${mt.key === sort ? "font-display text-xl font-black text-neon" : "text-muted"}`}>
                      {mt.key === "paid_amount" ? `${Math.round(Number(s![mt.key]) / 1000)}K` : s![mt.key]}
                    </span>
                  ))}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <div className="mt-3 hidden justify-end gap-6 pr-4 text-xs text-dim sm:flex">
        {METRICS.map((m) => <span key={m.key}>{m.short}: {m.label}</span>)}
      </div>
    </div>
  );
}
