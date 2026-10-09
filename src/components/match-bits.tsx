import Link from "next/link";
import type { Match, Rsvp } from "@/server/public-data";
import { fmtTime, fmtWeekday, money, relativeFromNow } from "@/lib/format";
import { MATCH_STATUS, POSITION_LINE, LINE_LABEL, RSVP_LABEL, displayName, type Line, type PubMember } from "@/lib/domain";
import { Crest } from "@/components/brand";
import { StatusChip } from "@/components/ui";

export function MatchHero({ m, teamName, compact }: { m: Match; teamName: string; compact?: boolean }) {
  const done = m.status === "completed";
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(120deg,#0f2a31_0%,#0a1a20_45%,#1b1238_100%)] p-4 sm:p-6">
      <div className="pointer-events-none absolute -right-10 -top-16 h-56 w-56 rounded-full bg-neon/10 blur-3xl" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-display text-sm font-bold uppercase tracking-[0.25em] text-teal">
          {m.match_type === "tournament" ? "Giải đấu" : "Giao hữu"} · Sân 7
        </div>
        <StatusChip map={MATCH_STATUS} value={m.status} />
      </div>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex flex-col items-center text-center">
          <Crest size={compact ? 56 : 76} />
          <div className="mt-2 font-display text-lg font-black uppercase italic sm:text-2xl">{teamName}</div>
        </div>
        <div className="text-center">
          {done ? (
            <div className="font-display text-5xl font-black tabular-nums sm:text-6xl">
              {m.score_us ?? "-"}<span className="mx-1 text-muted">:</span>{m.score_them ?? "-"}
            </div>
          ) : (
            <>
              <div className="font-display text-4xl font-black text-neon glow-text sm:text-5xl">{fmtTime(m.starts_at)}</div>
              <div className="mt-1 text-xs font-semibold uppercase tracking-wider text-muted">{fmtWeekday(m.starts_at)}</div>
            </>
          )}
        </div>
        <div className="flex flex-col items-center text-center">
          <div className="grid place-items-center rounded-full border-2 border-white/15 bg-white/5 font-display text-2xl font-black uppercase" style={{ width: compact ? 56 : 76, height: compact ? 56 : 76 }}>
            {m.opponent.slice(0, 2)}
          </div>
          <div className="mt-2 font-display text-lg font-black uppercase italic sm:text-2xl">{m.opponent}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-black/25 px-3 py-2">
          <div className="text-xs uppercase tracking-wider text-dim">Sân</div>
          <div className="font-semibold">{m.venue_name}{m.pitch_no ? ` · sân số ${m.pitch_no}` : ""}</div>
          {m.address ? <div className="text-muted">{m.address}</div> : null}
          {m.map_url ? <a href={m.map_url} target="_blank" rel="noreferrer noopener" className="text-teal hover:underline">Chỉ đường ↗</a> : null}
        </div>
        <div className="rounded-lg bg-black/25 px-3 py-2">
          <div className="text-xs uppercase tracking-wider text-dim">{done ? "Ghi chú" : "Hạn xác nhận"}</div>
          {done ? (
            <div className="text-muted">{m.post_note ?? "—"}</div>
          ) : (
            <>
              <div className="font-semibold">{fmtTime(m.rsvp_deadline)} · {fmtWeekday(m.rsvp_deadline)}</div>
              <div className={new Date(m.rsvp_deadline) > new Date() ? "text-neon" : "text-warn"}>{relativeFromNow(m.rsvp_deadline)}</div>
            </>
          )}
          {m.team_share_estimate ? <div className="text-xs text-dim">Dự toán tiền sân đội trả: {money(m.team_share_estimate)}</div> : null}
          {m.parking_note ? <div className="text-xs text-dim">{m.parking_note}</div> : null}
        </div>
      </div>
      {compact ? (
        <Link href={`/matches/${m.id}`} className="btn btn-ghost btn-sm mt-4 w-full sm:w-auto">Chi tiết trận →</Link>
      ) : null}
    </div>
  );
}

/** RSVP counters + grouping by preferred line to spot missing GK/defenders. */
export function RsvpBoard({ rsvps, members }: { rsvps: Rsvp[]; members: PubMember[] }) {
  const active = members.filter((m) => m.status === "active");
  const byMember = new Map(rsvps.map((r) => [r.member_id, r]));
  const resp = (id: string) => byMember.get(id)?.response ?? "no_response";
  const count = (k: string) => active.filter((m) => resp(m.id) === k).length;
  const yes = active.filter((m) => resp(m.id) === "yes");
  const lines: Line[] = ["GK", "DEF", "MID", "FWD"];
  // group by the position chosen for this match (fallback: primary position)
  const posOf = (m: PubMember) => byMember.get(m.id)?.position_code ?? m.primary_position ?? m.positions[0] ?? "";
  const lineOf = (m: PubMember) => POSITION_LINE[posOf(m)] as Line | undefined;
  const gYes = active.filter((m) => byMember.get(m.id)?.gathering_response === "yes").length;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ["yes", "Đi", "text-neon"], ["no", "Không", "text-danger"], ["no_response", "Chưa P.hồi", "text-muted"],
        ].map(([k, l, c]) => (
          <div key={k} className="rounded-lg bg-black/25 py-2">
            <div className={`font-display text-3xl font-black ${c}`}>{count(k)}</div>
            <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">{l}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {lines.map((ln) => {
          const n = yes.filter((m) => lineOf(m) === ln).length;
          const warn = (ln === "GK" && n === 0) || (ln === "DEF" && n < 2);
          return (
            <div key={ln} className={`rounded-lg border px-3 py-2 ${warn ? "border-warn/40 bg-warn/10" : "border-white/8 bg-white/3"}`}>
              <div className="text-xs uppercase tracking-wider text-muted">{LINE_LABEL[ln]}</div>
              <div className={`font-display text-2xl font-black ${warn ? "text-warn" : ""}`}>{n}</div>
              {warn ? <div className="text-[0.7rem] text-warn">{ln === "GK" ? "Thiếu thủ môn!" : "Thiếu hậu vệ"}</div> : null}
            </div>
          );
        })}
      </div>
      <div className="text-xs text-muted">Liên hoan: <b className="text-fg">{gYes}</b> người xác nhận có.</div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {active.map((m) => {
          const r = byMember.get(m.id);
          const k = r?.response ?? "no_response";
          const tone = { yes: "text-neon", no: "text-danger", no_response: "text-dim" }[k];
          return (
            <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg bg-white/3 px-3 py-2 text-sm">
              <span className="truncate"><span className="mr-1.5 font-display font-black text-muted">{m.shirt_number ?? "–"}</span>{displayName(m)}</span>
              <span className={`shrink-0 text-xs font-semibold ${tone}`}>
                {k === "yes" ? "Đi" : RSVP_LABEL[k]}{k === "yes" && r?.position_code ? ` · ${LINE_LABEL[r.position_code as Line] ?? r.position_code}` : ""}{r?.needs_reconfirm ? " · cần XN lại" : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
