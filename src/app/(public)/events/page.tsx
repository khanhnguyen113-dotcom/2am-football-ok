import type { Metadata } from "next";
import { getMatches, getMembers, getRewards } from "@/server/public-data";
import { Chip, Empty, PageHeader, Panel, StatusChip } from "@/components/ui";
import { DELIVERY_STATUS, POSITION_NAME, REWARD_STATUS, displayName } from "@/lib/domain";
import { fmtDate, money } from "@/lib/format";

export const metadata: Metadata = { title: "Thưởng" };

const TIE: Record<string, string> = { tiebreak: "Ưu tiên tiêu chí phụ", split: "Chia đều giải", manager: "Quản lý quyết định có lý do" };
const FUND: Record<string, string> = { fund: "Quỹ đội", sponsor: "Nhà tài trợ", item: "Hiện vật" };

export default async function EventsPage() {
  const [rewards, members, matches] = await Promise.all([getRewards(), getMembers(), getMatches()]);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const matchMap = new Map(matches.map((m) => [m.id, m]));

  return (
    <div className="space-y-8">
      <PageHeader kicker="Thể lệ công khai" title="Event thưởng" />

      <section>
        
        {rewards.events.length === 0 ? <Empty title="Chưa có event" /> : (
          <div className="grid gap-5 lg:grid-cols-2">
            {rewards.events.map((e) => {
              const prizes = rewards.prizes.filter((p) => p.event_id === e.id);
              const results = rewards.results.filter((r) => r.event_id === e.id);
              const scope = rewards.eventMatches.filter((x) => x.event_id === e.id).map((x) => matchMap.get(x.match_id)).filter(Boolean);
              return (
                <Panel key={e.id} className="overflow-hidden p-0">
                  <div className="relative bg-[linear-gradient(120deg,#2a0f55,#5a28b8_55%,#ff4fa3)] p-5">
                    <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "repeating-linear-gradient(120deg,#fff 0 1px,transparent 1px 10px)" }} />
                    <div className="relative flex items-start justify-between gap-2">
                      <div>
                        <div className="font-display text-xs font-bold uppercase tracking-[0.3em] text-pink-200">{fmtDate(e.starts_on)} – {fmtDate(e.ends_on)}</div>
                        <h3 className="font-display text-3xl font-black uppercase italic leading-none text-white">{e.title}</h3>
                      </div>
                      <StatusChip map={REWARD_STATUS} value={e.status} />
                    </div>
                    {e.description ? <p className="relative mt-2 text-sm text-white/80">{e.description}</p> : null}
                  </div>
                  <div className="space-y-4 p-5 text-sm">
                    <div className="flex flex-wrap gap-1.5">
                      {prizes.map((p) => (
                        <Chip key={p.id} className="bg-gold/15 text-gold">
                          {p.name}: {p.amount_each > 0 ? money(p.amount_each) : p.item_desc ?? "Hiện vật"} × {p.winners_count}
                        </Chip>
                      ))}
                    </div>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
                      <dt className="text-muted">Đối tượng</dt>
                      <dd>{e.audience === "all" ? "Toàn đội" : e.audience === "positions" ? e.audience_positions.map((p) => POSITION_NAME[p] ?? p).join(", ") : "Danh sách chọn"}{e.requires_played ? " · phải thực tế ra sân" : ""}</dd>
                      <dt className="text-muted">Cách xét</dt><dd>{e.method === "goals" ? "Tính theo bàn thắng đã xác nhận" : "Quản lý đánh giá"}</dd>
                      <dt className="text-muted">Đồng giải</dt><dd>{TIE[e.tie_rule]}{e.tie_note ? ` — ${e.tie_note}` : ""}</dd>
                      <dt className="text-muted">Nguồn thưởng</dt><dd>{FUND[e.funding_source]}{e.budget_max ? ` · tối đa ${money(e.budget_max)}` : ""}</dd>
                      {scope.length ? <><dt className="text-muted">Trận hợp lệ</dt><dd>{scope.map((m) => `vs ${m!.opponent} (${fmtDate(m!.starts_at)})`).join(", ")}</dd></> : null}
                    </dl>
                    <div className="rounded-lg bg-black/25 p-3">
                      <div className="label">Thể lệ (phiên bản {e.rules_version})</div>
                      <p className="whitespace-pre-line">{e.rules || "—"}</p>
                      {e.exclusions ? <p className="mt-1 text-muted">Loại trừ: {e.exclusions}</p> : null}
                    </div>
                    {e.status === "cancelled" ? <p className="text-danger">Đã hủy: {e.cancel_reason}</p> : null}
                    {results.length > 0 ? (
                      <div>
                        <div className="label">Kết quả</div>
                        <ul className="space-y-1.5">
                          {results.map((r) => {
                            const p = prizes.find((x) => x.id === r.prize_id);
                            const m = memberMap.get(r.member_id);
                            return (
                              <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2">
                                <span><b className="text-gold">{p?.name}</b> · {m ? displayName(m) : "—"}<span className="block text-xs text-muted">{r.basis}</span></span>
                                <span className="text-right text-xs">{r.amount ? money(r.amount) : ""}<span className="block text-muted">{DELIVERY_STATUS[r.delivery_status]}</span></span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </Panel>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
