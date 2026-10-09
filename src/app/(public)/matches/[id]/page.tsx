import Link from "next/link";
import { notFound } from "next/navigation";
import { getGathering, getLineup, getMatch, getMembers, getParticipations, getRsvps, getTeam } from "@/server/public-data";
import { rsvpOptions } from "@/server/view-helpers";
import { MatchHero, RsvpBoard } from "@/components/match-bits";
import { RsvpForm } from "@/components/public-forms";
import { LineupView } from "@/components/lineup-panel";
import { Chip, Empty, Notice, Panel, SectionHead } from "@/components/ui";
import { ATTEND_LABEL, displayName } from "@/lib/domain";
import { fmtDateTime, money } from "@/lib/format";

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatch(id);
  if (!match) notFound();
  const [team, members, rsvps, lineup, parts, gathering] = await Promise.all([
    getTeam(), getMembers(), getRsvps(id), getLineup(id), getParticipations(id), getGathering(id),
  ]);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const open = match.status === "published";
  const played = parts.filter((p) => p.actual_status === "played");
  const scorers = played.filter((p) => (p.goals ?? 0) > 0).sort((a, b) => (b.goals ?? 0) - (a.goals ?? 0));

  return (
    <div className="space-y-6">
      <Link href="/matches" className="text-sm text-teal hover:underline">← Lịch thi đấu</Link>
      <MatchHero m={match} teamName={team.team_name} />
      {match.status === "cancelled" ? <Notice tone="danger">Trận đã hủy — không tính ra sân.</Notice> : null}
      {match.status === "postponed" ? <Notice tone="warn">Trận tạm hoãn. Khi có lịch mới, mọi người cần xác nhận lại.</Notice> : null}

      {match.status === "completed" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel className="p-5">
            <SectionHead title="Thực tế ra sân" />
            {parts.length === 0 ? <Empty title="Chưa ghi nhận" /> : (
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {parts.map((p) => {
                  const m = memberMap.get(p.member_id);
                  return m ? (
                    <li key={p.member_id} className="flex items-center justify-between gap-2 rounded-lg bg-white/3 px-3 py-2 text-sm">
                      <span className="truncate">{displayName(m)}</span>
                      <span className={`text-xs ${p.actual_status === "played" ? "text-neon" : "text-muted"}`}>
                        {ATTEND_LABEL[p.actual_status]}{p.was_starter === false && p.actual_status === "played" ? " (dự bị)" : ""}
                      </span>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
          </Panel>
          <Panel className="p-5">
            <SectionHead title="Ghi bàn" />
            {scorers.length === 0 ? <p className="text-sm text-muted">Chưa có bàn thắng được xác nhận.</p> : (
              <ul className="space-y-1.5">
                {scorers.map((p) => (
                  <li key={p.member_id} className="flex justify-between rounded-lg bg-gold/5 px-3 py-2">
                    <span>{displayName(memberMap.get(p.member_id)!)}</span>
                    <b className="text-gold">⚽ × {p.goals}</b>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {["published", "postponed"].includes(match.status) ? (
        <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <Panel className="p-5">
            <SectionHead title="Xác nhận tham gia" />
            <RsvpBoard rsvps={rsvps} members={members} />
          </Panel>
          {open ? (
            <Panel className="h-fit p-5" cut>
              <SectionHead title="Gửi xác nhận" sub={`Xác nhận đi mà vắng mặt bị phạt ${money(team.penalty_absent)}.`} />
              <RsvpForm matchId={match.id} options={rsvpOptions(members)} closed={new Date(match.rsvp_deadline) < new Date()} />
            </Panel>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel className="p-5">
          <SectionHead title="Đội hình dự kiến ra sân" />
          <LineupView lineup={lineup} members={members} rsvps={rsvps} />
        </Panel>
        <Panel className="p-5">
          <SectionHead title="Liên hoan sau trận" />
          {gathering.g ? (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted">Địa điểm:</span> {gathering.g.location ?? "—"}</div>
              <div><span className="text-muted">Thời gian:</span> {fmtDateTime(gathering.g.starts_at)}</div>
              <Chip className={gathering.g.status === "done" ? "bg-teal/15 text-teal" : gathering.g.status === "cancelled" ? "bg-danger/15 text-danger" : "bg-info/15 text-info"}>
                {{ planned: "Dự kiến", done: "Đã diễn ra", cancelled: "Đã hủy" }[gathering.g.status]}
              </Chip>
              {gathering.attendance.length > 0 ? (
                <div className="pt-2">
                  <div className="label">Đã tham gia</div>
                  <div className="flex flex-wrap gap-1.5">
                    {gathering.attendance.filter((a) => a.actual_status === "attended").map((a) => (
                      <Chip key={a.member_id} className="bg-white/8 text-fg">{displayName(memberMap.get(a.member_id)!)}</Chip>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : <Empty title="Chưa có kế hoạch liên hoan" />}
        </Panel>
      </div>
    </div>
  );
}
