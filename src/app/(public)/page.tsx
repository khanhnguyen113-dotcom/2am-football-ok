import Link from "next/link";
import {
  getLineup, getMembers, getMemberForm, getMemberStats, getNextMatch, getPenalties, getRewards, getRsvps, getTeam, getUnpaid,
} from "@/server/public-data";
import { collectionMonth, monthRange, rsvpOptions, sp, type SP } from "@/server/view-helpers";
import { Chip, Empty, Panel, SectionHead, StatusChip } from "@/components/ui";
import { MatchHero, RsvpBoard } from "@/components/match-bits";
import { RsvpForm } from "@/components/public-forms";
import { LineupView } from "@/components/lineup-panel";
import { FormRanking } from "@/components/form-ranking";
import { Crest } from "@/components/brand";
import { fmtDate, isMonth, money, monthLabel, shiftMonth, vnMonth } from "@/lib/format";
import { FEE_TYPE_LABEL, REWARD_STATUS, displayName } from "@/lib/domain";

export default async function HomePage({ searchParams }: { searchParams: SP }) {
  const q = await sp(searchParams);
  const current = vnMonth();
  const formMonth = isMonth(q.form) && q.form <= current ? q.form : current;
  const fr = monthRange(formMonth);
  const team = await getTeam();
  const target = collectionMonth(team);

  const [penalties, next, members, form, formStats, rewards, unpaid] = await Promise.all([
    getPenalties(), getNextMatch(), getMembers(), getMemberForm(formMonth), getMemberStats(fr.from, fr.to),
    getRewards(), getUnpaid(target),
  ]);
  const hasDebt = penalties.some((p) => p.status === "unpaid");
  const [rsvps, lineup] = await Promise.all([
    next ? getRsvps(next.id) : Promise.resolve([]),
    next ? getLineup(next.id) : Promise.resolve(null),
  ]);

  const memberMap = new Map(members.map((m) => [m.id, m]));
  const formMonths = [0, 1, 2, 3].map((i) => shiftMonth(current, -i));
  const heroIds = new Set(rewards.results.map((r) => r.member_id));
  const formHref = (m: string) => `/?form=${m}#phong-do`;
  const liveEvents = rewards.events.filter((e) => ["published", "running", "pending_final"].includes(e.status)).slice(0, 2);
  const deadline = `${target}-${String(team.due_day).padStart(2, "0")}`;
  const unpaidRows = unpaid
    .map((u) => ({ ...u, m: memberMap.get(u.member_id)! }))
    .filter((u) => u.m)
    .sort((a, b) => (a.status === b.status ? (a.m.shirt_number ?? 999) - (b.m.shirt_number ?? 999) : a.status === "unpaid" ? -1 : 1));

  return (
    <div className="space-y-6">
      {/* ── Club hero: name + slogan ── */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(115deg,#0d2a30_0%,#08161b_50%,#1a1038_100%)] p-6 sm:p-10">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-teal/15 blur-3xl" />
        <div className="relative flex flex-col items-center gap-5 text-center sm:flex-row sm:text-left">
          <Crest size={140} />
          <div className="min-w-0">
            <h1 className="font-display text-6xl font-black uppercase italic leading-[0.9] sm:text-8xl">
              {team.team_name.replace(/FC$/i, "").trim()} <span className="text-neon glow-text">FC</span>
            </h1>
            {team.tagline ? (
              <p className="mt-3 font-display text-xl font-bold uppercase italic tracking-wide text-gold sm:text-2xl">{team.tagline}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
              <Link href="/funds/pay" className="btn btn-primary">Đóng quỹ</Link>
              {hasDebt ? <Link href="/funds/penalty" className="btn btn-ghost">Nộp phạt</Link> : null}
              <Link href="/donate" className="btn btn-ghost">♥ Ủng hộ đội</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Next match + RSVP + auto lineup ── */}
      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Panel className="p-4 sm:p-6">
          <SectionHead title="Trận tiếp theo" action={<Link href="/matches" className="text-sm text-teal hover:underline">Lịch đấu →</Link>} />
          {next ? (
            <div className="space-y-5">
              <MatchHero m={next} teamName={team.team_name} compact />
              <RsvpBoard rsvps={rsvps} members={members} />
            </div>
          ) : (
            <Empty title="Chưa có lịch mới" />
          )}
        </Panel>
        {next ? (
          <div className="space-y-6">
            <Panel className="p-4 sm:p-6" cut>
              <SectionHead title="Xác nhận đi đá" sub={`Xác nhận đi mà vắng mặt bị phạt ${money(team.penalty_absent)}.`} />
              <RsvpForm matchId={next.id} options={rsvpOptions(members)} closed={new Date(next.rsvp_deadline) < new Date()} />
            </Panel>
            <Panel className="p-4 sm:p-6">
              <SectionHead title="Đội hình dự kiến" />
              <LineupView lineup={lineup} members={members} rsvps={rsvps} />
            </Panel>
          </div>
        ) : null}
      </div>

      {/* ── Monthly form ranking ── */}
      <Panel className="p-4 sm:p-6">
        <div id="phong-do" className="scroll-mt-24" />
        <SectionHead title={`Phong độ ${monthLabel(formMonth)}`}
          action={<Link href="/stats" className="text-sm text-teal hover:underline">BXH →</Link>} />
        <FormRanking month={formMonth} months={formMonths} form={form} stats={formStats} members={members} heroIds={heroIds} hrefFor={formHref} />
      </Panel>

      {liveEvents.length > 0 ? (
        <Panel className="p-4 sm:p-6">
          <SectionHead title="Event thưởng" action={<Link href="/events" className="text-sm text-teal hover:underline">Tất cả →</Link>} />
          <ul className="grid gap-3 lg:grid-cols-2">
            {liveEvents.map((e) => {
              const prizes = rewards.prizes.filter((p) => p.event_id === e.id);
              return (
                <li key={e.id} className="rounded-xl border border-violet/30 bg-[linear-gradient(120deg,rgb(141_92_255/0.18),transparent)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-display text-xl font-black uppercase italic">{e.title}</div>
                    <StatusChip map={REWARD_STATUS} value={e.status} />
                  </div>
                  <p className="mt-1 text-sm text-muted">{e.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {prizes.map((p) => (
                      <Chip key={p.id} className="bg-gold/15 text-gold">{p.name}: {p.amount_each > 0 ? money(p.amount_each) : p.item_desc} × {p.winners_count}</Chip>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}

      {/* ── Who has not paid the month being collected (opens day 20, deadline day 5) ── */}
      <Panel className="p-4 sm:p-6">
        <SectionHead title={`Chưa đóng quỹ ${monthLabel(target)}`}
          sub={<>Thu từ ngày {team.collect_start_day} tháng trước · hạn chót <b className="text-fg">{fmtDate(deadline)}</b></>}
          action={<Link href="/funds/pay" className="btn btn-primary btn-sm">Đóng ngay</Link>} />
        {unpaidRows.length === 0 ? (
          <Empty title="Mọi người đã đóng đủ 🎉" />
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {unpaidRows.map((u) => (
              <li key={u.member_id} className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${u.status === "pending" ? "bg-info/8" : "bg-warn/8"}`}>
                <span className="min-w-0 truncate">
                  <b className="mr-1.5 font-display text-muted">{u.m.shirt_number ?? "–"}</b>{displayName(u.m)}
                  {u.fee_type !== "standard" ? <span className="ml-1 text-xs text-dim">({FEE_TYPE_LABEL[u.fee_type]})</span> : null}
                </span>
                <span className={`shrink-0 text-xs font-semibold ${u.status === "pending" ? "text-info" : "text-warn"}`}>
                  {u.status === "pending" ? "Chờ duyệt" : money(u.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
