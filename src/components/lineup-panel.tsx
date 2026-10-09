import { Pitch } from "@/components/pitch";
import { Chip, Empty, Notice } from "@/components/ui";
import type { PubLineup, Rsvp } from "@/server/public-data";
import { POSITION_NAME, displayName, type PubMember } from "@/lib/domain";

/** Saved expected lineup (auto-arranged by chosen position + monthly form, or set manually by the admin). */
export function LineupView({ lineup, members, rsvps }: { lineup: PubLineup | null; members: PubMember[]; rsvps?: Rsvp[] }) {
  if (!lineup) return <Empty title="Chưa có đội hình" />;
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const chosen = new Map((rsvps ?? []).map((r) => [r.member_id, r.position_code]));
  const subs = lineup.slots.filter((s) => s.role === "sub").sort((a, b) => (a.sub_order ?? 0) - (b.sub_order ?? 0));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Chip className="bg-white/8 text-fg">Sơ đồ {lineup.formation} + GK</Chip>
        <Chip className={lineup.auto ? "bg-teal/15 text-teal" : "bg-violet/20 text-violet"}>{lineup.auto ? "Tự động" : "Quản lý xếp"}</Chip>
      </div>
      {lineup.status !== "published" ? <div className="mb-3"><Notice tone="warn">{lineup.needs_update_reason ?? "Đội hình cần cập nhật"}</Notice></div> : null}
      <Pitch formation={lineup.formation} members={memberMap}
        slots={Object.fromEntries(lineup.slots.filter((s) => s.role === "starter").map((s) => [s.slot_code!, s.member_id]))} />
      {subs.length > 0 ? (
        <div className="mt-3">
          <div className="label">Dự bị (theo phong độ)</div>
          <div className="flex flex-wrap gap-1.5">
            {subs.map((s) => {
              const m = memberMap.get(s.member_id);
              const pos = chosen.get(s.member_id);
              return m ? (
                <Chip key={s.member_id} className="bg-white/8 text-fg">
                  {s.sub_order}. #{m.shirt_number ?? "–"} {displayName(m)}{pos ? ` · ${POSITION_NAME[pos] ?? pos}` : ""}
                </Chip>
              ) : null;
            })}
          </div>
        </div>
      ) : null}
      <p className="mt-2 text-xs text-dim">
        Mỗi tuyến ưu tiên người đăng ký đúng tuyến có phong độ tháng tốt nhất; chỗ còn trống lấy người có sở trường tuyến đó rồi tới phong độ.
      </p>
    </div>
  );
}
