import type { Metadata } from "next";
import { getDonations, getTeam } from "@/server/public-data";
import { DonateForm } from "@/components/public-forms";
import { BankCard } from "@/components/bank-card";
import { Empty, PageHeader, Panel, SectionHead } from "@/components/ui";
import { fmtDate, money } from "@/lib/format";

export const metadata: Metadata = { title: "Ủng hộ" };

export default async function DonatePage() {
  const [team, donations] = await Promise.all([getTeam(), getDonations()]);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader kicker="Tiếp sức cho 2AM FC" title="Ủng hộ đội" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Panel className="p-5" cut><DonateForm /></Panel>
        <Panel className="h-fit p-5"><BankCard team={team} /></Panel>
      </div>
      <Panel className="p-5">
        <SectionHead title="Bảng vàng ủng hộ" />
        {donations.length === 0 ? <Empty title="Chưa có lượt ủng hộ nào" /> : (
          <ul className="divide-y divide-white/5">
            {donations.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-3 py-2.5">
                <div>
                  <div className="font-semibold">{d.donor_name ?? "Nhà hảo tâm"}</div>
                  {d.message ? <div className="text-sm text-muted">“{d.message}”</div> : null}
                </div>
                <div className="text-right">
                  <div className="font-display text-lg font-black text-gold">{money(d.amount)}</div>
                  <div className="text-xs text-dim">{fmtDate(d.reviewed_at)}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
