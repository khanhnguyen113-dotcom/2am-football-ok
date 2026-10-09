import type { Metadata } from "next";
import { getMembers, getPenalties, getTeam } from "@/server/public-data";
import { sp, type SP } from "@/server/view-helpers";
import { PenaltyPay } from "@/components/public-forms";
import { BankCard } from "@/components/bank-card";
import { PageHeader } from "@/components/ui";
import { displayName } from "@/lib/domain";
import { money } from "@/lib/format";

export const metadata: Metadata = { title: "Nộp phạt" };

export default async function PenaltyPayPage({ searchParams }: { searchParams: SP }) {
  const q = await sp(searchParams);
  const [team, members, penalties] = await Promise.all([getTeam(), getMembers(), getPenalties()]);
  const names = Object.fromEntries(members.map((m) => [m.id, displayName(m)]));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader kicker="Không cần đăng nhập · 100% chuyển khoản" title="Nộp phạt">
        Xác nhận đi đá nhưng điểm danh sau trận vắng mặt bị phạt {money(team.penalty_absent)}/trận.
      </PageHeader>
      <PenaltyPay
        names={names}
        penalties={penalties.map((p) => ({ id: p.id, member_id: p.member_id, amount: p.amount, opponent: p.opponent, starts_at: p.starts_at, status: p.status }))}
        initialId={q.penalty}
        noteTemplate={team.transfer_note_template}
        bank={<BankCard team={team} />}
      />
    </div>
  );
}
