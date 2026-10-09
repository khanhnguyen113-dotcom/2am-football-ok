import Link from "next/link";
import type { Metadata } from "next";
import { getMemberForm, getMembers, getMemberStats, getRewards } from "@/server/public-data";
import { seasonRange, sp, type SP } from "@/server/view-helpers";
import { FutCard, informSet, tierFor } from "@/components/fut-card";
import { ProfileButton } from "@/components/public-forms";
import { Empty, PageHeader, Tabs } from "@/components/ui";
import { LINE_LABEL, POSITION_LINE, avatarUrl, displayName, type Line } from "@/lib/domain";
import { vnMonth } from "@/lib/format";

export const metadata: Metadata = { title: "Thành viên" };

export default async function MembersPage({ searchParams }: { searchParams: SP }) {
  const q = await sp(searchParams);
  const line = (["GK", "DEF", "MID", "FWD"] as Line[]).includes(q.line as Line) ? (q.line as Line) : undefined;
  const show = q.show === "all" ? "all" : "active";
  const term = (q.q ?? "").trim().toLowerCase();
  const season = seasonRange();
  const [members, stats, rewards, form] = await Promise.all([getMembers(), getMemberStats(season.from, season.to), getRewards(), getMemberForm(vnMonth())]);
  const heroIds = new Set(rewards.results.map((r) => r.member_id));
  const inform = informSet(form);

  const list = members.filter((m) => {
    if (show === "active" && m.status !== "active") return false;
    if (line && !m.positions.some((p) => POSITION_LINE[p] === line)) return false;
    if (term && !`${m.full_name} ${m.nickname ?? ""} ${m.shirt_number ?? ""}`.toLowerCase().includes(term)) return false;
    return true;
  });
  const link = (patch: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    const next = { line, show: show === "all" ? "all" : undefined, q: q.q, ...patch };
    Object.entries(next).forEach(([k, v]) => v && s.set(k, v));
    const str = s.toString();
    return `/members${str ? `?${str}` : ""}`;
  };

  return (
    <div>
      <PageHeader kicker={`Mùa ${season.year}`} title="Đội hình 2AM" />
      <Tabs
        active={line ?? "all"}
        items={[
          { key: "all", label: "Tất cả", href: link({ line: undefined }) },
          ...(["GK", "DEF", "MID", "FWD"] as Line[]).map((l) => ({ key: l, label: LINE_LABEL[l], href: link({ line: l }) })),
        ]}
      />
      <form className="mb-5 flex flex-wrap gap-2" action="/members">
        {line ? <input type="hidden" name="line" value={line} /> : null}
        <input name="q" defaultValue={q.q} placeholder="Tìm tên hoặc số áo…" className="field max-w-xs" />
        <select name="show" defaultValue={show} className="field w-auto">
          <option value="active">Đang hoạt động</option>
          <option value="all">Gồm cả tạm ngừng/đã nghỉ</option>
        </select>
        <button className="btn btn-ghost">Lọc</button>
      </form>

      {list.length === 0 ? (
        <Empty title="Không có thành viên phù hợp" />
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {list.map((m) => (
            <div key={m.id}>
              <Link href={`/members/${m.id}`} aria-label={`Hồ sơ ${displayName(m)}`}>
                <FutCard member={m} stats={stats.get(m.id)} tier={tierFor(m, stats.get(m.id), { heroIds, informIds: inform })} />
              </Link>
              <div className="mt-2 px-1">
                <div className="truncate text-center text-xs text-muted">{m.full_name}</div>
                <div className="mt-1.5">
                  <ProfileButton memberId={m.id} fullName={m.full_name} nickname={m.nickname} version={m.version}
                    positions={m.positions} primary={m.primary_position} avatarUrl={avatarUrl(m.avatar_path)} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
