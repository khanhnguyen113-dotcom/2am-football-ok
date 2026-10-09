import type { Metadata } from "next";
import { getDues, getMembers, getPenalties, getTeam } from "@/server/public-data";
import { collectionMonth, feeFor, memberOptions } from "@/server/view-helpers";
import { PayForm } from "@/components/public-forms";
import { BankCard } from "@/components/bank-card";
import { PageHeader, Panel } from "@/components/ui";
import { FEE_TYPE_LABEL, displayName } from "@/lib/domain";
import { money, vnMonth } from "@/lib/format";

export const metadata: Metadata = { title: "Đóng quỹ" };

export default async function PayPage() {
  const [team, members, dues, penalties] = await Promise.all([getTeam(), getMembers(), getDues(), getPenalties()]);
  const target = collectionMonth(team);
  const payers = members.filter((m) => m.status === "active" || m.status === "paused");
  const options = memberOptions(members, (m) => m.status === "active" || m.status === "paused").map((o) => {
    const m = payers.find((x) => x.id === o.id)!;
    const fee = feeFor(team, m.fee_type);
    return { ...o, sub: [o.sub, m.fee_type !== "standard" ? FEE_TYPE_LABEL[m.fee_type] : null].filter(Boolean).join(" · ") || undefined,
      name: displayName(m), active: m.status === "active", fee };
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker="Không cần đăng nhập · 100% chuyển khoản" title="Đóng quỹ">
        Mức quỹ/tháng: chính thức {money(team.monthly_fee)} · HSSV {money(team.fee_student)} · duy trì {money(team.fee_maintain)} · miễn phí 0 ₫.
        Thu từ ngày {team.collect_start_day} tháng trước, hạn chót ngày {team.due_day} hàng tháng.
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel className="p-5" cut>
          <PayForm options={options} dues={dues.map((d) => ({ member_id: d.member_id, obligation_month: d.obligation_month, amount_due: d.amount_due, status: d.status }))}
            penalties={penalties.map((p) => ({ id: p.id, member_id: p.member_id, amount: p.amount, opponent: p.opponent, starts_at: p.starts_at, status: p.status }))}
            currentMonth={vnMonth()} defaultMonth={target} noteTemplate={team.transfer_note_template} />
        </Panel>
        <Panel className="h-fit p-5 lg:sticky lg:top-6">
          <BankCard team={team} />
        </Panel>
      </div>
    </div>
  );
}
