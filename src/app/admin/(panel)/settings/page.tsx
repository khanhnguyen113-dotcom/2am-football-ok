import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin";
import { sp, type SP } from "@/server/view-helpers";
import { AdminForm } from "@/components/admin-form";
import { changePasswordAction, saveSettingsAction } from "@/server/actions/admin";
import { Chip, Pager, Panel, SectionHead } from "@/components/ui";
import { FORMATIONS } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Cài đặt & audit" };

export default async function AdminSettings({ searchParams }: { searchParams: SP }) {
  const q = await sp(searchParams);
  const page = Math.max(1, Number(q.page) || 1);
  const entity = q.entity || undefined;
  const { db, user } = await requireAdminPage();
  let aq = db.from("audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * 30, page * 30 - 1);
  if (entity) aq = aq.eq("entity", entity);
  const [{ data: t }, audit] = await Promise.all([db.from("team_settings").select("*").single(), aq]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-black uppercase italic">Cài đặt & audit</h1>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Panel className="p-4">
          <SectionHead title="Cấu hình đội" sub="Mức quỹ áp dụng cho nghĩa vụ tạo sau khi lưu (Miễn phí = 0 ₫). Loại thành viên chọn trong hồ sơ từng người. Thông tin nhận tiền được công khai trên form đóng quỹ." />
          <AdminForm action={saveSettingsAction} submit="Lưu cấu hình">
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="label">Tên đội</span><input name="team_name" defaultValue={t?.team_name} required className="field" /></label>
              <label><span className="label">Khẩu hiệu</span><input name="tagline" defaultValue={t?.tagline} className="field" /></label>
              <label><span className="label">Quỹ/tháng — Chính thức</span><input name="monthly_fee" type="number" min={0} step={1000} defaultValue={t?.monthly_fee} className="field" /></label>
              <label><span className="label">Quỹ/tháng — HSSV</span><input name="fee_student" type="number" min={0} step={1000} defaultValue={t?.fee_student} className="field" /></label>
              <label><span className="label">Quỹ/tháng — Duy trì (không đá)</span><input name="fee_maintain" type="number" min={0} step={1000} defaultValue={t?.fee_maintain} className="field" /></label>
              <label><span className="label">Phạt xác nhận đi nhưng vắng</span><input name="penalty_absent" type="number" min={0} step={1000} defaultValue={t?.penalty_absent} className="field" /></label>
              <label><span className="label">Ngày bắt đầu thu (tháng trước)</span><input name="collect_start_day" type="number" min={1} max={28} defaultValue={t?.collect_start_day} className="field" /></label>
              <label><span className="label">Hạn chót đóng (ngày trong tháng)</span><input name="due_day" type="number" min={1} max={28} defaultValue={t?.due_day} className="field" /></label>
              <label><span className="label">Ngân hàng</span><input name="bank_name" defaultValue={t?.bank_name ?? ""} className="field" /></label>
              <label><span className="label">Số tài khoản</span><input name="bank_account_no" defaultValue={t?.bank_account_no ?? ""} className="field" /></label>
              <label><span className="label">Chủ tài khoản</span><input name="bank_account_name" defaultValue={t?.bank_account_name ?? ""} className="field" /></label>
              <label><span className="label">Mẫu nội dung CK ({"{ten}"}, {"{thang}"})</span><input name="transfer_note_template" defaultValue={t?.transfer_note_template} className="field" /></label>
              <label><span className="label">Sơ đồ mặc định</span><select name="default_formation" defaultValue={t?.default_formation} className="field">{FORMATIONS.map((f) => <option key={f}>{f}</option>)}</select></label>
              <label><span className="label">Hạn RSVP trước trận (giờ)</span><input name="rsvp_hours_before" type="number" min={0} max={168} defaultValue={t?.rsvp_hours_before} className="field" /></label>
              <label className="sm:col-span-2"><span className="label">Danh mục chi (phân cách dấu phẩy)</span><input name="expense_categories" defaultValue={(t?.expense_categories ?? []).join(", ")} className="field" /></label>
              <label className="sm:col-span-2"><span className="label">Danh mục thu khác</span><input name="income_categories" defaultValue={(t?.income_categories ?? []).join(", ")} className="field" /></label>
            </div>
          </AdminForm>
        </Panel>
        <Panel className="h-fit p-4">
          <SectionHead title="Tài khoản quản trị" sub={`Đăng nhập: ${user.email}`} />
          <AdminForm action={changePasswordAction} submit="Đổi mật khẩu" reset>
            <input name="password" type="password" minLength={10} required autoComplete="new-password" placeholder="Mật khẩu mới (≥ 10 ký tự)" className="field" />
          </AdminForm>
          <p className="mt-3 text-xs text-dim">Chỉ một tài khoản quản trị. Không có đăng ký/mời thành viên. Khuyến nghị bật MFA trên Supabase khi triển khai thật.</p>
        </Panel>
      </div>

      <Panel className="p-4">
        <SectionHead title="Nhật ký thay đổi (audit)" sub="Ghi actor công khai/quản trị, tên tự khai, request ID, trước/sau tối thiểu." />
        <div className="scrollbar-none mb-3 flex gap-1.5 overflow-x-auto">
          {["", "members", "payment_submissions", "fund_ledger", "fund_requests", "match_rsvps", "matches", "lineups", "match_participations", "reward_results"].map((en) => (
            <a key={en} href={`/admin/settings${en ? `?entity=${en}` : ""}`} className={`chip ${entity === en || (!entity && !en) ? "bg-teal/20 text-teal" : "bg-white/8 text-muted"}`}>{en || "Tất cả"}</a>
          ))}
        </div>
        <ul className="divide-y divide-white/5 text-sm">
          {(audit.data ?? []).map((a) => (
            <li key={a.id} className="py-2">
              <div className="flex flex-wrap items-center gap-2">
                <Chip className={a.actor_kind === "admin" ? "bg-violet/20 text-violet" : a.actor_kind === "public" ? "bg-info/15 text-info" : "bg-white/10 text-muted"}>{a.actor_kind}</Chip>
                <b>{a.action}</b> <span className="text-muted">{a.entity}</span> <span className="font-mono text-xs text-dim">{a.entity_id}</span>
                <span className="ml-auto text-xs text-dim">{fmtDateTime(a.created_at)}</span>
              </div>
              {a.reason ? <div className="text-xs text-warn">Lý do: {a.reason}</div> : null}
              <details className="text-xs text-dim">
                <summary className="cursor-pointer">Chi tiết</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-black/40 p-2">{JSON.stringify({ request_id: a.request_id, claimed_member_id: a.claimed_member_id, before: a.before, after: a.after }, null, 1)}</pre>
              </details>
            </li>
          ))}
        </ul>
        <Pager page={page} total={audit.count ?? 0} size={30} href={(p) => `/admin/settings?${new URLSearchParams({ ...(entity ? { entity } : {}), page: String(p) })}`} />
      </Panel>
    </div>
  );
}
