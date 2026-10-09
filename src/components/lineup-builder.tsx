"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pitch, slotLabel } from "@/components/pitch";
import { FORMATIONS, POSITION_LINE, formationSlots, slotLine, displayName, type PubMember } from "@/lib/domain";
import { saveLineupAction } from "@/server/actions/admin";
import type { ActionResult } from "@/lib/errors";
import { Result, Spinner } from "@/components/forms";

type Slot = { member_id: string; role: "starter" | "sub"; slot_code: string | null; sub_order: number | null };

/** Button/select based lineup editor (no drag-and-drop required; works at 360px). */
export function LineupBuilder({ matchId, initialFormation, initialSlots, version, eligible, all, canPublish }: {
  matchId: string; initialFormation: string; initialSlots: Slot[]; version: number; eligible: PubMember[]; all: PubMember[]; canPublish: boolean;
}) {
  const router = useRouter();
  const [formation, setFormation] = useState(initialFormation);
  const [starters, setStarters] = useState<Record<string, string>>(
    Object.fromEntries(initialSlots.filter((s) => s.role === "starter" && s.slot_code).map((s) => [s.slot_code!, s.member_id])),
  );
  const [subs, setSubs] = useState<string[]>(
    initialSlots.filter((s) => s.role === "sub").sort((a, b) => (a.sub_order ?? 0) - (b.sub_order ?? 0)).map((s) => s.member_id),
  );
  const [ver, setVer] = useState(version);
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const [pending, start] = useTransition();
  const members = useMemo(() => new Map(all.map((m) => [m.id, m])), [all]);
  const eligibleIds = useMemo(() => new Set(eligible.map((m) => m.id)), [eligible]);
  const slots = formationSlots(formation);
  const used = new Set([...Object.entries(starters).filter(([k]) => slots.includes(k)).map(([, v]) => v), ...subs]);
  const filled = slots.filter((s) => starters[s] && eligibleIds.has(starters[s])).length;
  const ineligible = [...new Set([...slots.map((s) => starters[s]).filter(Boolean), ...subs])].filter((id) => !eligibleIds.has(id));
  const bench = eligible.filter((m) => !used.has(m.id));

  const warnings = slots.flatMap((s) => {
    const m = starters[s] ? members.get(starters[s]) : undefined;
    if (!m || m.positions.length === 0) return [];
    return m.positions.some((p) => POSITION_LINE[p] === slotLine(s)) ? [] : [`${displayName(m)} xếp ${slotLabel(s)} (sở trường ${m.positions.join("/")})`];
  });

  function save(publish: boolean) {
    const payload = [
      ...slots.filter((s) => starters[s]).map((s) => ({ member_id: starters[s], role: "starter", slot_code: s })),
      ...subs.map((id, i) => ({ member_id: id, role: "sub", sub_order: i + 1 })),
    ];
    start(async () => {
      const res = await saveLineupAction({ matchId, formation, slots: payload, version: ver, publish });
      setState(res);
      if (res.ok && res.data) {
        setVer(res.data.version);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="label mb-0">Sơ đồ</span>
        {FORMATIONS.map((f) => (
          <button key={f} type="button" onClick={() => setFormation(f)}
            className={`btn btn-sm ${f === formation ? "btn-primary" : "btn-ghost"}`}>{f}</button>
        ))}
        <span className={`ml-auto text-sm font-semibold ${filled === 7 ? "text-neon" : "text-warn"}`}>{filled}/7 chính thức{filled < 7 ? ` · thiếu ${7 - filled}` : ""}</span>
      </div>
      <Pitch formation={formation} members={members} slots={starters}
        render={(slot) => (
          <div className="flex w-full flex-col items-center gap-1">
            <div className={`grid h-11 w-11 place-items-center rounded-full font-display text-lg font-black ${starters[slot] ? (eligibleIds.has(starters[slot]) ? "bg-gold text-black" : "bg-danger text-white ring-2 ring-danger/50") : "border-2 border-dashed border-white/40 text-white/60"}`}>
              {starters[slot] ? members.get(starters[slot])?.shirt_number ?? "•" : slot === "GK" ? "GK" : "+"}
            </div>
            <select
              aria-label={`Chọn cầu thủ ${slotLabel(slot)}`}
              value={starters[slot] ?? ""}
              onChange={(e) => setStarters((s) => ({ ...s, [slot]: e.target.value }))}
              className="w-full max-w-[112px] rounded bg-black/70 px-1 py-1 text-[11px] font-semibold"
            >
              <option value="">{slotLabel(slot)}</option>
              {starters[slot] && members.get(starters[slot]) ? <option value={starters[slot]}>{displayName(members.get(starters[slot])!)}</option> : null}
              {bench.map((m) => <option key={m.id} value={m.id}>{displayName(m)} ({m.positions.join("/") || "?"})</option>)}
            </select>
          </div>
        )}
      />
      {ineligible.length ? <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">Không còn hợp lệ (không xác nhận Tham gia theo lịch hiện hành/không hoạt động): {ineligible.map((id) => (members.get(id) ? displayName(members.get(id)!) : id)).join(", ")} — hãy thay người trước khi công bố.</p> : null}
      {warnings.length ? <ul className="space-y-1 text-xs text-warn">{warnings.map((w) => <li key={w}>⚠ {w} — vẫn cho phép nếu người đó sẵn sàng.</li>)}</ul> : null}
      <div>
        <div className="label">Dự bị (thứ tự)</div>
        <ol className="space-y-1">
          {subs.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-lg bg-white/4 px-3 py-1.5 text-sm">
              <b className="w-5 text-muted">{i + 1}</b>
              <span className={`flex-1 ${eligibleIds.has(id) ? "" : "text-danger line-through"}`}>{members.get(id) ? displayName(members.get(id)!) : id}</span>
              <button type="button" className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => setSubs((s) => { const c = [...s]; [c[i - 1], c[i]] = [c[i], c[i - 1]]; return c; })}>↑</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSubs((s) => s.filter((x) => x !== id))}>✕</button>
            </li>
          ))}
        </ol>
        {bench.length > 0 ? (
          <select className="field mt-2" value="" onChange={(e) => e.target.value && setSubs((s) => [...s, e.target.value])}>
            <option value="">+ Thêm dự bị…</option>
            {bench.map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}
          </select>
        ) : null}
        {eligible.length === 0 ? <p className="mt-2 text-sm text-muted">Chưa có ai xác nhận Tham gia theo lịch hiện hành.</p> : null}
      </div>
      <Result state={state} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => save(false)} className="btn btn-ghost">{pending ? <Spinner /> : null}Lưu nháp</button>
        <button type="button" disabled={pending || !canPublish || filled !== 7 || !starters.GK || ineligible.length > 0} onClick={() => save(true)} className="btn btn-primary">Công bố đội hình</button>
      </div>
      {!canPublish ? <p className="text-xs text-dim">Chỉ công bố khi trận ở trạng thái Đã công bố.</p> : null}
    </div>
  );
}
