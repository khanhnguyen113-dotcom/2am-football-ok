import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/admin";
import { AdminForm } from "@/components/admin-form";
import { MemberFields } from "@/components/member-fields";
import { deleteMemberAction, restoreNameAction, saveMemberAction } from "@/server/actions/admin";
import { Panel, SectionHead } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";

export default async function AdminMember({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db } = await requireAdminPage();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: m }, { data: pos }, { data: priv }, { data: hist }] = await Promise.all([
    db.from("members").select("*").eq("id", id).maybeSingle(),
    db.from("member_positions").select("*").eq("member_id", id),
    db.from("member_private_details").select("*").eq("member_id", id).maybeSingle(),
    db.from("member_name_history").select("*").eq("member_id", id).order("created_at", { ascending: false }).limit(30),
  ]);
  if (!m) notFound();
  return (
    <div className="space-y-6">
      <Link href="/admin/members" className="text-sm text-teal hover:underline">← Thành viên</Link>
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <Panel className="p-4">
          <SectionHead title={m.nickname || m.full_name} sub={`ID ổn định: ${m.id} · phiên bản ${m.version}`} />
          <AdminForm action={saveMemberAction} submit="Lưu hồ sơ">
            <MemberFields m={{
              ...m, positions: (pos ?? []).map((p) => p.position_code), primary: (pos ?? []).find((p) => p.is_primary)?.position_code ?? null,
              birth_date: priv?.birth_date, phone: priv?.phone, private_note: priv?.private_note,
            }} />
          </AdminForm>
        </Panel>
        <div className="space-y-6">
          <Panel className="p-4">
            <SectionHead title="Lịch sử tên" sub="Gồm cả sửa công khai; khôi phục tạo một lần đổi tên mới." />
            <ul className="space-y-2 text-sm">
              {(hist ?? []).map((h) => (
                <li key={h.id} className="rounded-lg bg-white/4 p-2">
                  <div><span className="text-muted line-through">{h.old_full_name}{h.old_nickname ? ` (${h.old_nickname})` : ""}</span> → <b>{h.new_full_name}{h.new_nickname ? ` (${h.new_nickname})` : ""}</b></div>
                  <div className="mt-1 flex items-center justify-between text-xs text-dim">
                    <span>{h.actor_kind === "public" ? "Khách công khai" : "Quản trị"} · {fmtDateTime(h.created_at)}</span>
                    <AdminForm action={restoreNameAction} className="inline" submit="Khôi phục tên cũ">
                      <input type="hidden" name="history_id" value={h.id} />
                    </AdminForm>
                  </div>
                </li>
              ))}
              {(hist ?? []).length === 0 ? <li className="text-muted">Chưa đổi tên lần nào.</li> : null}
            </ul>
          </Panel>
          <Panel className="p-4">
            <SectionHead title="Xóa hồ sơ tạo nhầm" sub="Chỉ xóa được khi chưa có bất kỳ dữ liệu quỹ/trận/thưởng. Ngược lại hãy chuyển trạng thái Lưu trữ." />
            <AdminForm action={deleteMemberAction} confirm="Xóa vĩnh viễn hồ sơ này?" actions={<button className="btn btn-danger btn-sm">Xóa hồ sơ</button>}>
              <input type="hidden" name="id" value={m.id} />
            </AdminForm>
          </Panel>
        </div>
      </div>
    </div>
  );
}
