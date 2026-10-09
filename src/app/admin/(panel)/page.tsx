import Link from "next/link";
import { requireAdminPage } from "@/server/admin";
import { AdminForm } from "@/components/admin-form";
import { markNotificationsReadAction } from "@/server/actions/admin";
import { Panel, SectionHead, Stat } from "@/components/ui";
import { fmtDateTime, money } from "@/lib/format";

export default async function AdminHome() {
  const { db } = await requireAdminPage();
  const nowIso = new Date().toISOString();
  const [subs, reqPending, reqApproved, lineups, staleMatches, notes, balance] = await Promise.all([
    db.from("payment_submissions").select("group_ref").eq("status", "pending"),
    db.from("fund_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("fund_requests").select("amount").eq("status", "approved"),
    db.from("lineups").select("id, match_id, needs_update_reason").eq("status", "needs_update"),
    db.from("matches").select("id, opponent, starts_at, status, attendance_complete").lt("starts_at", nowIso)
      .or("status.eq.published,and(status.eq.completed,attendance_complete.eq.false)").order("starts_at", { ascending: false }),
    db.from("notifications").select("*").eq("audience", "admin").order("created_at", { ascending: false }).limit(20),
    db.rpc("fund_balance"),
  ]);
  const unread = (notes.data ?? []).filter((n) => !n.read_at).length;
  const committed = (reqApproved.data ?? []).reduce((a, r) => a + Number(r.amount), 0);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl font-black uppercase italic">Bàn điều khiển</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Tile href="/admin/funds?tab=receipts" label="Biên lai chờ duyệt" value={new Set((subs.data ?? []).map((x) => x.group_ref)).size} tone="info" />
        <Tile href="/admin/funds?tab=requests" label="Đề nghị chờ duyệt" value={reqPending.count ?? 0} tone="warn" />
        <Tile href="/admin/funds?tab=requests" label="Đã duyệt chờ chi" value={money(committed)} tone="gold" />
        <Tile href="/admin/matches" label="Đội hình cần cập nhật" value={lineups.data?.length ?? 0} tone="danger" />
        <Tile href="/admin/funds" label="Số dư sổ quỹ" value={money(Number(balance.data ?? 0))} tone="neon" />
      </div>

      {(staleMatches.data?.length ?? 0) > 0 ? (
        <Panel className="p-5">
          <SectionHead title="Cần ghi nhận sau trận" sub="Trận đã qua giờ nhưng chưa hoàn tất hoặc điểm danh chưa đủ." />
          <ul className="space-y-1.5 text-sm">
            {staleMatches.data!.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-lg bg-white/4 px-3 py-2">
                <span>vs {m.opponent} · {fmtDateTime(m.starts_at)}</span>
                <Link href={`/admin/matches/${m.id}#attendance`} className="text-teal hover:underline">Điểm danh →</Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel className="p-5">
        <SectionHead title={`Thông báo quản trị (${unread} chưa đọc)`}
          action={unread > 0 ? <AdminForm action={markNotificationsReadAction} submit="Đánh dấu đã đọc" /> : null} />
        <ul className="divide-y divide-white/5">
          {(notes.data ?? []).map((n) => (
            <li key={n.id} className={`flex items-start justify-between gap-3 py-2.5 ${n.read_at ? "opacity-60" : ""}`}>
              <div>
                {n.link ? <Link href={n.link} className="font-semibold hover:text-neon">{n.title}</Link> : <b>{n.title}</b>}
                {n.body ? <div className="text-sm text-muted">{n.body}</div> : null}
              </div>
              <span className="shrink-0 text-xs text-dim">{fmtDateTime(n.created_at)}</span>
            </li>
          ))}
          {(notes.data ?? []).length === 0 ? <li className="py-4 text-sm text-muted">Chưa có thông báo.</li> : null}
        </ul>
      </Panel>
    </div>
  );
}

function Tile({ href, label, value, tone }: { href: string; label: string; value: React.ReactNode; tone: "info" | "warn" | "gold" | "danger" | "neon" }) {
  return (
    <Link href={href} className="panel p-4 transition hover:border-neon/40">
      <Stat label={label} value={value} tone={tone === "warn" ? "gold" : tone} />
    </Link>
  );
}
