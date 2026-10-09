import { CopyButton } from "@/components/copy-button";
import { SectionHead } from "@/components/ui";
import type { Team } from "@/server/public-data";

export function BankCard({ team, title = "Tài khoản nhận" }: { team: Team; title?: string }) {
  return (
    <>
      <SectionHead title={title} />
      {team.bank_account_no ? (
        <div className="space-y-3 text-sm">
          <div><div className="label">Ngân hàng</div>{team.bank_name}</div>
          <div>
            <div className="label">Số tài khoản</div>
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-3xl font-black tracking-wider text-neon">{team.bank_account_no}</span>
              <CopyButton text={team.bank_account_no.replace(/\s/g, "")} />
            </div>
          </div>
          <div><div className="label">Chủ tài khoản</div><span className="font-semibold uppercase">{team.bank_account_name}</span></div>
        </div>
      ) : <p className="text-sm text-muted">Chưa cấu hình thông tin nhận tiền.</p>}
    </>
  );
}
