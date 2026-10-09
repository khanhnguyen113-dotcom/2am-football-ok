import Link from "next/link";
import type { Metadata } from "next";
import { requireAdminPage } from "@/server/admin";
import { AdminForm } from "@/components/admin-form";
import { RewardFields } from "@/components/reward-fields";
import { saveRewardAction } from "@/server/actions/admin";
import { Empty, Panel, SectionHead, StatusChip } from "@/components/ui";
import { REWARD_STATUS, type PubMember } from "@/lib/domain";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Thưởng" };

export default async function AdminEvents() {
  const { db } = await requireAdminPage();
  const [{ data: membersRaw }, { data: events }, { data: matches }] = await Promise.all([
    db.from("pub_members").select("*").order("shirt_number"),
    db.from("reward_events").select("*").order("starts_on", { ascending: false }),
    db.from("matches").select("id, opponent, starts_at, status").neq("status", "draft").order("starts_at", { ascending: false }).limit(20),
  ]);
  const members = (membersRaw ?? []) as PubMember[];

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_560px]">
      <Panel className="h-fit p-4">
        <SectionHead title="Event thưởng" />
        {(events ?? []).length === 0 ? <Empty title="Chưa có event" /> : (
          <ul className="space-y-2">
            {(events ?? []).map((e) => (
              <li key={e.id}>
                <Link href={`/admin/events/${e.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 hover:border-violet/50">
                  <span><b className="font-display text-lg uppercase italic">{e.title}</b><span className="block text-xs text-muted">{fmtDate(e.starts_on)} – {fmtDate(e.ends_on)}</span></span>
                  <StatusChip map={REWARD_STATUS} value={e.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel className="p-4">
        <SectionHead title="Tạo event thưởng" sub="Lưu ở trạng thái nháp; công bố trong trang chi tiết." />
        <AdminForm action={saveRewardAction} submit="Tạo (nháp)">
          <RewardFields matches={matches ?? []} members={members} />
        </AdminForm>
      </Panel>
    </div>
  );
}
