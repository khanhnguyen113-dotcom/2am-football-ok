import { isoToLocalInput } from "@/lib/format";

export type MatchEdit = Record<string, string | number | null | undefined>;

export function MatchFields({ m }: { m?: MatchEdit }) {
  const v = (k: string) => (m?.[k] ?? "") as string | number;
  return (
    <>
      {m?.id ? <input type="hidden" name="id" value={m.id as string} /> : null}
      {m?.version ? <input type="hidden" name="version" value={m.version as number} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="label">Ngày giờ đá *</span><input name="starts_at" type="datetime-local" required defaultValue={isoToLocalInput(m?.starts_at as string)} className="field" /></label>
        <label><span className="label">Đối thủ</span><input name="opponent" maxLength={120} defaultValue={v("opponent")} placeholder="Chưa chốt cũng được" className="field" /></label>
        <label><span className="label">Sân</span><input name="venue_name" defaultValue={v("venue_name")} placeholder="Có thể bổ sung sau" className="field" /></label>
        <label className="sm:col-span-2"><span className="label">Ghi chú</span><input name="note" defaultValue={v("note")} className="field" /></label>
      </div>
      <details className="rounded-xl border border-white/10 p-3">
        <summary className="cursor-pointer text-sm text-muted">Thông tin thêm (không bắt buộc)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label><span className="label">Loại trận</span>
          <select name="match_type" defaultValue={(m?.match_type as string) ?? "friendly"} className="field"><option value="friendly">Giao hữu</option><option value="tournament">Giải</option></select>
        </label>
        <label><span className="label">Hạn xác nhận</span><input name="rsvp_deadline" type="datetime-local" defaultValue={isoToLocalInput(m?.rsvp_deadline as string)} className="field" /><span className="mt-1 block text-xs text-dim">Để trống: trước giờ đá 24 tiếng.</span></label>
        <label><span className="label">Người phụ trách</span><input name="coordinator" defaultValue={v("coordinator")} className="field" /></label>
        <label><span className="label">Số sân</span><input name="pitch_no" defaultValue={v("pitch_no")} className="field" /></label>
        <label className="sm:col-span-2"><span className="label">Địa chỉ</span><input name="address" defaultValue={v("address")} className="field" /></label>
        <label><span className="label">Link chỉ đường</span><input name="map_url" type="url" defaultValue={v("map_url")} className="field" placeholder="https://maps…" /></label>
        <label><span className="label">Gửi xe / tập trung</span><input name="parking_note" defaultValue={v("parking_note")} className="field" /></label>
        <label><span className="label">Chi phí sân dự kiến</span><input name="pitch_cost_estimate" type="number" min={0} step={1000} defaultValue={v("pitch_cost_estimate")} className="field" /></label>
        <label><span className="label">Phần đội trả (dự toán)</span><input name="team_share_estimate" type="number" min={0} step={1000} defaultValue={v("team_share_estimate")} className="field" /></label>
        <label><span className="label">Liên hệ đối thủ (riêng tư)</span><input name="opponent_contact" defaultValue={v("opponent_contact")} className="field" /></label>
        </div>
      </details>
    </>
  );
}
