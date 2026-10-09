import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin";
import { AdminForm } from "@/components/admin-form";
import { MemberFields } from "@/components/member-fields";
import { saveMemberAction } from "@/server/actions/admin";
import { Chip, Panel, SectionHead } from "@/components/ui";
import { MEMBER_STATUS_LABEL, avatarUrl, displayName, type PubMember } from "@/lib/domain";
import { Silhouette } from "@/components/fut-card";

export const metadata: Metadata = { title: "Thành viên" };

export default async function AdminMembers() {
  const { db } = await requireAdminPage();
  const { data } = await db.from("pub_members").select("*").order("status").order("shirt_number");
  const members = (data ?? []) as PubMember[];
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_480px]">
      <Panel className="p-4">
        <SectionHead title={`Thành viên (${members.length})`} sub="Không có tài khoản thành viên — hồ sơ chỉ do chủ website quản lý; mọi người chỉ sửa được tên." />
        <ul className="divide-y divide-white/5">
          {members.map((m) => (
            <li key={m.id}>
              <Link href={`/admin/members/${m.id}`} className="flex items-center gap-3 py-2.5 hover:bg-white/3">
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white/5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {m.avatar_path ? <img src={avatarUrl(m.avatar_path)!} alt="" className="h-full w-full object-cover" /> : <Silhouette color="#8fa9ad" id={m.id} />}
                </span>
                <span className="w-8 font-display text-xl font-black text-muted">{m.shirt_number ?? "–"}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{displayName(m)}</span>
                  <span className="block truncate text-xs text-muted">{m.full_name} · {m.positions.join(", ") || "chưa có vị trí"}</span>
                </span>
                <Chip className={m.status === "active" ? "bg-neon/15 text-neon" : "bg-white/10 text-muted"}>{MEMBER_STATUS_LABEL[m.status]}</Chip>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="h-fit p-4">
        <SectionHead title="Thêm thành viên" />
        <AdminForm action={saveMemberAction} submit="Thêm" reset>
          <MemberFields />
        </AdminForm>
      </Panel>
    </div>
  );
}
