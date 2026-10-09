import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin";
import { AdminForm } from "@/components/admin-form";
import { MatchFields } from "@/components/match-fields";
import { saveMatchAction } from "@/server/actions/admin";
import { Chip, Panel, SectionHead, StatusChip } from "@/components/ui";
import { MATCH_STATUS } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Trận đấu" };

export default async function AdminMatches() {
  const { db } = await requireAdminPage();
  const [{ data: matches }, { data: lineups }] = await Promise.all([
    db.from("matches").select("*").order("starts_at", { ascending: false }).limit(60),
    db.from("lineups").select("match_id, status"),
  ]);
  const ls = new Map((lineups ?? []).map((l) => [l.match_id, l.status]));
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_520px]">
      <Panel className="p-4">
        <SectionHead title="Trận đấu" />
        <ul className="space-y-2">
          {(matches ?? []).map((m) => (
            <li key={m.id}>
              <Link href={`/admin/matches/${m.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 hover:border-neon/40">
                <span>
                  <b className="font-display text-lg uppercase">vs {m.opponent}</b>
                  <span className="block text-xs text-muted">{fmtDateTime(m.starts_at)} · {m.venue_name}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {ls.get(m.id) === "needs_update" ? <Chip className="bg-danger/15 text-danger">Đội hình cần cập nhật</Chip> : null}
                  {ls.get(m.id) === "published" ? <Chip className="bg-teal/15 text-teal">Đã có đội hình</Chip> : null}
                  {m.status === "completed" && !m.attendance_complete ? <Chip className="bg-warn/15 text-warn">Điểm danh chưa đủ</Chip> : null}
                  <StatusChip map={MATCH_STATUS} value={m.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="h-fit p-4">
        <SectionHead title="Tạo trận" sub="Chỉ cần ngày giờ đá. Đối thủ, sân và thông tin khác có thể bổ sung sau." />
        <AdminForm action={saveMatchAction} submit="Tạo trận">
          <MatchFields />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publish" className="accent-[#c8ff3c]" /> Công bố ngay (mở xác nhận)</label>
        </AdminForm>
      </Panel>
    </div>
  );
}
