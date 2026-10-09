import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/admin";
import { AdminForm, IntentButton } from "@/components/admin-form";
import { RewardFields } from "@/components/reward-fields";
import { finalizeRewardAction, rewardResultAction, rewardStatusAction, saveRewardAction } from "@/server/actions/admin";
import { Chip, Notice, Panel, SectionHead, StatusChip } from "@/components/ui";
import { DELIVERY_STATUS, REWARD_STATUS, displayName, type PubMember } from "@/lib/domain";
import { money } from "@/lib/format";

export default async function AdminReward({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { db } = await requireAdminPage();
  const [{ data: e }, { data: prizes }, { data: em }, { data: el }, { data: membersRaw }, { data: matches }, { data: results }, { data: goals }] = await Promise.all([
    db.from("reward_events").select("*").eq("id", id).maybeSingle(),
    db.from("reward_prizes").select("*").eq("event_id", id).order("rank"),
    db.from("reward_event_matches").select("match_id").eq("event_id", id),
    db.from("reward_event_eligible_members").select("member_id").eq("event_id", id),
    db.from("pub_members").select("*").order("shirt_number"),
    db.from("matches").select("id, opponent, starts_at, status").neq("status", "draft").order("starts_at", { ascending: false }).limit(20),
    db.from("reward_results").select("*, reward_prizes!inner(event_id, name)").eq("reward_prizes.event_id", id),
    db.rpc("reward_goal_table", { p_event_id: id }),
  ]);
  if (!e) notFound();
  const members = (membersRaw ?? []) as PubMember[];
  const mm = new Map(members.map((m) => [m.id, m]));
  const locked = ["finalized", "cancelled"].includes(e.status);
  const goalRows = ((goals ?? []) as { member_id: string; goals: number | null; matches_played: number; data_complete: boolean }[])
    .sort((a, b) => Number(b.goals ?? 0) - Number(a.goals ?? 0));
  const complete = goalRows.length > 0 && goalRows.every((g) => g.data_complete);
  const totalPrize = (prizes ?? []).reduce((a, p) => a + p.winners_count * Number(p.amount_each), 0);

  return (
    <div className="space-y-6">
      <Link href="/admin/events" className="text-sm text-teal hover:underline">← Nhiệm vụ & thưởng</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl font-black uppercase italic">{e.title}</h1>
        <StatusChip map={REWARD_STATUS} value={e.status} />
        <Chip className="bg-white/8 text-muted">Thể lệ v{e.rules_version}</Chip>
        <Chip className="bg-gold/15 text-gold">Tổng giải {money(totalPrize)}{e.budget_max ? ` / NS ${money(e.budget_max)}` : ""}</Chip>
      </div>

      {!locked ? (
        <Panel className="p-4">
          <SectionHead title="Trạng thái" sub="Công bố sẽ snapshot thể lệ, giải và phạm vi trận." />
          <AdminForm action={rewardStatusAction} className="flex flex-wrap items-center gap-2" actions={<>
            {e.status === "draft" ? <button name="status" value="published" className="btn btn-primary btn-sm">Công bố</button> : null}
            {["published", "pending_final"].includes(e.status) ? <button name="status" value="running" className="btn btn-ghost btn-sm">Đang diễn ra</button> : null}
            {["published", "running"].includes(e.status) ? <button name="status" value="pending_final" className="btn btn-ghost btn-sm">Chờ chốt</button> : null}
            <button name="status" value="cancelled" className="btn btn-danger btn-sm">Hủy event</button>
          </>}>
            <input type="hidden" name="id" value={e.id} />
            <input name="reason" placeholder="Lý do (bắt buộc khi hủy)" className="field min-w-48 flex-1" />
          </AdminForm>
        </Panel>
      ) : null}

      {e.status !== "draft" && !locked ? (
        <Panel className="p-4">
          <SectionHead title="Chốt người thắng" sub="Chốt kết quả chưa làm giảm quỹ. Kiểm tra đối tượng, số suất và ngân sách." />
          {e.method === "goals" ? (
            <div className="mb-4">
              {!complete ? <Notice tone="warn">Chưa đủ căn cứ: trận trong phạm vi chưa hoàn tất hoặc bàn thắng chưa xác nhận — không coi là 0.</Notice> : null}
              <div className="mt-2 text-sm">
                <div className="label">Bảng bàn thắng đã xác nhận (gợi ý)</div>
                <ol className="space-y-1">
                  {goalRows.map((g, i) => (
                    <li key={g.member_id} className="flex justify-between rounded bg-white/4 px-2 py-1">
                      <span>{i + 1}. {mm.get(g.member_id) ? displayName(mm.get(g.member_id)!) : g.member_id}</span>
                      <span>⚽ {g.goals ?? 0} · {g.matches_played} trận</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
          <AdminForm action={finalizeRewardAction} submit="Chốt kết quả" confirm="Chốt kết quả? Sau khi chốt chỉ điều chỉnh bằng quy trình có lịch sử.">
            <input type="hidden" name="id" value={e.id} />
            {(prizes ?? []).map((p) => (
              <fieldset key={p.id} className="rounded-xl border border-gold/25 p-3">
                <legend className="px-1 font-display font-bold uppercase text-gold">{p.name} · {p.winners_count} suất · {money(p.amount_each)}/người</legend>
                {Array.from({ length: p.winners_count }).map((_, i) => {
                  const k = `${p.id}|${i}`;
                  return (
                    <div key={k} className="mt-2 grid gap-2 sm:grid-cols-[1fr_140px_1.4fr]">
                      <input type="hidden" name="winner_keys" value={k} />
                      <select name={`w_member_${k}`} defaultValue={e.method === "goals" && p.rank === 1 && i === 0 && complete ? goalRows[0]?.member_id : ""} className="field">
                        <option value="">— Không chọn —</option>
                        {members.filter((m) => m.status === "active").map((m) => <option key={m.id} value={m.id}>{displayName(m)}</option>)}
                      </select>
                      <input name={`w_amount_${k}`} type="number" min={0} step={1000} defaultValue={p.amount_each} className="field" title="Số tiền phân bổ thực tế" />
                      <input name={`w_basis_${k}`} placeholder="Căn cứ xét giải (bắt buộc)" className="field" />
                    </div>
                  );
                })}
              </fieldset>
            ))}
          </AdminForm>
        </Panel>
      ) : null}

      {(results ?? []).length > 0 ? (
        <Panel className="p-4">
          <SectionHead title="Kết quả & trao thưởng" sub="Tiền từ quỹ: tạo đề nghị chi → duyệt → ghi nhận thực chi → Đã trao. Mỗi kết quả tối đa một khoản chi còn hiệu lực." />
          <ul className="space-y-2">
            {(results ?? []).map((r) => (
              <li key={r.id} className={`rounded-xl border p-3 text-sm ${r.status === "voided" ? "border-white/5 opacity-50" : "border-gold/25 bg-gold/5"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b className="text-gold">{r.reward_prizes?.name}</b> · {mm.get(r.member_id) ? displayName(mm.get(r.member_id)!) : "—"} · {money(r.amount)}</span>
                  <Chip className="bg-white/8 text-fg">{r.status === "voided" ? `Đã hủy: ${r.void_reason}` : DELIVERY_STATUS[r.delivery_status]}</Chip>
                </div>
                <div className="text-xs text-muted">{r.basis}</div>
                {r.status === "active" ? (
                  <AdminForm action={rewardResultAction} className="mt-2 flex flex-wrap gap-2" actions={<>
                    {e.funding_source === "fund" && r.delivery_status === "not_delivered" && Number(r.amount) > 0 ? <IntentButton intent="payout" tone="primary">Tạo đề nghị chi</IntentButton> : null}
                    {e.funding_source !== "fund" && r.delivery_status !== "delivered" ? <IntentButton intent="delivered" tone="primary">Đã trao (ngoài quỹ)</IntentButton> : null}
                    {r.delivery_status === "not_delivered" ? <IntentButton intent="void" tone="danger" confirm="Hủy kết quả này?">Hủy kết quả</IntentButton> : null}
                  </>}>
                    <input type="hidden" name="result_id" value={r.id} />
                    {r.delivery_status === "not_delivered" ? <input name="reason" placeholder="Lý do (khi hủy)" className="field flex-1" /> : null}
                  </AdminForm>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {!locked ? (
        <Panel className="p-4">
          <SectionHead title="Thể lệ & cơ cấu" sub={e.status !== "draft" ? "Event đã công bố: sửa cần lý do, tạo phiên bản thể lệ mới và thông báo." : undefined} />
          <AdminForm action={saveRewardAction} submit="Lưu event">
            <RewardFields e={e} prizes={prizes ?? []} matchIds={(em ?? []).map((x) => x.match_id)} eligible={(el ?? []).map((x) => x.member_id)}
              matches={matches ?? []} members={members} />
          </AdminForm>
        </Panel>
      ) : null}
    </div>
  );
}
