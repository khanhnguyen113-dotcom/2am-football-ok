import Link from "next/link";
import type { Metadata } from "next";
import { getLineup, getMatches, getMembers, getRsvps, getTeam } from "@/server/public-data";
import { LineupView } from "@/components/lineup-panel";
import { requestTime } from "@/server/view-helpers";
import { MatchHero } from "@/components/match-bits";
import { Empty, PageHeader, Panel, SectionHead, StatusChip } from "@/components/ui";
import { fmtTime, fmtWeekday } from "@/lib/format";
import { MATCH_STATUS } from "@/lib/domain";

export const metadata: Metadata = { title: "Trận đấu" };

export default async function MatchesPage() {
  const [team, matches] = await Promise.all([getTeam(), getMatches()]);
  const cutoff = new Date(await requestTime() - 3 * 3600_000).toISOString();
  const upcoming = matches.filter((m) => ["published", "postponed"].includes(m.status) && m.starts_at > cutoff)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = matches.filter((m) => !upcoming.includes(m));
  const next = upcoming.find((m) => m.status === "published");
  const [members, lineup, rsvps] = await Promise.all([
    getMembers(), next ? getLineup(next.id) : Promise.resolve(null), next ? getRsvps(next.id) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader kicker="Sân 7 · hàng tuần" title="Lịch thi đấu" />
      {next ? (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <MatchHero m={next} teamName={team.team_name} compact />
          <Panel className="p-4 sm:p-6">
            <SectionHead title={`Đội hình dự kiến vs ${next.opponent}`} />
            <LineupView lineup={lineup} members={members} rsvps={rsvps} />
          </Panel>
        </div>
      ) : <Empty title="Chưa có lịch mới" />}
      {upcoming.length > 1 ? (
        <Panel className="p-4 sm:p-6">
          <SectionHead title="Sắp tới" />
          <MatchList list={upcoming.filter((m) => m.id !== next?.id)} />
        </Panel>
      ) : null}
      <Panel className="p-4 sm:p-6">
        <SectionHead title="Đã diễn ra" />
        {past.length === 0 ? <Empty title="Chưa có trận" /> : <MatchList list={past} />}
      </Panel>
    </div>
  );
}

function MatchList({ list }: { list: Awaited<ReturnType<typeof getMatches>> }) {
  return (
    <ul className="space-y-2">
      {list.map((m) => (
        <li key={m.id}>
          <Link href={`/matches/${m.id}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl border border-white/8 bg-white/3 px-3 py-3 transition hover:border-neon/40 hover:bg-white/5">
            <div className="w-16 text-center">
              <div className="font-display text-xl font-black">{fmtTime(m.starts_at)}</div>
              <div className="text-[0.68rem] uppercase text-muted">{fmtWeekday(m.starts_at)}</div>
            </div>
            <div className="min-w-0">
              <div className="truncate font-display text-lg font-black uppercase italic">vs {m.opponent}</div>
              <div className="truncate text-xs text-muted">{m.venue_name}{m.pitch_no ? ` · sân ${m.pitch_no}` : ""}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {m.status === "completed" ? (
                <span className={`font-display text-2xl font-black tabular-nums ${Number(m.score_us) > Number(m.score_them) ? "text-neon" : Number(m.score_us) < Number(m.score_them) ? "text-danger" : "text-fg"}`}>
                  {m.score_us ?? "-"}:{m.score_them ?? "-"}
                </span>
              ) : null}
              <StatusChip map={MATCH_STATUS} value={m.status} />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
