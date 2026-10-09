import type { Metadata } from "next";
import { requireAdminPage, signedUrl } from "@/server/admin";
import { sp, type SP } from "@/server/view-helpers";
import { AdminForm, IntentButton } from "@/components/admin-form";
import {
  adjustDueAction, closePeriodAction, createPeriodAction, createRequestAction, decideRequestAction, generateDuesAction,
  openingAction, recordDirectAction, recordPaidAction, reverseLedgerAction, reviewDonationAction, reviewPaymentAction, waivePenaltyAction,
} from "@/server/actions/admin";
import { Chip, Empty, Notice, Panel, SectionHead, StatusChip, Tabs } from "@/components/ui";
import { DUE_STATUS, FEE_TYPE_LABEL, PENALTY_STATUS, REQUEST_STATUS, SUBMISSION_STATUS, displayName, type PubMember } from "@/lib/domain";
import { fmtDate, fmtDateTime, isMonth, money, monthLabel, shiftMonth, vnMonth, vnToday } from "@/lib/format";

export const metadata: Metadata = { title: "Quỹ" };

export default async function AdminFunds({ searchParams }: { searchParams: SP }) {
  const q = await sp(searchParams);
  const tab = ["entry", "receipts", "penalties", "periods", "requests", "ledger", "close"].includes(q.tab ?? "") ? q.tab! : "receipts";
  const { db } = await requireAdminPage();
  const { data: members } = await db.from("pub_members").select("*").order("shirt_number");
  const mm = new Map<string, PubMember>((members ?? []).map((m) => [m.id, m]));
  const name = (id: string | null) => (id && mm.get(id) ? `${displayName(mm.get(id)!)}${mm.get(id)!.shirt_number ? ` #${mm.get(id)!.shirt_number}` : ""}` : "—");

  return (
    <div>
      <h1 className="mb-4 font-display text-4xl font-black uppercase italic">Quản trị quỹ</h1>
      <Tabs active={tab} items={[
        { key: "receipts", label: "Biên lai & ủng hộ", href: "/admin/funds?tab=receipts" },
        { key: "entry", label: "Ghi thu / chi", href: "/admin/funds?tab=entry" },
        { key: "penalties", label: "Phạt", href: "/admin/funds?tab=penalties" },
        { key: "periods", label: "Kỳ & nghĩa vụ", href: "/admin/funds?tab=periods" },
        { key: "requests", label: "Đề nghị thu/chi", href: "/admin/funds?tab=requests" },
        { key: "ledger", label: "Sổ quỹ", href: "/admin/funds?tab=ledger" },
        { key: "close", label: "Khóa sổ", href: "/admin/funds?tab=close" },
      ]} />
      {tab === "receipts" ? <Receipts db={db} name={name} /> : null}
      {tab === "entry" ? <DirectEntry db={db} /> : null}
      {tab === "penalties" ? <Penalties db={db} name={name} /> : null}
      {tab === "periods" ? <Periods db={db} members={members ?? []} name={name} month={isMonth(q.month) ? q.month : undefined} /> : null}
      {tab === "requests" ? <Requests db={db} /> : null}
      {tab === "ledger" ? <Ledger db={db} month={isMonth(q.month) ? q.month : vnMonth()} /> : null}
      {tab === "close" ? <Close db={db} /> : null}
    </div>
  );
}

type Db = Awaited<ReturnType<typeof requireAdminPage>>["db"];

async function Receipts({ db, name }: { db: Db; name: (id: string | null) => string }) {
  const [{ data: pending }, { data: recent }] = await Promise.all([
    db.from("payment_submissions").select("*, monthly_dues(obligation_month, amount_due), penalties(matches(opponent, starts_at)), file_assets(bucket, object_path, mime)")
      .eq("status", "pending").order("created_at"),
    db.from("payment_submissions").select("id, reference, member_id, amount, status, reject_reason, reviewed_at, monthly_dues(obligation_month)")
      .neq("status", "pending").order("reviewed_at", { ascending: false, nullsFirst: false }).limit(15),
  ]);
  // one transfer can cover several months → review per group (same receipt, one ledger row per month)
  type Sub = NonNullable<typeof pending>[number];
  const groups = new Map<string, Sub[]>();
  (pending ?? []).forEach((p) => groups.set(p.group_ref, [...(groups.get(p.group_ref) ?? []), p]));
  const withUrls = await Promise.all([...groups.entries()].map(async ([ref, rows]) => {
    const fa = rows[0].file_assets;
    return { ref, rows, url: fa ? await signedUrl(db, fa.bucket, fa.object_path) : null };
  }));
  return (
    <div className="space-y-6">
      <Notice tone="info">Đối chiếu tiền thực nhận ngoài app trước khi duyệt. Duyệt lặp/2 tab cùng lúc không tạo hai khoản thu. Link ảnh có hiệu lực 5 phút.</Notice>
      {withUrls.length === 0 ? <Empty title="Không có biên lai chờ duyệt" /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {withUrls.map(({ ref, rows, url }) => {
            const p = rows[0];
            const total = rows.reduce((a, r) => a + Number(r.amount), 0);
            const months = rows.map((r) => r.monthly_dues?.obligation_month
              ?? `Phạt vắng vs ${r.penalties?.matches?.opponent ?? "?"} ${r.penalties?.matches ? fmtDate(r.penalties.matches.starts_at) : ""}`).sort();
            return (
              <Panel key={ref} className="p-4">
                <div className="flex gap-4">
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="block h-40 w-32 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Biên lai ${ref}`} className="h-full w-full object-cover" />
                    </a>
                  ) : <div className="grid h-40 w-32 shrink-0 place-items-center rounded-lg bg-black/40 text-xs text-muted">Không có file</div>}
                  <div className="min-w-0 flex-1 space-y-1 text-sm">
                    <div className="font-mono text-xs text-muted">{ref}</div>
                    <div className="font-display text-xl font-black uppercase">{name(p.member_id)}</div>
                    <div className="font-display text-2xl font-black text-neon">{money(total)}</div>
                    <div className="flex flex-wrap gap-1">
                      {months.map((m) => <Chip key={m} className="bg-white/8 text-fg">{m}</Chip>)}
                    </div>
                    <div className="text-muted">Chuyển khoản lúc {fmtDateTime(p.transferred_at)}</div>
                    {p.duplicate_flags?.length ? <Chip className="bg-danger/15 text-danger">Cảnh báo trùng ảnh biên lai</Chip> : null}
                    <div className="text-xs text-dim">Gửi lúc {fmtDateTime(p.created_at)} · người gửi tự khai (khách công khai)</div>
                  </div>
                </div>
                <AdminForm action={reviewPaymentAction} className="mt-3 space-y-2"
                  actions={<>
                    <IntentButton intent="approve" tone="primary" confirm={`Xác nhận đã nhận ${money(total)} từ ${name(p.member_id)} (${months.length} khoản)?`}>Duyệt & ghi thu</IntentButton>
                    <IntentButton intent="reject" tone="danger">Từ chối</IntentButton>
                    <IntentButton intent="withdraw">Rút hộ</IntentButton>
                  </>}>
                  {rows.map((r) => <input key={r.id} type="hidden" name="submission_id" value={r.id} />)}
                  <input name="reason" placeholder="Lý do (bắt buộc khi từ chối)" className="field" />
                </AdminForm>
              </Panel>
            );
          })}
        </div>
      )}
      <Donations db={db} />
      <Panel className="p-4">
        <SectionHead title="Đã xử lý gần đây" />
        <ul className="divide-y divide-white/5 text-sm">
          {(recent ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><span className="font-mono text-xs text-muted">{r.reference}</span> · {name(r.member_id)} · {(r.monthly_dues as { obligation_month?: string } | null)?.obligation_month}</span>
              <span className="flex items-center gap-2">{money(r.amount)} <StatusChip map={SUBMISSION_STATUS} value={r.status} /></span>
              {r.reject_reason ? <span className="w-full text-xs text-danger">Lý do: {r.reject_reason}</span> : null}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

async function Periods({ db, members, name, month }: { db: Db; members: PubMember[]; name: (id: string | null) => string; month?: string }) {
  const { data: periods } = await db.from("fund_periods").select("*").order("month", { ascending: false });
  const sel = month ?? periods?.[0]?.month;
  const [{ data: dues }, { data: settings }] = await Promise.all([
    sel ? db.from("monthly_dues").select("*").eq("obligation_month", sel) : Promise.resolve({ data: [] as never[] }),
    db.from("team_settings").select("monthly_fee, fee_student, fee_maintain, due_day").single(),
  ]);
  const { data: statuses } = sel ? await db.from("pub_dues").select("member_id, status, overdue").eq("obligation_month", sel) : { data: [] };
  const st = new Map((statuses ?? []).map((s) => [s.member_id, s]));
  const nextMonth = periods?.length ? shiftMonth(periods[0].month, 1) : vnMonth();
  const has = new Set((dues ?? []).map((d) => d.member_id));
  const period = periods?.find((p) => p.month === sel);
  const monthStart = sel ? `${sel}-01` : "";

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <div className="space-y-6">
        <Panel className="p-4">
          <SectionHead title="Mở kỳ quỹ" sub={`Chính thức ${money(settings?.monthly_fee)} · HSSV ${money(settings?.fee_student)} · duy trì ${money(settings?.fee_maintain)} · miễn 0 ₫ — snapshot vào nghĩa vụ theo loại thành viên.`} />
          <AdminForm action={createPeriodAction} submit="Tạo kỳ">
            <label className="block"><span className="label">Tháng</span><input name="month" type="month" defaultValue={nextMonth} required className="field" /></label>
            <label className="block"><span className="label">Hạn đóng</span><input name="due_date" type="date" defaultValue={`${nextMonth}-${String(settings?.due_day ?? 5).padStart(2, "0")}`} required className="field" /></label>
          </AdminForm>
        </Panel>
        <Panel className="p-4">
          <SectionHead title="Các kỳ" />
          <ul className="space-y-1">
            {(periods ?? []).map((p) => (
              <li key={p.month}>
                <a href={`/admin/funds?tab=periods&month=${p.month}`} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${p.month === sel ? "bg-neon/10 text-neon" : "hover:bg-white/5"}`}>
                  <span>{monthLabel(p.month)} · {money(p.fee_amount)}</span>
                  <Chip className={p.status === "closed" ? "bg-white/10 text-muted" : "bg-neon/15 text-neon"}>{p.status === "closed" ? "Đã khóa" : "Mở"}</Chip>
                </a>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      {sel && period ? (
        <div className="space-y-6">
          {period.status === "open" ? (
            <Panel className="p-4">
              <SectionHead title={`Sinh nghĩa vụ ${monthLabel(sel)}`} sub="Xem danh sách và ngoại lệ trước khi sinh. Sinh lại không tạo trùng." />
              <AdminForm action={generateDuesAction} submit="Sinh nghĩa vụ cho người đã chọn">
                <input type="hidden" name="month" value={sel} />
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {members.filter((m) => !has.has(m.id) && m.status !== "archived").map((m) => {
                    const midJoin = m.joined_on > monthStart;
                    const flag = m.status !== "active" ? "Không hoạt động" : midJoin ? "Vào giữa/sau kỳ" : null;
                    return (
                      <label key={m.id} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${flag ? "bg-warn/10" : "bg-white/4"}`}>
                        <input type="checkbox" name="member_ids" value={m.id} defaultChecked={!flag} className="h-4 w-4 accent-[#c8ff3c]" />
                        <span className="truncate">{name(m.id)}</span>
                        <span className="text-[0.7rem] text-dim">{FEE_TYPE_LABEL[m.fee_type]} · {money(m.fee_type === "standard" ? settings?.monthly_fee : m.fee_type === "student" ? settings?.fee_student : m.fee_type === "maintain" ? settings?.fee_maintain : 0)}</span>
                        {flag ? <span className="ml-auto text-[0.7rem] text-warn">{flag}</span> : null}
                      </label>
                    );
                  })}
                </div>
                {members.every((m) => has.has(m.id) || m.status === "archived") ? <p className="text-sm text-muted">Mọi thành viên đã có nghĩa vụ.</p> : null}
              </AdminForm>
            </Panel>
          ) : <Notice tone="info">Kỳ đã khóa sổ — không sinh/sửa nghĩa vụ. Thu nợ vẫn được ghi vào kỳ đang mở.</Notice>}
          <Panel className="p-4">
            <SectionHead title={`Nghĩa vụ ${monthLabel(sel)} (${dues?.length ?? 0})`} sub="Miễn/giảm cần lý do, có audit; không ghi thành khoản thu." />
            <ul className="space-y-2">
              {(dues ?? []).map((d) => {
                const s = st.get(d.member_id);
                return (
                  <li key={d.id} className="rounded-lg bg-white/4 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-semibold">{name(d.member_id)}</span>
                      <span className="flex items-center gap-2">
                        {money(d.amount_due)}{d.amount_due !== d.amount_snapshot ? <span className="text-xs text-dim line-through">{money(d.amount_snapshot)}</span> : null}
                        {s ? <StatusChip map={DUE_STATUS} value={s.status} /> : null}
                        {s?.overdue ? <Chip className="bg-danger/15 text-danger">Quá hạn</Chip> : null}
                      </span>
                    </div>
                    {d.adjustment_reason ? <div className="text-xs text-violet">Điều chỉnh: {d.adjustment_reason}</div> : null}
                    {s && ["unpaid"].includes(s.status) && period.status === "open" ? (
                      <details className="mt-1 text-sm">
                        <summary className="cursor-pointer text-xs text-teal">Miễn/giảm</summary>
                        <AdminForm action={adjustDueAction} className="mt-2 flex flex-wrap gap-2" submit="Lưu">
                          <input type="hidden" name="due_id" value={d.id} />
                          <input name="amount_due" type="number" min={0} max={d.amount_snapshot} step={1000} defaultValue={0} className="field w-36" />
                          <input name="reason" required placeholder="Lý do" className="field flex-1" />
                        </AdminForm>
                      </details>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>
      ) : <Empty title="Chưa có kỳ quỹ" />}
    </div>
  );
}

async function Requests({ db }: { db: Db }) {
  const [{ data: reqs }, { data: settings }, { data: matches }] = await Promise.all([
    db.from("fund_requests").select("*").order("created_at", { ascending: false }).limit(60),
    db.from("team_settings").select("expense_categories, income_categories").single(),
    db.from("matches").select("id, opponent, starts_at").order("starts_at", { ascending: false }).limit(20),
  ]);
  const cats = [...(settings?.expense_categories ?? []), ...(settings?.income_categories ?? [])];
  const open = (reqs ?? []).filter((r) => ["draft", "pending", "approved"].includes(r.status));
  const closed = (reqs ?? []).filter((r) => !open.includes(r));
  return (
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <Panel className="h-fit p-4">
        <SectionHead title="Tạo đề nghị" sub="Duyệt chi chỉ giữ cam kết; số dư giảm khi ghi nhận đã chi." />
        <AdminForm action={createRequestAction} submit="Tạo đề nghị" reset>
          <div className="grid grid-cols-2 gap-2">
            <label><span className="label">Loại</span><select name="kind" className="field"><option value="expense">Chi</option><option value="income">Thu khác</option></select></label>
            <label><span className="label">Danh mục</span>
              <select name="category" className="field">{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
          </div>
          <label className="block"><span className="label">Số tiền (₫)</span><input name="amount" type="number" min={1000} step={1000} required className="field" /></label>
          <label className="block"><span className="label">Nội dung công khai (bắt buộc)</span><input name="public_description" required minLength={3} maxLength={200} className="field" /></label>
          <label className="block"><span className="label">Ghi chú nội bộ</span><input name="private_note" className="field" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label><span className="label">Người nhận/nộp</span><input name="counterparty" className="field" /></label>
            <label><span className="label">Ngày dự kiến</span><input name="planned_date" type="date" className="field" /></label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label><span className="label">Phương thức</span><select name="method" className="field"><option value="bank">Chuyển khoản</option><option value="cash">Tiền mặt</option><option value="ewallet">Ví</option></select></label>
            <label><span className="label">Trận liên quan</span><select name="match_id" className="field"><option value="">—</option>{(matches ?? []).map((m) => <option key={m.id} value={m.id}>{fmtDate(m.starts_at)} vs {m.opponent}</option>)}</select></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="already_spent" className="accent-[#c8ff3c]" /> Chi đã phát sinh, chờ xác nhận</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="draft" className="accent-[#c8ff3c]" /> Lưu nháp</label>
        </AdminForm>
      </Panel>
      <div className="space-y-6">
        <Panel className="p-4">
          <SectionHead title="Đang xử lý" />
          {open.length === 0 ? <Empty title="Không có đề nghị mở" /> : (
            <ul className="space-y-3">
              {open.map((r) => (
                <li key={r.id} className="rounded-xl border border-white/8 bg-white/3 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <Chip className={r.kind === "expense" ? "bg-danger/15 text-danger" : "bg-neon/15 text-neon"}>{r.kind === "expense" ? "Chi" : "Thu"}</Chip>{" "}
                      <b>{r.public_description}</b> <span className="text-xs text-muted">· {r.category}</span>
                    </div>
                    <span className="flex items-center gap-2 font-display text-lg font-black">{money(r.amount)} <StatusChip map={REQUEST_STATUS} value={r.status} /></span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    {r.planned_date ? `Dự kiến ${fmtDate(r.planned_date)} · ` : ""}{r.counterparty ? `${r.counterparty} · ` : ""}{r.private_note ? `Nội bộ: ${r.private_note} · ` : ""}
                    {r.already_spent ? "Chi đã phát sinh · " : ""}{r.reward_result_id ? "Chi thưởng · " : ""}tạo {fmtDateTime(r.created_at)}
                  </div>
                  {r.status === "approved" ? (
                    <AdminForm action={recordPaidAction} className="mt-3 grid gap-2 sm:grid-cols-2" submit="Ghi nhận đã chi"
                      confirm={`Ghi nhận đã chi ${money(r.amount)}? Số dư sẽ giảm ngay.`}>
                      <input type="hidden" name="id" value={r.id} />
                      <label><span className="label">Ngày thực chi</span><input name="occurred_at" type="date" max={vnToday()} defaultValue={vnToday()} required className="field" /></label>
                      <label><span className="label">Số tiền (phải khớp)</span><input name="amount" type="number" defaultValue={r.amount} required className="field" /></label>
                      <label><span className="label">Chứng từ (ảnh/PDF)</span><input name="doc" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="field" /></label>
                      <label><span className="label">Hoặc giải trình ngoại lệ</span><input name="exception_note" className="field" /></label>
                    </AdminForm>
                  ) : null}
                  <AdminForm action={decideRequestAction} className="mt-2 flex flex-wrap items-center gap-2"
                    actions={<>
                      {r.status === "draft" ? <IntentButton intent="submit">Gửi duyệt</IntentButton> : null}
                      {r.status === "pending" ? <IntentButton intent="approve" tone="primary">{r.kind === "expense" ? "Duyệt chi" : "Duyệt & ghi thu"}</IntentButton> : null}
                      {r.status === "pending" ? <IntentButton intent="reject" tone="danger">Từ chối</IntentButton> : null}
                      <IntentButton intent="cancel" confirm="Hủy/rút đề nghị này?">Hủy/rút</IntentButton>
                    </>}>
                    <input type="hidden" name="id" value={r.id} />
                    {r.kind === "income" && r.status === "pending" ? <input name="occurred_at" type="date" defaultValue={vnToday()} className="field w-40" title="Ngày tiền thực nhận" /> : null}
                    <input name="reason" placeholder="Lý do (từ chối/hủy)" className="field min-w-40 flex-1" />
                  </AdminForm>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel className="p-4">
          <SectionHead title="Đã kết thúc" />
          <ul className="divide-y divide-white/5 text-sm">
            {closed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{r.kind === "expense" ? "−" : "+"} {r.public_description}{r.decision_reason ? <span className="text-xs text-muted"> · {r.decision_reason}</span> : null}</span>
                <span className="flex items-center gap-2">{money(r.amount)} <StatusChip map={REQUEST_STATUS} value={r.status} /></span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

async function Ledger({ db, month }: { db: Db; month: string }) {
  const [{ data: rows }, { data: hasOpening }] = await Promise.all([
    db.from("fund_ledger").select("*").eq("posting_month", month).order("created_at", { ascending: false }),
    db.from("fund_ledger").select("id").eq("is_opening", true).maybeSingle(),
  ]);
  const reversed = new Set((rows ?? []).filter((r) => r.reversal_of).map((r) => r.reversal_of));
  const { data: allReversals } = await db.from("fund_ledger").select("reversal_of").not("reversal_of", "is", null);
  (allReversals ?? []).forEach((r) => reversed.add(r.reversal_of));
  return (
    <div className="space-y-6">
      {!hasOpening ? (
        <Panel className="p-4">
          <SectionHead title="Số dư khởi tạo" sub="Một bản ghi opening tại ngày bắt đầu — chỉ nhập một lần, không phải khoản thu trong kỳ." />
          <AdminForm action={openingAction} className="flex flex-wrap items-end gap-2" submit="Ghi số dư đầu" confirm="Số dư khởi tạo chỉ nhập một lần. Tiếp tục?">
            <label><span className="label">Số tiền</span><input name="amount" type="number" min={0} step={1000} required className="field" /></label>
            <label><span className="label">Ngày bắt đầu</span><input name="date" type="date" required className="field" /></label>
          </AdminForm>
        </Panel>
      ) : null}
      <Panel className="p-4">
        <SectionHead title={`Sổ quỹ ${monthLabel(month)}`} sub="Bất biến: sai sót dùng dòng điều chỉnh đối ứng (mỗi dòng tối đa một lần)."
          action={<div className="flex gap-2"><a className="btn btn-ghost btn-sm" href={`/admin/funds?tab=ledger&month=${shiftMonth(month, -1)}`}>‹</a><a className="btn btn-ghost btn-sm" href={`/admin/funds?tab=ledger&month=${shiftMonth(month, 1)}`}>›</a></div>} />
        <ul className="divide-y divide-white/5 text-sm">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span><b className={r.direction === "in" ? "text-neon" : "text-danger"}>{r.direction === "in" ? "+" : "−"}{money(r.amount)}</b> · {r.public_description}</span>
                <span className="text-xs text-muted">phát sinh {fmtDate(r.occurred_at)} · ghi sổ {fmtDate(r.posting_date)} · {r.source_type}</span>
              </div>
              {r.period_note ? <div className="text-xs text-dim">{r.period_note}</div> : null}
              {!r.is_opening && r.source_type !== "reversal" && !reversed.has(r.id) ? (
                <details className="mt-1">
                  <summary className="cursor-pointer text-xs text-warn">Đảo/điều chỉnh</summary>
                  <AdminForm action={reverseLedgerAction} className="mt-2 flex flex-wrap gap-2" submit="Tạo dòng đối ứng" confirm="Tạo dòng điều chỉnh ngược chiều cho dòng này?">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="reason" required placeholder="Lý do (bắt buộc)" className="field flex-1" />
                  </AdminForm>
                </details>
              ) : reversed.has(r.id) ? <Chip className="mt-1 bg-warn/15 text-warn">Đã điều chỉnh</Chip> : null}
            </li>
          ))}
          {(rows ?? []).length === 0 ? <li className="py-4 text-muted">Không có dòng sổ.</li> : null}
        </ul>
      </Panel>
    </div>
  );
}

async function Close({ db }: { db: Db }) {
  const { data: periods } = await db.from("fund_periods").select("*").order("month");
  const open = (periods ?? []).filter((p) => p.status === "open" && p.month < vnMonth());
  const summaries = await Promise.all(open.map(async (p) => {
    const [{ data: before }, { data: within }] = await Promise.all([
      db.from("fund_ledger").select("direction, amount").lt("posting_month", p.month),
      db.from("fund_ledger").select("direction, amount").eq("posting_month", p.month),
    ]);
    const sum = (rows: { direction: string; amount: number }[] | null, dir?: string) =>
      (rows ?? []).reduce((a, r) => a + (dir ? (r.direction === dir ? Number(r.amount) : 0) : r.direction === "in" ? Number(r.amount) : -Number(r.amount)), 0);
    const opening = sum(before);
    const inn = sum(within, "in"), out = sum(within, "out");
    return { p, opening, inn, out, closing: opening + inn - out };
  }));
  return (
    <div className="space-y-4">
      <Notice tone="warn">Khóa theo thứ tự tháng. Kỳ đã khóa không nhận sửa/xóa/ghi lùi; khoản phát sinh muộn ghi vào kỳ đang mở và lưu ngày thực tế.</Notice>
      {summaries.length === 0 ? <Empty title="Không có kỳ đã kết thúc cần khóa" /> : summaries.map(({ p, opening, inn, out, closing }) => (
        <Panel key={p.month} className="p-4">
          <SectionHead title={monthLabel(p.month)} />
          <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>Số dư đầu <b className="block text-lg">{money(opening)}</b></div>
            <div>Thu <b className="block text-lg text-neon">{money(inn)}</b></div>
            <div>Chi <b className="block text-lg text-danger">{money(out)}</b></div>
            <div>Số dư cuối <b className="block text-lg">{money(closing)}</b></div>
          </div>
          <AdminForm action={closePeriodAction} className="flex flex-wrap items-end gap-2" submit="Duyệt & khóa sổ" confirm={`Khóa sổ ${monthLabel(p.month)}? Không thể mở lại.`}>
            <input type="hidden" name="month" value={p.month} />
            <label><span className="label">Tiền thực tế đối soát</span><input name="reconciled" type="number" defaultValue={closing} required className="field" /></label>
            <label className="flex-1"><span className="label">Giải thích chênh lệch (nếu có)</span><input name="note" className="field" /></label>
          </AdminForm>
        </Panel>
      ))}
    </div>
  );
}

async function Donations({ db }: { db: Db }) {
  const { data } = await db.from("donations").select("*, file_assets(bucket, object_path)").eq("status", "pending").order("created_at");
  if (!data?.length) return null;
  const rows = await Promise.all(data.map(async (d) => ({ ...d, url: d.file_assets ? await signedUrl(db, d.file_assets.bucket, d.file_assets.object_path) : null })));
  return (
    <Panel className="p-4">
      <SectionHead title="Ủng hộ chờ xác nhận" sub="Xác nhận khi tiền đã về tài khoản — khoản ủng hộ vào sổ quỹ và bảng vàng." />
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((d) => (
          <div key={d.id} className="flex gap-3 rounded-xl border border-gold/25 bg-gold/5 p-3 text-sm">
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" className="block h-28 w-24 shrink-0 overflow-hidden rounded-lg bg-black/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.url} alt={`Biên lai ${d.reference}`} className="h-full w-full object-cover" />
              </a>
            ) : null}
            <div className="min-w-0 flex-1 space-y-1">
              <div className="font-mono text-xs text-muted">{d.reference}</div>
              <div className="font-semibold">{d.anonymous ? "Ẩn danh" : d.donor_name}</div>
              <div className="font-display text-xl font-black text-gold">{money(d.amount)}</div>
              {d.message ? <div className="text-muted">“{d.message}”</div> : null}
              <div className="text-xs text-dim">Chuyển lúc {fmtDateTime(d.transferred_at)}</div>
              <AdminForm action={reviewDonationAction} className="flex flex-wrap gap-2" actions={<>
                <IntentButton intent="approve" tone="primary" confirm={`Đã nhận ${money(d.amount)}?`}>Xác nhận</IntentButton>
                <IntentButton intent="reject" tone="danger">Từ chối</IntentButton>
              </>}>
                <input type="hidden" name="id" value={d.id} />
                <input name="reason" placeholder="Lý do (khi từ chối)" className="field min-h-9 py-1 text-sm" />
              </AdminForm>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

async function DirectEntry({ db }: { db: Db }) {
  const [{ data: settings }, { data: matches }, { data: recent }] = await Promise.all([
    db.from("team_settings").select("expense_categories, income_categories").single(),
    db.from("matches").select("id, opponent, starts_at").order("starts_at", { ascending: false }).limit(20),
    db.from("fund_ledger").select("*").eq("source_type", "fund_request").order("created_at", { ascending: false }).limit(10),
  ]);
  const form = (kind: "income" | "expense") => (
    <AdminForm action={recordDirectAction} submit={kind === "income" ? "Ghi khoản thu" : "Ghi khoản chi"} reset
      confirm={kind === "expense" ? "Ghi khoản chi này vào sổ quỹ? Số dư sẽ giảm ngay." : undefined}>
      <input type="hidden" name="kind" value={kind} />
      <div className="grid grid-cols-2 gap-2">
        <label><span className="label">Danh mục</span>
          <select name="category" className="field">
            {(kind === "income" ? settings?.income_categories : settings?.expense_categories)?.map((c: string) => <option key={c}>{c}</option>)}
          </select></label>
        <label><span className="label">Số tiền (₫)</span><input name="amount" type="number" min={1000} step={1000} required className="field" /></label>
      </div>
      <label className="block"><span className="label">Nội dung công khai *</span><input name="public_description" required minLength={3} maxLength={200} className="field" /></label>
      <div className="grid grid-cols-2 gap-2">
        <label><span className="label">Ngày phát sinh</span><input name="occurred_at" type="date" max={vnToday()} defaultValue={vnToday()} className="field" /></label>
        <label><span className="label">{kind === "income" ? "Người nộp" : "Người nhận"}</span><input name="counterparty" className="field" /></label>
      </div>
      <label className="block"><span className="label">Trận liên quan</span>
        <select name="match_id" className="field"><option value="">—</option>{(matches ?? []).map((m) => <option key={m.id} value={m.id}>{fmtDate(m.starts_at)} vs {m.opponent}</option>)}</select></label>
      {kind === "expense" ? (
        <label className="block"><span className="label">Chứng từ (ảnh/PDF) — hoặc ghi chú bên dưới</span><input name="doc" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="field" /></label>
      ) : null}
      <label className="block"><span className="label">Ghi chú nội bộ{kind === "expense" ? " (bắt buộc nếu không có chứng từ)" : ""}</span><input name="private_note" className="field" /></label>
    </AdminForm>
  );
  return (
    <div className="space-y-6">
      <Notice tone="info">Dùng cho khoản đã thực thu/thực chi — ghi thẳng vào sổ quỹ trong một bước. Khoản chi cần duyệt trước khi trả hãy dùng tab “Đề nghị thu/chi”.</Notice>
      <div className="grid gap-6 xl:grid-cols-2">
        <Panel className="p-4"><SectionHead title="+ Khoản thu" />{form("income")}</Panel>
        <Panel className="p-4"><SectionHead title="− Khoản chi" />{form("expense")}</Panel>
      </div>
      <Panel className="p-4">
        <SectionHead title="Ghi gần đây" />
        <ul className="divide-y divide-white/5 text-sm">
          {(recent ?? []).map((r) => (
            <li key={r.id} className="flex justify-between gap-2 py-2">
              <span>{r.public_description} <span className="text-xs text-muted">· {r.category} · {fmtDate(r.occurred_at)}</span></span>
              <b className={r.direction === "in" ? "text-neon" : "text-danger"}>{r.direction === "in" ? "+" : "−"}{money(r.amount)}</b>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

async function Penalties({ db, name }: { db: Db; name: (id: string | null) => string }) {
  const { data } = await db.from("pub_penalties").select("*").order("starts_at", { ascending: false });
  return (
    <Panel className="p-4">
      <SectionHead title="Tiền phạt vắng mặt" sub="Tự tạo khi lưu điểm danh: xác nhận Tham gia nhưng ghi Vắng mặt. Đổi điểm danh thì khoản chưa đóng tự hủy. Thành viên đóng qua form Đóng quỹ." />
      {(data ?? []).length === 0 ? <Empty title="Chưa có khoản phạt" /> : (
        <ul className="space-y-2">
          {(data ?? []).map((p) => {
            const st = PENALTY_STATUS[p.status] ?? PENALTY_STATUS.unpaid;
            return (
              <li key={p.id} className="rounded-lg bg-white/4 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{name(p.member_id)}</b> · vắng trận vs {p.opponent} ({fmtDate(p.starts_at)})</span>
                  <span className="flex items-center gap-2">{money(p.amount)} <Chip className={st.cls}>{st.label}</Chip></span>
                </div>
                {p.status === "unpaid" ? (
                  <AdminForm action={waivePenaltyAction} className="mt-2 flex flex-wrap gap-2" submit="Miễn phạt">
                    <input type="hidden" name="id" value={p.id} />
                    <input name="reason" required placeholder="Lý do miễn (VD: báo nghỉ có lý do)" className="field min-h-9 flex-1 py-1 text-sm" />
                  </AdminForm>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}