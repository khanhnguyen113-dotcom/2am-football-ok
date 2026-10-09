import { POSITIONS, displayName, type PubMember } from "@/lib/domain";
import { fmtDate } from "@/lib/format";

type Ev = Record<string, unknown> & { id?: string; version?: number };
type PrizeIn = { name: string; winners_count: number; amount_each: number; item_desc: string | null };

export function RewardFields({ e, prizes, matchIds, eligible, matches, members }: {
  e?: Ev; prizes?: PrizeIn[]; matchIds?: string[]; eligible?: string[];
  matches: { id: string; opponent: string; starts_at: string; status: string }[]; members: PubMember[];
}) {
  const v = (k: string) => (e?.[k] ?? "") as string;
  const rows = [0, 1, 2, 3].map((i) => prizes?.[i]);
  return (
    <>
      {e?.id ? <input type="hidden" name="id" value={e.id} /> : null}
      {e?.version ? <input type="hidden" name="version" value={e.version} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="label">Tên event *</span><input name="title" required defaultValue={v("title")} className="field" /></label>
        <label className="sm:col-span-2"><span className="label">Mô tả</span><input name="description" defaultValue={v("description")} className="field" /></label>
        <label><span className="label">Bắt đầu *</span><input name="starts_on" type="date" required defaultValue={v("starts_on")} className="field" /></label>
        <label><span className="label">Kết thúc *</span><input name="ends_on" type="date" required defaultValue={v("ends_on")} className="field" /></label>
        <label><span className="label">Hạn chốt kết quả</span><input name="result_deadline" type="date" defaultValue={v("result_deadline")} className="field" /></label>
        <label><span className="label">Cách xét</span>
          <select name="method" defaultValue={v("method") || "manual"} className="field"><option value="manual">Quản lý đánh giá</option><option value="goals">Tính theo bàn thắng đã xác nhận</option></select></label>
        <label><span className="label">Đối tượng</span>
          <select name="audience" defaultValue={v("audience") || "all"} className="field"><option value="all">Toàn đội</option><option value="positions">Theo tuyến</option><option value="selected">Danh sách chọn</option></select></label>
        <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" name="requires_played" defaultChecked={e ? Boolean(e.requires_played) : true} className="accent-[#c8ff3c]" /> Phải thực tế ra sân</label>
      </div>
      <fieldset>
        <legend className="label">Tuyến (khi đối tượng = theo tuyến)</legend>
        <div className="flex flex-wrap gap-2">
          {POSITIONS.map((p) => (
            <label key={p.code} className="flex items-center gap-1 rounded bg-white/4 px-2 py-1 text-sm">
              <input type="checkbox" name="audience_positions" value={p.code} defaultChecked={((e?.audience_positions as string[]) ?? []).includes(p.code)} className="accent-[#c8ff3c]" />{p.name}
            </label>
          ))}
        </div>
      </fieldset>
      <details>
        <summary className="label cursor-pointer">Danh sách chọn (khi đối tượng = danh sách)</summary>
        <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-3">
          {members.filter((m) => m.status === "active").map((m) => (
            <label key={m.id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="eligible" value={m.id} defaultChecked={eligible?.includes(m.id)} className="accent-[#c8ff3c]" />{displayName(m)}</label>
          ))}
        </div>
      </details>
      <fieldset>
        <legend className="label">Trận hợp lệ trong phạm vi</legend>
        <div className="grid gap-1 sm:grid-cols-2">
          {matches.map((m) => (
            <label key={m.id} className="flex items-center gap-2 rounded bg-white/4 px-2 py-1 text-sm">
              <input type="checkbox" name="match_ids" value={m.id} defaultChecked={matchIds?.includes(m.id)} className="accent-[#c8ff3c]" />
              {fmtDate(m.starts_at)} vs {m.opponent} <span className="text-xs text-dim">({m.status})</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block"><span className="label">Thể lệ / điều kiện hợp lệ *</span><textarea name="rules" required rows={3} defaultValue={v("rules")} className="field" /></label>
      <label className="block"><span className="label">Tiêu chí loại trừ</span><input name="exclusions" defaultValue={v("exclusions")} className="field" /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">Đồng giải</span>
          <select name="tie_rule" defaultValue={v("tie_rule") || "manager"} className="field"><option value="tiebreak">Ưu tiên tiêu chí phụ</option><option value="split">Chia giải</option><option value="manager">Quản lý quyết định có lý do</option></select></label>
        <label><span className="label">Ghi chú đồng giải / phần lẻ</span><input name="tie_note" defaultValue={v("tie_note")} className="field" placeholder="VD: phần lẻ làm tròn xuống, dư trả lại quỹ" /></label>
        <label><span className="label">Nguồn thưởng</span>
          <select name="funding_source" defaultValue={v("funding_source") || "fund"} className="field"><option value="fund">Quỹ đội</option><option value="sponsor">Nhà tài trợ</option><option value="item">Hiện vật</option></select></label>
        <label><span className="label">Ngân sách tối đa (₫)</span><input name="budget_max" type="number" min={0} step={1000} defaultValue={v("budget_max")} className="field" /></label>
      </div>
      <fieldset>
        <legend className="label">Cơ cấu giải (tối đa 4 hạng)</legend>
        <div className="space-y-1.5">
          {rows.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_120px] gap-1.5 sm:grid-cols-[1fr_70px_130px_1fr]">
              <input name={`prize_name_${i}`} defaultValue={p?.name ?? ""} placeholder={`Hạng ${i + 1} — tên giải`} className="field" />
              <input name={`prize_count_${i}`} type="number" min={1} defaultValue={p?.winners_count ?? 1} title="Số người thắng" className="field" />
              <input name={`prize_amount_${i}`} type="number" min={0} step={1000} defaultValue={p?.amount_each ?? ""} placeholder="₫/người" className="field" />
              <input name={`prize_item_${i}`} defaultValue={p?.item_desc ?? ""} placeholder="Hiện vật (nếu có)" className="field col-span-3 sm:col-span-1" />
            </div>
          ))}
        </div>
      </fieldset>
      {e?.id && e.status !== "draft" ? <input name="reason" required placeholder="Lý do sửa thể lệ (bắt buộc khi đã công bố)" className="field" /> : null}
    </>
  );
}
