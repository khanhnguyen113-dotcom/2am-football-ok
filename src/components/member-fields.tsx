import { POSITIONS, FEE_TYPE_LABEL, FOOT_LABEL, MEMBER_STATUS_LABEL } from "@/lib/domain";

export type MemberEdit = {
  id?: string; full_name?: string; nickname?: string | null; shirt_number?: number | null; preferred_foot?: string;
  joined_on?: string; left_on?: string | null; status?: string; fee_type?: string; version?: number; positions?: string[]; primary?: string | null;
  birth_date?: string | null; phone?: string | null; private_note?: string | null;
};

/** Shared admin member form fields (server component markup; used inside AdminForm). */
export function MemberFields({ m }: { m?: MemberEdit }) {
  return (
    <>
      {m?.id ? <input type="hidden" name="id" value={m.id} /> : null}
      {m?.version ? <input type="hidden" name="version" value={m.version} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">Họ tên *</span><input name="full_name" required minLength={2} maxLength={80} defaultValue={m?.full_name} className="field" /></label>
        <label><span className="label">Tên thường gọi</span><input name="nickname" maxLength={80} defaultValue={m?.nickname ?? ""} className="field" /></label>
        <label><span className="label">Số áo (1–99)</span><input name="shirt_number" type="number" min={1} max={99} defaultValue={m?.shirt_number ?? ""} className="field" /></label>
        <label><span className="label">Chân thuận</span>
          <select name="preferred_foot" defaultValue={m?.preferred_foot ?? "unknown"} className="field">
            {Object.entries(FOOT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label><span className="label">Ngày gia nhập</span><input name="joined_on" type="date" defaultValue={m?.joined_on} className="field" /></label>
        <label><span className="label">Ngày kết thúc</span><input name="left_on" type="date" defaultValue={m?.left_on ?? ""} className="field" /></label>
        <label><span className="label">Trạng thái</span>
          <select name="status" defaultValue={m?.status ?? "active"} className="field">
            {Object.entries(MEMBER_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label><span className="label">Loại thành viên (mức quỹ)</span>
          <select name="fee_type" defaultValue={m?.fee_type ?? "standard"} className="field">
            {Object.entries(FEE_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label><span className="label">Ảnh đại diện (JPG/PNG/WebP ≤ 5MB)</span><input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="field" /></label>
      </div>
      <fieldset>
        <legend className="label">Tuyến sở trường (chọn nhiều) · tuyến chính</legend>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {POSITIONS.map((p) => (
            <div key={p.code} className="flex items-center justify-between gap-1 rounded-lg bg-white/4 px-2 py-1.5 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" name="positions" value={p.code} defaultChecked={m?.positions?.includes(p.code)} className="accent-[#c8ff3c]" />
                <b>{p.name}</b>
              </label>
              <label className="flex items-center gap-1 text-[0.7rem] text-muted" title="Vị trí chính">
                <input type="radio" name="primary" value={p.code} defaultChecked={m?.primary === p.code} className="accent-[#f3d27a]" />chính
              </label>
            </div>
          ))}
        </div>
      </fieldset>
      <div className="rounded-xl border border-white/8 p-3">
        <div className="label">Thông tin riêng (chỉ quản trị)</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="label">Ngày sinh</span><input name="birth_date" type="date" defaultValue={m?.birth_date ?? ""} className="field" /></label>
          <label><span className="label">Điện thoại</span><input name="phone" maxLength={20} defaultValue={m?.phone ?? ""} className="field" /></label>
          <label className="sm:col-span-2"><span className="label">Ghi chú riêng</span><input name="private_note" maxLength={1000} defaultValue={m?.private_note ?? ""} className="field" /></label>
        </div>
      </div>
    </>
  );
}
