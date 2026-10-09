import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/admin";
import { AdminForm } from "@/components/admin-form";
import { MatchFields } from "@/components/match-fields";
import { LineupBuilder } from "@/components/lineup-builder";
import {
  adminRsvpAction, enableAutoLineupAction, matchStatusAction, saveGatheringAction, saveMatchAction, saveParticipationAction,
} from "@/server/actions/admin";
import { Chip, Notice, Panel, SectionHead, StatusChip } from "@/components/ui";
import { ATTEND_LABEL, GATHER_LABEL, MATCH_STATUS, POSITIONS, RSVP_LABEL, displayName, type PubMember } from "@/lib/domain";
import { fmtDateTime, isoToLocalInput } from "@/lib/format";

export default async function AdminMatch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db } = await requireAdminPage();
  const [{ data: m }, { data: membersRaw }, { data: rsvps }, { data: lineup }, { data: parts }, { data: gathering }] = await Promise.all([
    db.from("matches").select("*").eq("id", id).maybeSingle(),
    db.from("pub_members").select("*").order("shirt_number"),
    db.from("match_rsvps").select("*").eq("match_id", id),
    db.from("lineups").select("*, lineup_slots(*)").eq("match_id", id).maybeSingle(),
    db.from("match_participations").select("*").eq("match_id", id),
    db.from("post_match_gatherings").select("*, gathering_attendance(*)").eq("match_id", id).maybeSingle(),
  ]);
  if (!m) notFound();
  const members = (membersRaw ?? []) as PubMember[];
  const rs = new Map((rsvps ?? []).map((r) => [r.member_id, r]));
  const eligible = members.filter((x) => x.status === "active" && rs.get(x.id)?.response === "yes" && rs.get(x.id)?.accepted_schedule_version === m.schedule_version);
  const pm = new Map((parts ?? []).map((p) => [p.member_id, p]));
  const lineupIds = new Set((lineup?.lineup_slots ?? []).map((s: { member_id: string }) => s.member_id));
  const starterIds = new Set((lineup?.lineup_slots ?? []).filter((s: { role: string }) => s.role === "starter").map((s: { member_id: string }) => s.member_id));
  // attendance candidates: RSVP yes/maybe + lineup + already recorded + (all active as fallback, sorted)
  const attendees = members.filter((x) => x.status === "active" || pm.has(x.id))
    .sort((a, b) => Number(lineupIds.has(b.id)) - Number(lineupIds.has(a.id)) || Number(rs.get(b.id)?.response === "yes") - Number(rs.get(a.id)?.response === "yes"));
  const ga = new Map(((gathering?.gathering_attendance ?? []) as { member_id: string; actual_status: string }[]).map((a) => [a.member_id, a.actual_status]));
  const past = new Date(m.starts_at) <= new Date();

  return (
    <div className="space-y-6">
      <Link href="/admin/matches" className="text-sm text-teal hover:underline">← Trận đấu</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl font-black uppercase italic">vs {m.opponent}</h1>
        <StatusChip map={MATCH_STATUS} value={m.status} />
        <Chip className="bg-white/8 text-muted">Lịch phiên bản {m.schedule_version}</Chip>
        <Link href={`/matches/${m.id}`} className="text-sm text-teal hover:underline">Xem công khai ↗</Link>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="p-4">
          <SectionHead title="Thông tin trận" sub="Đổi giờ/sân khi đã công bố sẽ yêu cầu mọi người xác nhận lại và đánh dấu đội hình cần cập nhật." />
          <AdminForm action={saveMatchAction} submit="Lưu thông tin">
            <MatchFields m={m} />
          </AdminForm>
        </Panel>
        <div className="space-y-6">
          <Panel className="p-4">
            <SectionHead title="Trạng thái" />
            <AdminForm action={matchStatusAction} className="space-y-2" actions={
              <>
                {m.status === "draft" || m.status === "postponed" ? <button name="status" value="published" className="btn btn-primary btn-sm">Công bố</button> : null}
                {m.status === "published" ? <button name="status" value="postponed" className="btn btn-ghost btn-sm">Hoãn</button> : null}
                {["draft", "published", "postponed"].includes(m.status) ? <button name="status" value="cancelled" className="btn btn-danger btn-sm">Hủy trận</button> : null}
              </>
            }>
              <input type="hidden" name="id" value={m.id} />
              <input type="hidden" name="version" value={m.version} />
              <input name="reason" placeholder="Lý do (bắt buộc khi hủy)" className="field" />
              <p className="text-xs text-dim">Hoàn tất trận ở mục Điểm danh sau trận. Trận hủy không tính ra sân và không tự hủy tiền sân đã chi.</p>
            </AdminForm>
          </Panel>
          <Panel className="p-4">
            <SectionHead title="Xác nhận tham gia" sub={`Hạn: ${fmtDateTime(m.rsvp_deadline)}. Quản trị sửa hộ kèm lý do.`} />
            <ul className="max-h-80 space-y-1 overflow-y-auto pr-1 text-sm">
              {members.filter((x) => x.status === "active").map((x) => {
                const r = rs.get(x.id);
                return (
                  <li key={x.id} className="flex items-center justify-between gap-2 rounded bg-white/3 px-2 py-1.5">
                    <span className="truncate">{displayName(x)}</span>
                    <span className="text-xs text-muted">
                      Đi đá: {RSVP_LABEL[r?.response ?? "no_response"]}{r?.position_code && r.response === "yes" ? ` (${r.position_code})` : ""} · LH {GATHER_LABEL[r?.gathering_response ?? "no_response"]}
                      {r && r.accepted_schedule_version < m.schedule_version ? <b className="text-warn"> · cần XN lại</b> : null}
                      {r?.private_note ? <span className="block text-dim">“{r.private_note}”</span> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            <AdminForm action={adminRsvpAction} className="mt-3 grid gap-2 sm:grid-cols-2" submit="Cập nhật hộ">
              <input type="hidden" name="match_id" value={m.id} />
              <select name="member_id" required className="field"><option value="">Thành viên…</option>{members.filter((x) => x.status === "active").map((x) => <option key={x.id} value={x.id}>{displayName(x)}</option>)}</select>
              <select name="response" className="field">{Object.entries(RSVP_LABEL).map(([k, v]) => <option key={k} value={k}>Đi đá: {v}</option>)}</select>
              <select name="gathering_response" className="field">{Object.entries(GATHER_LABEL).map(([k, v]) => <option key={k} value={k}>Liên hoan: {v}</option>)}</select>
              <select name="position_code" className="field"><option value="">Tuyến (mặc định sở trường)</option>{POSITIONS.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select>
              <input name="reason" required placeholder="Lý do" className="field" />
            </AdminForm>
          </Panel>
        </div>
      </div>

      <Panel className="p-4">
        <SectionHead title="Đội hình sân 7"
          sub={lineup?.auto === false
            ? "Đang xếp thủ công — RSVP mới không tự thay đổi đội hình."
            : "Đang TỰ ĐỘNG xếp theo tuyến đăng ký (không phân biệt trái/phải) + phong độ tháng và lưu mỗi khi có xác nhận mới. Lưu/công bố thủ công sẽ tắt chế độ tự động."}
          action={lineup?.auto === false ? (
            <AdminForm action={enableAutoLineupAction} actions={<button className="btn btn-primary btn-sm">Bật lại tự động xếp</button>}>
              <input type="hidden" name="match_id" value={m.id} />
            </AdminForm>
          ) : null} />
        {lineup?.status === "needs_update" ? <div className="mb-3"><Notice tone="danger">Cần cập nhật: {lineup.needs_update_reason}</Notice></div> : null}
        <LineupBuilder matchId={m.id} initialFormation={lineup?.formation ?? "2-3-1"} initialSlots={lineup?.lineup_slots ?? []}
          version={lineup?.version ?? 0} eligible={eligible} all={members} canPublish={m.status === "published"} />
      </Panel>

      <Panel className="p-4">
        <div id="attendance" className="scroll-mt-24" />
        <SectionHead title="Điểm danh thực tế sau trận" sub="RSVP/đội hình chỉ là gợi ý. Không xác nhận ≠ vắng. Bàn thắng chỉ cho người đã thi đấu." />
        {!past ? <Notice tone="info">Trận chưa diễn ra.</Notice> : m.status === "cancelled" ? <Notice tone="danger">Trận đã hủy.</Notice> : (
          <AdminForm action={saveParticipationAction} submit="Lưu điểm danh" className="space-y-3">
            <input type="hidden" name="match_id" value={m.id} />
            <div className="space-y-1.5">
              {attendees.map((x) => {
                const p = pm.get(x.id);
                return (
                  <div key={x.id} className="grid gap-2 rounded-lg bg-white/3 p-2 text-sm lg:grid-cols-[180px_200px_120px_1fr_150px] lg:items-center">
                    <input type="hidden" name="member_ids" value={x.id} />
                    {p ? <input type="hidden" name={`had_${x.id}`} value="1" /> : null}
                    <span className="truncate font-semibold">{displayName(x)}{lineupIds.has(x.id) ? <span className="ml-1 text-[0.65rem] text-teal">{starterIds.has(x.id) ? "ĐH" : "DB"}</span> : null}</span>
                    <select name={`status_${x.id}`} defaultValue={p?.actual_status ?? "unconfirmed"} className="field min-h-9 py-1 text-sm">
                      {Object.entries(ATTEND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select name={`starter_${x.id}`} defaultValue={p?.was_starter === null || p?.was_starter === undefined ? (lineupIds.has(x.id) ? String(starterIds.has(x.id)) : "") : String(p.was_starter)} className="field min-h-9 py-1 text-sm">
                      <option value="">—</option><option value="true">Chính thức</option><option value="false">Dự bị</option>
                    </select>
                    <div className="flex flex-wrap gap-1">
                      {POSITIONS.map((po) => (
                        <label key={po.code} className="flex items-center gap-0.5 text-[0.7rem]">
                          <input type="checkbox" name={`pos_${x.id}`} value={po.code} defaultChecked={p?.positions?.includes(po.code)} className="accent-[#c8ff3c]" />{po.name}
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input name={`goals_${x.id}`} type="number" min={0} max={30} defaultValue={p?.goals ?? ""} placeholder="Bàn" className="field min-h-9 w-16 py-1 text-sm" />
                      <label className="flex items-center gap-1 text-[0.7rem]"><input type="checkbox" name={`gc_${x.id}`} defaultChecked={p?.goals_confirmed} className="accent-[#c8ff3c]" />XN bàn</label>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <label><span className="label">Tỉ số đội</span><input name="score_us" type="number" min={0} defaultValue={m.score_us ?? ""} className="field" /></label>
              <label><span className="label">Đối thủ</span><input name="score_them" type="number" min={0} defaultValue={m.score_them ?? ""} className="field" /></label>
              <label className="sm:col-span-2"><span className="label">Ghi chú sau trận (công khai)</span><input name="post_note" defaultValue={m.post_note ?? ""} className="field" /></label>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" name="attendance_complete" defaultChecked={m.attendance_complete} className="accent-[#c8ff3c]" /> Đã rà soát đủ điểm danh</label>
              {m.status !== "completed" ? <label className="flex items-center gap-2"><input type="checkbox" name="complete" className="accent-[#c8ff3c]" /> Hoàn tất trận</label> : null}
            </div>
            {m.status === "completed" ? <input name="reason" required placeholder="Lý do sửa dữ liệu đã chốt" className="field" /> : null}
          </AdminForm>
        )}
      </Panel>

      <Panel className="p-4">
        <SectionHead title="Liên hoan sau trận" sub="Độc lập với thi đấu. Mỗi trận tối đa một buổi; buổi hủy không tính." />
        <AdminForm action={saveGatheringAction} submit="Lưu liên hoan">
          <input type="hidden" name="match_id" value={m.id} />
          <div className="grid gap-2 sm:grid-cols-4">
            <label><span className="label">Thời gian</span><input name="starts_at" type="datetime-local" defaultValue={isoToLocalInput(gathering?.starts_at)} className="field" /></label>
            <label><span className="label">Địa điểm</span><input name="location" defaultValue={gathering?.location ?? ""} className="field" /></label>
            <label><span className="label">Trạng thái</span>
              <select name="status" defaultValue={gathering?.status ?? "planned"} className="field"><option value="planned">Dự kiến</option><option value="done">Đã diễn ra</option><option value="cancelled">Đã hủy</option></select></label>
            <label><span className="label">Ghi chú</span><input name="note" defaultValue={gathering?.note ?? ""} className="field" /></label>
          </div>
          {gathering && past ? (
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {members.filter((x) => x.status === "active" || ga.has(x.id)).map((x) => (
                <label key={x.id} className="flex items-center justify-between gap-2 rounded bg-white/3 px-2 py-1.5 text-sm">
                  <input type="hidden" name="member_ids" value={x.id} />
                  <span className="truncate">{displayName(x)} <span className="text-[0.65rem] text-dim">({GATHER_LABEL[rs.get(x.id)?.gathering_response ?? "no_response"]})</span></span>
                  <select name={`g_${x.id}`} defaultValue={ga.get(x.id) ?? "unconfirmed"} className="rounded bg-black/50 px-1 py-1 text-xs">
                    <option value="unconfirmed">Chưa XN</option><option value="attended">Có tham gia</option><option value="not_attended">Không</option>
                  </select>
                </label>
              ))}
            </div>
          ) : <p className="text-xs text-dim">Điểm danh liên hoan hiện ra sau khi lưu buổi và trận đã diễn ra.</p>}
        </AdminForm>
      </Panel>
    </div>
  );
}
