import Link from "next/link";
import type { Metadata } from "next";
import { getDues, getExpectedExpenses, getFundSummary, getLedger, getMembers, getPenalties, getPeriods, getTeam } from "@/server/public-data";
import { sp, type SP } from "@/server/view-helpers";
import { Chip, Money, Pager, PageHeader, Panel, SectionHead, Stat, Tabs } from "@/components/ui";
import { LedgerList, MonthNav } from "@/components/ledger-list";
import { fmtDate, isMonth, money, monthLabel, shiftMonth, vnMonth } from "@/lib/format";
import { DUE_STATUS, PENALTY_STATUS, displayName } from "@/lib/domain";

export const metadata: Metadata = { title: "Quỹ đội" };

export default async function FundsPage({ searchParams }: { searchParams: SP }) {
  const q = await sp(searchParams);
  const tab = ["overview", "expenses", "income", "dues", "penalties"].includes(q.tab ?? "") ? q.tab! : "overview";
  const current = vnMonth();
  const month = isMonth(q.month) ? q.month : current;
  const page = Math.max(1, Number(q.page) || 1);
  const category = q.cat || undefined;
  const [team, summary, periods, members] = await Promise.all([getTeam(), getFundSummary(month), getPeriods(), getMembers()]);
  const months = Array.from(new Set([current, ...periods.map((p) => p.month), shiftMonth(current, -1)])).sort().reverse();
  const href = (patch: Record<string, string | number | undefined>) => {
    const s = new URLSearchParams();
    const next = { tab, month, cat: category, ...patch };
    Object.entries(next).forEach(([k, v]) => v !== undefined && v !== "" && s.set(k, String(v)));
    return `/funds?${s.toString()}`;
  };

  return (
    <div>
      <PageHeader kicker="Minh bạch quỹ" title="Quỹ đội" />
      <Panel className="mb-5 p-5">
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Số dư hiện tại" value={money(summary.balance)} tone="neon" />
          <Stat label="Quỹ khả dụng" value={money(summary.available)} />
          <Stat label={`Thu ${monthLabel(month)}`} value={money(summary.month_in)} tone="teal" />
          <Stat label={`Chi ${monthLabel(month)}`} value={money(summary.month_out)} tone="danger" />
          <Stat label="Còn phải thu" value={money(summary.outstanding)} tone="gold" />
          <Stat label="Biên lai chờ duyệt" value={money(summary.pending_amount)} tone="info" />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/funds/pay" className="btn btn-primary">Đóng quỹ</Link>
        </div>
      </Panel>

      <Tabs active={tab} items={[
        { key: "overview", label: "Tổng quan", href: href({ tab: "overview", page: undefined, cat: undefined }) },
        { key: "expenses", label: "Khoản chi", href: href({ tab: "expenses", page: undefined }) },
        { key: "income", label: "Khoản thu", href: href({ tab: "income", page: undefined, cat: undefined }) },
        { key: "dues", label: "Đóng quỹ", href: href({ tab: "dues", page: undefined, cat: undefined }) },
        { key: "penalties", label: "Tiền phạt", href: href({ tab: "penalties", page: undefined, cat: undefined }) },
      ]} />

      {tab === "overview" ? <Overview periods={periods} team={team} /> : null}
      {tab === "expenses" || tab === "income" ? (
        <LedgerTab flow={tab === "expenses" ? "expense" : "income"} month={month} months={months} page={page} category={category}
          categories={tab === "expenses" ? team.expense_categories : ["Quỹ tháng", ...team.income_categories]} href={href} />
      ) : null}
      {tab === "dues" ? <DuesGrid months={months.slice(0, 4).reverse()} members={members} /> : null}
      {tab === "penalties" ? <PenaltiesTab members={members} amount={team.penalty_absent} /> : null}
    </div>
  );
}

async function Overview({ periods, team }: { periods: Awaited<ReturnType<typeof getPeriods>>; team: Awaited<ReturnType<typeof getTeam>> }) {
  const expected = await getExpectedExpenses();
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Panel className="p-5">
        <SectionHead title="Báo cáo theo kỳ" />
        <div className="space-y-2">
          {periods.map((p) => (
            <PeriodRow key={p.month} month={p.month} status={p.status} closing={p.closing_balance} due={p.due_date} fee={p.fee_amount} />
          ))}
        </div>
      </Panel>
      <div className="space-y-6">
        <Panel className="p-5">
          <SectionHead title="Thông tin nhận tiền" />
          {team.bank_account_no ? (
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-muted">Ngân hàng</dt><dd>{team.bank_name}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">Số tài khoản</dt><dd className="font-mono">{team.bank_account_no}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">Chủ tài khoản</dt><dd>{team.bank_account_name}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">Mức quỹ</dt><dd>{money(team.monthly_fee)}/tháng · hạn ngày {team.due_day}</dd></div>
            </dl>
          ) : <p className="text-sm text-muted">Chủ website chưa cấu hình thông tin nhận tiền.</p>}
          <Link href="/funds/pay" className="btn btn-primary btn-sm mt-3">Đóng quỹ</Link>
        </Panel>
        <Panel className="p-5">
          <SectionHead title="Dự kiến chi" />
          {expected.length === 0 ? <p className="text-sm text-muted">Không có.</p> : (
            <ul className="space-y-1.5 text-sm">
              {expected.map((e) => (
                <li key={e.id} className="flex justify-between gap-2"><span className="text-muted">{e.public_description}{e.planned_date ? ` · ${fmtDate(e.planned_date)}` : ""}</span><Money v={e.amount} /></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

async function PeriodRow({ month, status, closing, due, fee }: { month: string; status: string; closing: number | null; due: string; fee: number }) {
  const s = await getFundSummary(month);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/3 px-4 py-3">
      <div>
        <div className="font-display text-xl font-black uppercase">{monthLabel(month)}</div>
        <div className="text-xs text-muted">Mức {money(fee)} · hạn {fmtDate(due)}</div>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span>Thu <b className="text-teal">{money(s.month_in)}</b></span>
        <span>Chi <b className="text-danger">{money(s.month_out)}</b></span>
        {closing !== null ? <span>Số dư cuối <b>{money(closing)}</b></span> : null}
        <Chip className={status === "closed" ? "bg-white/10 text-muted" : "bg-neon/15 text-neon"}>{status === "closed" ? "Đã khóa sổ" : "Đang mở"}</Chip>
        <Link href={`/funds?tab=expenses&month=${month}`} className="text-teal hover:underline">Chi tiết</Link>
      </div>
    </div>
  );
}

async function LedgerTab({ flow, month, months, page, category, categories, href }: {
  flow: "expense" | "income"; month: string; months: string[]; page: number; category?: string; categories: string[];
  href: (p: Record<string, string | number | undefined>) => string;
}) {
  const res = await getLedger({ month, flow, category, page, pageSize: 15 });
  return (
    <Panel className="p-4 sm:p-6">
      <SectionHead title={flow === "expense" ? "Các khoản đã chi" : "Các khoản đã thu"} />
      <MonthNav month={month} months={months} base="/funds" extra={{ tab: flow === "expense" ? "expenses" : "income", cat: category }} />
      <div className="scrollbar-none -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1">
        <Link href={href({ cat: undefined, page: undefined })} scroll={false} className={`chip ${!category ? "bg-teal/20 text-teal" : "bg-white/8 text-muted"}`}>Tất cả</Link>
        {categories.map((c) => (
          <Link key={c} href={href({ cat: c, page: undefined })} scroll={false} className={`chip ${category === c ? "bg-teal/20 text-teal" : "bg-white/8 text-muted"}`}>{c}</Link>
        ))}
      </div>
      <div className="mt-2"><LedgerList rows={res.rows} emptyTitle={flow === "expense" ? "Chưa có khoản chi" : "Chưa có khoản thu"} /></div>
      <Pager page={page} total={res.total} size={15} href={(p) => href({ page: p })} />
    </Panel>
  );
}

async function DuesGrid({ months, members }: { months: string[]; members: Awaited<ReturnType<typeof getMembers>> }) {
  const dues = await getDues(months);
  const byKey = new Map(dues.map((d) => [`${d.member_id}:${d.obligation_month}`, d]));
  const relevant = members.filter((m) => m.status === "active" || dues.some((d) => d.member_id === m.id));
  return (
    <Panel className="p-4 sm:p-6">
      <SectionHead title="Tình trạng đóng quỹ" />
      <div className="mb-3 flex flex-wrap gap-1.5">
        {Object.entries(DUE_STATUS).map(([k, v]) => <Chip key={k} className={v.cls}>{v.label}</Chip>)}
        <Chip className="bg-danger/15 text-danger">! Quá hạn</Chip>
      </div>
      <div className="space-y-1.5">
        {relevant.map((m) => (
          <div key={m.id} className="grid grid-cols-[minmax(0,1fr)_repeat(4,auto)] items-center gap-1.5 rounded-lg bg-white/3 px-3 py-2 sm:gap-3">
            <span className="truncate text-sm"><b className="mr-1 font-display text-muted">{m.shirt_number ?? "–"}</b>{displayName(m)}</span>
            {months.map((mo) => {
              const d = byKey.get(`${m.id}:${mo}`);
              if (!d) return <span key={mo} className="w-[4.5rem] text-center text-xs text-dim sm:w-24">—</span>;
              const s = DUE_STATUS[d.status];
              return (
                <span key={mo} title={`${monthLabel(mo)}: ${s.label}`} className={`chip w-[4.5rem] justify-center sm:w-24 ${s.cls}`}>
                  {d.overdue ? "! " : ""}{mo.slice(5)}/{mo.slice(2, 4)}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </Panel>
  );
}

async function PenaltiesTab({ members, amount }: { members: Awaited<ReturnType<typeof getMembers>>; amount: number }) {
  const list = await getPenalties();
  const mm = new Map(members.map((m) => [m.id, m]));
  return (
    <Panel className="p-4 sm:p-6">
      <SectionHead title="Tiền phạt vắng mặt" sub={`Xác nhận tham gia nhưng điểm danh sau trận vắng mặt: phạt ${money(amount)}/trận.`}
        action={<Link href="/funds/penalty" className="btn btn-primary btn-sm">Nộp phạt</Link>} />
      {list.length === 0 ? <p className="text-sm text-muted">Chưa có khoản phạt nào.</p> : (
        <ul className="divide-y divide-white/5">
          {list.map((p) => {
            const m = mm.get(p.member_id);
            const st = PENALTY_STATUS[p.status] ?? PENALTY_STATUS.unpaid;
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span><b>{m ? displayName(m) : "—"}</b> <span className="text-muted">· vắng trận vs {p.opponent} ({fmtDate(p.starts_at)})</span></span>
                <span className="flex items-center gap-2">
                  {money(p.amount)} <Chip className={st.cls}>{st.label}</Chip>
                  {p.status === "unpaid" ? <Link href={`/funds/penalty?penalty=${p.id}`} className="btn btn-primary btn-sm">Nộp phạt</Link> : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}