import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllParticipations, getDues, getMatches, getMemberForm, getMembers, getMemberStats, getPenalties, getRewards } from "@/server/public-data";
import { seasonRange } from "@/server/view-helpers";
import { FutCard, informSet, tierFor } from "@/components/fut-card";
import { ProfileButton } from "@/components/public-forms";
import { Chip, Panel, SectionHead, Stat, StatusChip } from "@/components/ui";
import { ATTEND_LABEL, DUE_STATUS, FEE_TYPE_LABEL, FOOT_LABEL, MEMBER_STATUS_LABEL, PENALTY_STATUS, POSITION_NAME, avatarUrl, displayName } from "@/lib/domain";
import { fmtDate, money, monthLabel, vnMonth } from "@/lib/format";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const season = seasonRange();
  const [members, stats, rewards, matches, parts, dues, form, penalties] = await Promise.all([
    getMembers(), getMemberStats("2000-01-01", season.to), getRewards(), getMatches(), getAllParticipations(), getDues(), getMemberForm(vnMonth()),
    getPenalties(),
  ]);
  const m = members.find((x) => x.id === id);
  if (!m) notFound();
  const s = stats.get(m.id);
  const heroIds = new Set(rewards.results.map((r) => r.member_id));
  const mine = parts.filter((p) => p.member_id === m.id);
  const matchMap = new Map(matches.map((x) => [x.id, x]));
  const myDues = dues.filter((d) => d.member_id === m.id).sort((a, b) => b.obligation_month.localeCompare(a.obligation_month));
  const myRewards = rewards.results.filter((r) => r.member_id === m.id);

  return (
    <div className="space-y-6">
      <Link href="/members" className="text-sm text-teal hover:underline">← Thành viên</Link>
      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="mx-auto w-full max-w-[280px]">
          <FutCard member={m} stats={s} tier={tierFor(m, s, { heroIds, informIds: informSet(form) })} />
          <div className="mt-3">
            <ProfileButton memberId={m.id} fullName={m.full_name} nickname={m.nickname} version={m.version}
              positions={m.positions} primary={m.primary_position} avatarUrl={avatarUrl(m.avatar_path)} />
          </div>
        </div>
        <div className="space-y-6">
          <Panel className="p-5">
            <div className="font-display text-sm font-bold uppercase tracking-[0.3em] text-teal">#{m.shirt_number ?? "–"}</div>
            <h1 className="font-display text-4xl font-black uppercase italic">{displayName(m)}</h1>
            <div className="text-muted">{m.full_name}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip className={m.status === "active" ? "bg-neon/15 text-neon" : "bg-white/10 text-muted"}>{MEMBER_STATUS_LABEL[m.status]}</Chip>
              <Chip className="bg-white/8 text-fg">{FEE_TYPE_LABEL[m.fee_type]}</Chip>
              {m.positions.map((p) => (
                <Chip key={p} className={p === m.primary_position ? "bg-gold/20 text-gold" : "bg-white/8 text-fg"}>{POSITION_NAME[p] ?? p}</Chip>
              ))}
              <Chip className="bg-white/8 text-muted">Chân thuận: {FOOT_LABEL[m.preferred_foot]}</Chip>
              <Chip className="bg-white/8 text-muted">Gia nhập {fmtDate(m.joined_on)}</Chip>
            </div>
            <div className="mt-5 grid grid-cols-3 gap-4 sm:grid-cols-6">
              <Stat label="Ra sân" value={s?.appearances ?? 0} tone="neon" />
              <Stat label="Bàn thắng" value={s?.goals ?? 0} tone="gold" />
              <Stat label="Liên hoan" value={s?.gatherings ?? 0} />
              <Stat label="XN tham gia" value={s?.rsvp_yes ?? 0} hint="tách riêng ra sân" />
              <Stat label="Nhận thưởng" value={s?.rewards ?? 0} />
              <Stat label="Đã đóng quỹ" value={money(s?.paid_amount ?? 0)} />
            </div>
            {Number(s?.unconfirmed ?? 0) > 0 ? <p className="mt-3 text-xs text-warn">Có {s?.unconfirmed} dữ liệu điểm danh/bàn thắng chưa xác nhận — chưa được tính.</p> : null}
          </Panel>

          <Panel className="p-5">
            <SectionHead title="Chi tiết từng trận" />
            {mine.length === 0 ? <p className="text-sm text-muted">Chưa có dữ liệu thực tế.</p> : (
              <ul className="divide-y divide-white/5 text-sm">
                {mine.map((p) => matchMap.get(p.match_id)).filter(Boolean)
                  .sort((a, b) => b!.starts_at.localeCompare(a!.starts_at))
                  .map((mt) => {
                    const p = mine.find((x) => x.match_id === mt!.id)!;
                    return (
                      <li key={mt!.id} className="flex items-center justify-between gap-3 py-2">
                        <Link href={`/matches/${mt!.id}`} className="hover:text-neon">{fmtDate(mt!.starts_at)} · vs {mt!.opponent}</Link>
                        <span className="text-right text-muted">
                          {ATTEND_LABEL[p.actual_status]}{p.positions.length ? ` · ${p.positions.join("/")}` : ""}
                          {p.goals ? <b className="ml-1 text-gold">⚽ {p.goals}</b> : null}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel className="p-5">
              <SectionHead title="Đóng quỹ" />
              <ul className="space-y-1.5 text-sm">
                {myDues.map((d) => (
                  <li key={d.obligation_month} className="flex items-center justify-between">
                    <span>{monthLabel(d.obligation_month)}</span>
                    <span className="flex items-center gap-1.5">
                      <StatusChip map={DUE_STATUS} value={d.status} />
                      {d.overdue ? <Chip className="bg-danger/15 text-danger">Quá hạn</Chip> : null}
                    </span>
                  </li>
                ))}
                {myDues.length === 0 ? <li className="text-muted">Chưa có nghĩa vụ.</li> : null}
                {penalties.filter((p) => p.member_id === m.id).map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span>Phạt vắng vs {p.opponent} · {fmtDate(p.starts_at)}</span>
                    <span className="flex items-center gap-1.5">
                      {money(p.amount)} <StatusChip map={PENALTY_STATUS} value={p.status} />
                      {p.status === "unpaid" ? <Link href={`/funds/penalty?penalty=${p.id}`} className="btn btn-primary btn-sm">Nộp phạt</Link> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel className="p-5">
              <SectionHead title="Danh hiệu" />
              {myRewards.length === 0 ? <p className="text-sm text-muted">Chưa có.</p> : (
                <ul className="space-y-2 text-sm">
                  {myRewards.map((r) => {
                    const ev = rewards.events.find((e) => e.id === r.event_id);
                    const pr = rewards.prizes.find((p) => p.id === r.prize_id);
                    return (
                      <li key={r.id} className="rounded-lg border border-gold/25 bg-gold/5 p-2">
                        <b className="text-gold">{pr?.name}</b> — {ev?.title}
                        <div className="text-xs text-muted">{r.basis}{r.amount ? ` · ${money(r.amount)}` : ""}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}
