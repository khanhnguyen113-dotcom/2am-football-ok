"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChoiceGroup, Result, Submit, useIdempotentAction, type MemberOption } from "@/components/forms";
import { donateAction, profileAction, rsvpAction, submitPaymentAction } from "@/server/actions/public";
import { fmtDate, money, monthLabel, shiftMonth } from "@/lib/format";
import { POSITIONS } from "@/lib/domain";

/** Downscale a photo in the browser before upload (keeps uploads small; server re-checks the real type). */
async function shrinkImage(file: File, max = 720): Promise<File> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.86));
  return blob ? new File([blob], "avatar.jpg", { type: "image/jpeg" }) : file;
}

// ───────── Member profile (anyone, any member): name, nickname, positions, photo ─────────
export function ProfileButton({ memberId, fullName, nickname, version, positions, primary, avatarUrl }: {
  memberId: string; fullName: string; nickname: string | null; version: number; positions: string[]; primary: string | null; avatarUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useIdempotentAction(profileAction);
  const [preview, setPreview] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(positions);
  const dlg = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) dlg.current?.showModal();
    else dlg.current?.close();
  }, [open]);
  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(() => setOpen(false), 700);
      return () => clearTimeout(t);
    }
  }, [state]);
  const shown = preview ?? avatarUrl;

  return (
    <>
      <button type="button" onClick={() => { setSelected(positions); setPreview(null); setOpen(true); }} className="btn btn-ghost btn-sm w-full">✎ Sửa hồ sơ</button>
      <dialog ref={dlg} onClose={() => setOpen(false)} className="m-auto w-[min(94vw,480px)] rounded-2xl bg-transparent p-0 text-fg backdrop:bg-black/70 backdrop:backdrop-blur-sm">
        <form key={`${version}-${open}`} action={action} className="panel max-h-[90dvh] space-y-4 overflow-y-auto p-5">
          <h3 className="section-title">Hồ sơ cầu thủ</h3>
          <input type="hidden" name="member_id" value={memberId} />
          <input type="hidden" name="version" value={version} />

          <div className="flex items-center gap-4">
            <div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {shown ? <img src={shown} alt="Ảnh thẻ" className="h-full w-full object-cover object-top" /> : <div className="grid h-full place-items-center text-xs text-dim">Chưa có ảnh</div>}
            </div>
            <label className="block flex-1">
              <span className="label">Ảnh đại diện (JPG/PNG/WebP)</span>
              <input
                name="avatar" type="file" accept="image/jpeg,image/png,image/webp" className="field text-sm"
                onChange={async (e) => {
                  const input = e.currentTarget;
                  const f = input.files?.[0];
                  if (!f) return setPreview(null);
                  const small = await shrinkImage(f).catch(() => f);
                  const dt = new DataTransfer();
                  dt.items.add(small);
                  input.files = dt.files;
                  setPreview(URL.createObjectURL(small));
                }}
              />
              <span className="mt-1 block text-xs text-dim">Ảnh chân dung, nên chụp nửa người — sẽ hiện trên thẻ cầu thủ.</span>
            </label>
          </div>

          <label className="block">
            <span className="label">Họ tên</span>
            <input name="full_name" defaultValue={fullName} required minLength={2} maxLength={80} className="field" />
          </label>
          <label className="block">
            <span className="label">Tên thường gọi (tùy chọn)</span>
            <input name="nickname" defaultValue={nickname ?? ""} maxLength={80} className="field" />
          </label>
          <fieldset>
            <legend className="label">Tuyến sở trường (chọn 1–4) · ★ tuyến chính</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {POSITIONS.map((p) => {
                const on = selected.includes(p.code);
                return (
                  <div key={p.code} className={`flex items-center justify-between gap-1 rounded-lg border px-2 py-1.5 text-sm ${on ? "border-neon/40 bg-neon/10" : "border-white/8 bg-white/3"}`}>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" name="positions" value={p.code} checked={on} className="accent-[#c8ff3c]"
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.code] : s.filter((x) => x !== p.code)))} />
                      <b>{p.name}</b>
                    </label>
                    <label title="Vị trí chính" className={`text-sm ${on ? "" : "invisible"}`}>
                      <input type="radio" name="primary" value={p.code} defaultChecked={primary === p.code} className="accent-[#f3d27a]" />★
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
          <Result state={state} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">Đóng</button>
            <Submit pending={pending}>Lưu hồ sơ</Submit>
          </div>
        </form>
      </dialog>
    </>
  );
}

// ───────── RSVP (match + gathering, independent) with chosen position ─────────
export type RsvpMember = MemberOption & { primary: string | null };

export function RsvpForm({ matchId, options, closed }: { matchId: string; options: RsvpMember[]; closed: boolean }) {
  const [state, action, pending] = useIdempotentAction(rsvpAction);
  const [memberId, setMemberId] = useState("");
  const [position, setPosition] = useState("");
  const [response, setResponse] = useState("");
  if (closed) {
    return <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">Đã qua hạn xác nhận. Vui lòng liên hệ quản lý đội để được cập nhật hộ.</p>;
  }
  return (
    <form action={action} className="space-y-4" onChange={(e) => {
      const t = e.target as unknown as HTMLInputElement;
      if (t.name === "response") setResponse(t.value);
    }}>
      <input type="hidden" name="match_id" value={matchId} />
      <label className="block">
        <span className="label">Chọn tên của bạn</span>
        <select name="member_id" required value={memberId} className="field" onChange={(e) => {
          setMemberId(e.target.value);
          setPosition(options.find((o) => o.id === e.target.value)?.primary ?? "");
        }}>
          <option value="" disabled>— Chọn thành viên —</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}{o.sub ? ` · ${o.sub}` : ""}</option>)}
        </select>
      </label>
      <ChoiceGroup name="response" label="Đi đá?" options={[
        { value: "yes", label: "Có", tone: "yes" }, { value: "no", label: "Không", tone: "no" },
      ]} />
      {response === "yes" ? (
        <label className="block">
          <span className="label">Tuyến muốn đá trận này (thủ môn / hậu vệ / tiền vệ / tiền đạo)</span>
          <select name="position_code" required value={position} onChange={(e) => setPosition(e.target.value)} className="field">
            <option value="" disabled>— Chọn tuyến —</option>
            {POSITIONS.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
      ) : null}
      <ChoiceGroup name="gathering_response" label="Liên hoan sau trận?" options={[
        { value: "yes", label: "Có", tone: "yes" }, { value: "no", label: "Không", tone: "no" },
      ]} />
      <label className="block">
        <span className="label">Ghi chú cho quản lý (riêng tư, tùy chọn)</span>
        <input name="note" maxLength={300} className="field" placeholder="VD: đến muộn 15 phút" />
      </label>
      <Result state={state} />
      <Submit pending={pending}>Gửi xác nhận</Submit>
    </form>
  );
}

// ───────── Fund payment: pick one or several months, 100% bank transfer ─────────
export type DueLite = { member_id: string; obligation_month: string; amount_due: number; status: string };
type MonthOption = { month: string; amount: number; state: "open" | "pending" | "paid" | "exempt"; isNew: boolean };

export type PenaltyLite = { id: string; member_id: string; amount: number; opponent: string; starts_at: string; status: string };

export function PayForm({ options, dues, penalties, currentMonth, defaultMonth, noteTemplate }: {
  options: (MemberOption & { name: string; active: boolean; fee: number })[]; dues: DueLite[]; penalties: PenaltyLite[];
  currentMonth: string; defaultMonth: string; noteTemplate: string;
}) {
  const [state, action, pending] = useIdempotentAction(submitPaymentAction);
  const [memberId, setMemberId] = useState("");
  const [months, setMonths] = useState<string[]>([]);
  const [pens, setPens] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [fileErr, setFileErr] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const member = options.find((o) => o.id === memberId);
  const choices = useMemo<MonthOption[]>(() => {
    if (!memberId) return [];
    const mine = new Map(dues.filter((d) => d.member_id === memberId).map((d) => [d.obligation_month, d]));
    const list: MonthOption[] = [];
    for (const d of mine.values()) {
      const st = d.status === "unpaid" ? "open" : (d.status as MonthOption["state"]);
      list.push({ month: d.obligation_month, amount: Number(d.amount_due), state: st, isNew: false });
    }
    if (member?.active) {
      for (let i = 0; i <= 6; i++) {
        const m = shiftMonth(currentMonth, i);
        if (!mine.has(m)) list.push({ month: m, amount: member.fee, state: member.fee > 0 ? "open" : "exempt", isNew: true });
      }
    }
    return list.sort((a, b) => a.month.localeCompare(b.month));
  }, [memberId, dues, member, currentMonth]);
  const myPenalties = penalties.filter((p) => p.member_id === memberId);
  const total = choices.filter((c) => months.includes(c.month)).reduce((a, c) => a + c.amount, 0)
    + myPenalties.filter((p) => pens.includes(p.id)).reduce((a, p) => a + Number(p.amount), 0);
  const note = noteTemplate.replace("{ten}", member?.name ?? "Ten Cua Ban").replace("{thang}", months.length ? [...months].sort().join(",") : currentMonth);

  if (state?.ok && state.data) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-neon/30 bg-neon/10 p-4">
          <div className="font-display text-2xl font-black uppercase text-neon">Đã gửi biên lai</div>
          <p className="mt-1 text-sm">
            Mã tham chiếu <b className="font-mono">{state.data.reference}</b>
            {state.data.months?.length ? <> · {state.data.months.map(monthLabel).join(", ")}</> : null}
            {state.data.total ? <> · <b>{money(state.data.total)}</b></> : null}.
          </p>
          <p className="mt-1 text-sm">Trạng thái <b>Chờ duyệt</b> — quỹ chỉ tăng sau khi chủ website đối chiếu tiền thực nhận. Xem tình trạng ở mục Quỹ đội → Đóng quỹ.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => location.reload()}>Gửi biên lai khác</button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="label">Người đóng</span>
        <select name="member_id" required value={memberId} className="field" onChange={(e) => {
          setMemberId(e.target.value);
          const opt = options.find((o) => o.id === e.target.value);
          const target = dues.find((d) => d.member_id === e.target.value && d.obligation_month === defaultMonth);
          setMonths((target ? target.status === "unpaid" : (opt?.fee ?? 0) > 0) ? [defaultMonth] : []);
          setPens(penalties.filter((p) => p.member_id === e.target.value && p.status === "unpaid").map((p) => p.id));
        }}>
          <option value="" disabled>— Chọn thành viên —</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}{o.sub ? ` · ${o.sub}` : ""}</option>)}
        </select>
      </label>

      {memberId ? (
        <fieldset>
          <legend className="label">Chọn tháng đóng (có thể chọn nhiều tháng — nợ cũ hoặc đóng trước)</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {choices.map((c) => {
              const disabled = c.state !== "open";
              const checked = months.includes(c.month);
              const tag = { open: c.month < currentMonth ? "Còn nợ" : c.isNew && c.month > currentMonth ? "Đóng trước" : "Chưa đóng", pending: "Chờ duyệt", paid: "Đã đóng", exempt: "Được miễn" }[c.state];
              return (
                <label key={c.month} className={`relative flex cursor-pointer flex-col rounded-xl border px-3 py-2 transition ${disabled ? "cursor-not-allowed border-white/5 opacity-45" : checked ? "border-neon bg-neon/12" : "border-white/12 bg-white/4 hover:border-white/25"}`}>
                  <input type="checkbox" name="months" value={c.month} disabled={disabled} checked={checked} className="sr-only"
                    onChange={(e) => setMonths((s) => (e.target.checked ? [...s, c.month] : s.filter((x) => x !== c.month)))} />
                  <span className="font-display text-lg font-black uppercase">{monthLabel(c.month)}</span>
                  <span className="text-xs text-muted">{money(c.amount)} · <span className={c.state === "open" && c.month < currentMonth ? "text-warn" : ""}>{tag}</span></span>
                  {checked ? <span className="absolute right-2 top-2 text-neon">✓</span> : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {myPenalties.length > 0 ? (
        <fieldset>
          <legend className="label">Tiền phạt vắng mặt (xác nhận đi nhưng không có mặt)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {myPenalties.map((p) => {
              const open = p.status === "unpaid";
              const checked = pens.includes(p.id);
              return (
                <label key={p.id} className={`relative flex cursor-pointer flex-col rounded-xl border px-3 py-2 ${!open ? "cursor-not-allowed border-white/5 opacity-45" : checked ? "border-danger bg-danger/12" : "border-white/12 bg-white/4"}`}>
                  <input type="checkbox" name="penalties" value={p.id} disabled={!open} checked={checked} className="sr-only"
                    onChange={(e) => setPens((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
                  <span className="font-semibold">vs {p.opponent} · {fmtDate(p.starts_at)}</span>
                  <span className="text-xs text-muted">{money(p.amount)} · {open ? "Chưa đóng" : p.status === "pending" ? "Chờ duyệt" : "Đã xử lý"}</span>
                  {checked ? <span className="absolute right-2 top-2 text-danger">✓</span> : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <div className="flex items-end justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
        <div>
          <div className="label mb-0">Số tiền cần chuyển</div>
          <div className="font-display text-3xl font-black text-neon">{money(total)}</div>
          <div className="text-xs text-dim">{months.length} tháng quỹ{pens.length ? ` + ${pens.length} khoản phạt` : ""}</div>
        </div>
        <input type="hidden" name="amount" value={total} />
      </div>

      <div className="rounded-xl border border-white/10 p-3 text-sm">
        <div className="label">Nội dung chuyển khoản</div>
        <div className="flex items-center justify-between gap-2">
          <span className="break-all font-mono">{note}</span>
          <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => navigator.clipboard.writeText(note)}>Sao chép</button>
        </div>
      </div>

      <label className="block">
        <span className="label">Thời điểm chuyển khoản</span>
        <input name="transferred_at" type="datetime-local" required className="field" defaultValue={nowLocal()} suppressHydrationWarning />
      </label>
      <label className="block">
        <span className="label">Ảnh biên lai chuyển khoản (bắt buộc · JPG/PNG/WebP ≤ 10 MB)</span>
        <input
          name="receipt" type="file" accept="image/jpeg,image/png,image/webp" required
          className="field file:mr-3 file:rounded-md file:border-0 file:bg-neon file:px-3 file:py-1.5 file:font-semibold file:text-black"
          onChange={(e) => {
            const f = e.target.files?.[0];
            setFileErr(null);
            if (preview) URL.revokeObjectURL(preview);
            setPreview(null);
            if (!f) return;
            if (f.size > 10 * 1024 * 1024) { setFileErr("File quá lớn (tối đa 10 MB)."); e.target.value = ""; return; }
            setPreview(URL.createObjectURL(f));
          }}
        />
        {fileErr ? <span className="mt-1 block text-sm text-danger">{fileErr}</span> : null}
      </label>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Xem trước biên lai" className="max-h-64 rounded-lg border border-white/10 object-contain" />
      ) : null}
      <Result state={state} />
      <Submit pending={pending}>Gửi biên lai {total > 0 ? money(total) : ""}</Submit>
    </form>
  );
}

// ───────── Penalty debts: click "Nộp phạt" → the amount to transfer appears in the payment panel ─────────
export function PenaltyPay({ names, penalties, initialId, noteTemplate, bank }: {
  names: Record<string, string>; penalties: PenaltyLite[]; initialId?: string; noteTemplate: string; bank: ReactNode;
}) {
  const [state, action, pending] = useIdempotentAction(submitPaymentAction);
  const debts = penalties.filter((p) => (p.status === "unpaid" || p.status === "pending") && names[p.member_id]);
  const init = debts.find((p) => p.id === initialId && p.status === "unpaid");
  const [memberId, setMemberId] = useState(init?.member_id ?? "");
  const [picked, setPicked] = useState<string[]>(init ? [init.id] : []);
  const [fileErr, setFileErr] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const by = new Map<string, PenaltyLite[]>();
  for (const p of debts) by.set(p.member_id, [...(by.get(p.member_id) ?? []), p]);
  const groups = [...by.entries()].map(([id, list]) => ({ id, list, open: list.filter((p) => p.status === "unpaid") }))
    .sort((a, b) => names[a.id].localeCompare(names[b.id], "vi"));
  const chosen = debts.filter((p) => picked.includes(p.id) && p.member_id === memberId);
  const total = chosen.reduce((a, p) => a + Number(p.amount), 0);
  const note = noteTemplate.replace("{ten}", names[memberId] ?? "Ten Cua Ban").replace("{thang}", "PHAT");
  const reveal = () => setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  const pick = (member: string, ids: string[]) => { setMemberId(member); setPicked(ids); reveal(); };
  const toggle = (p: PenaltyLite, on: boolean) => {
    if (p.member_id !== memberId) return pick(p.member_id, [p.id]);
    setPicked((s) => (on ? [...s, p.id] : s.filter((x) => x !== p.id)));
  };

  if (state?.ok && state.data) {
    return (
      <div className="space-y-4 rounded-xl border border-neon/30 bg-neon/10 p-5">
        <div className="font-display text-2xl font-black uppercase text-neon">Đã gửi biên lai nộp phạt</div>
        <p className="text-sm">Mã tham chiếu <b className="font-mono">{state.data.reference}</b>{state.data.total ? <> · <b>{money(state.data.total)}</b></> : null}. Trạng thái <b>Chờ duyệt</b> — khoản phạt được ghi đã đóng sau khi chủ website đối chiếu tiền thực nhận.</p>
        <button type="button" className="btn btn-ghost" onClick={() => location.reload()}>Nộp khoản khác</button>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-3">
        {groups.length === 0 ? (
          <div className="rounded-xl border border-neon/30 bg-neon/8 p-5 text-center">
            <div className="font-display text-2xl font-black uppercase text-neon">Không ai đang nợ phạt 🎉</div>
          </div>
        ) : groups.map((g) => {
          const gTotal = g.open.reduce((a, p) => a + Number(p.amount), 0);
          return (
            <div key={g.id} className={`rounded-xl border p-3 ${g.id === memberId ? "border-danger/50 bg-danger/6" : "border-white/10 bg-white/3"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b className="text-base">{names[g.id]}</b>
                {g.open.length > 1 ? (
                  <button type="button" onClick={() => pick(g.id, g.open.map((p) => p.id))} className="btn btn-ghost btn-sm">Nộp tất cả {money(gTotal)}</button>
                ) : null}
              </div>
              <ul className="mt-2 space-y-1.5">
                {g.list.map((p) => {
                  const open = p.status === "unpaid";
                  const on = g.id === memberId && picked.includes(p.id);
                  return (
                    <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${on ? "bg-danger/15" : "bg-black/20"}`}>
                      <label className="flex min-w-0 items-center gap-2">
                        {open ? <input type="checkbox" checked={on} onChange={(e) => toggle(p, e.target.checked)} className="accent-[#ff5d5d]" /> : null}
                        <span className="min-w-0 truncate">Vắng trận vs {p.opponent} · {fmtDate(p.starts_at)}</span>
                      </label>
                      <span className="flex items-center gap-2">
                        <b className="tabular-nums">{money(p.amount)}</b>
                        {open ? (
                          <button type="button" onClick={() => pick(g.id, [p.id])} className="btn btn-primary btn-sm">Nộp phạt</button>
                        ) : <span className="chip bg-info/15 text-info">Chờ duyệt</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div ref={panel} className="scroll-mt-20 lg:sticky lg:top-6 lg:h-fit">
        {chosen.length === 0 ? (
          <div className="panel p-5 text-sm text-muted">Bấm <b className="text-fg">Nộp phạt</b> ở khoản cần đóng — số tiền phải chuyển và thông tin thanh toán sẽ hiện ngay tại đây.</div>
        ) : (
          <form action={action} className="panel space-y-4 p-5">
            <input type="hidden" name="member_id" value={memberId} />
            <input type="hidden" name="amount" value={total} />
            {chosen.map((p) => <input key={p.id} type="hidden" name="penalties" value={p.id} />)}
            <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3">
              <div className="label mb-0">Số tiền cần chuyển · {names[memberId]}</div>
              <div className="font-display text-4xl font-black text-danger">{money(total)}</div>
              <div className="text-xs text-muted">{chosen.length} khoản phạt vắng mặt</div>
            </div>
            {bank}
            <div className="rounded-xl border border-white/10 p-3 text-sm">
              <div className="label">Nội dung chuyển khoản</div>
              <div className="flex items-center justify-between gap-2">
                <span className="break-all font-mono">{note}</span>
                <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => navigator.clipboard.writeText(note)}>Sao chép</button>
              </div>
            </div>
            <label className="block">
              <span className="label">Thời điểm chuyển khoản</span>
              <input name="transferred_at" type="datetime-local" required className="field" defaultValue={nowLocal()} suppressHydrationWarning />
            </label>
            <label className="block">
              <span className="label">Ảnh biên lai chuyển khoản (bắt buộc)</span>
              <input name="receipt" type="file" accept="image/jpeg,image/png,image/webp" required className="field"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setFileErr(null);
                  if (f && f.size > 10 * 1024 * 1024) { setFileErr("File quá lớn (tối đa 10 MB)."); e.target.value = ""; }
                }} />
              {fileErr ? <span className="mt-1 block text-sm text-danger">{fileErr}</span> : null}
            </label>
            <Result state={state} />
            <Submit pending={pending}>Gửi biên lai {money(total)}</Submit>
          </form>
        )}
      </div>
    </div>
  );
}

function nowLocal() {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
}

// ───────── Donation (ủng hộ) ─────────
export function DonateForm() {
  const [state, action, pending] = useIdempotentAction(donateAction);
  const [anon, setAnon] = useState(false);
  const [amount, setAmount] = useState(200000);
  if (state?.ok && state.data) {
    return (
      <div className="space-y-3 rounded-xl border border-neon/30 bg-neon/10 p-4">
        <div className="font-display text-2xl font-black uppercase text-neon">Cảm ơn bạn đã ủng hộ!</div>
        <p className="text-sm">Mã tham chiếu <b className="font-mono">{state.data.reference}</b>. Khoản ủng hộ sẽ vào quỹ và hiện trên bảng vàng sau khi chủ website xác nhận đã nhận tiền.</p>
        <button type="button" className="btn btn-ghost" onClick={() => location.reload()}>Ủng hộ thêm</button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div>
        <span className="label">Số tiền ủng hộ</span>
        <div className="mb-2 flex flex-wrap gap-2">
          {[50000, 100000, 200000, 500000, 1000000].map((v) => (
            <button key={v} type="button" onClick={() => setAmount(v)} className={`btn btn-sm ${amount === v ? "btn-primary" : "btn-ghost"}`}>{money(v)}</button>
          ))}
        </div>
        <input name="amount" type="number" min={1000} step={1000} required value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="field tabular-nums" />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="anonymous" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="accent-[#c8ff3c]" /> Ủng hộ ẩn danh
      </label>
      {!anon ? (
        <label className="block"><span className="label">Tên hiển thị trên bảng vàng</span><input name="donor_name" required minLength={2} maxLength={80} className="field" /></label>
      ) : null}
      <label className="block"><span className="label">Lời nhắn (tùy chọn, công khai)</span><input name="message" maxLength={200} className="field" /></label>
      <label className="block"><span className="label">Thời điểm chuyển khoản</span><input name="transferred_at" type="datetime-local" required defaultValue={nowLocal()} suppressHydrationWarning className="field" /></label>
      <label className="block"><span className="label">Ảnh biên lai chuyển khoản (bắt buộc)</span><input name="receipt" type="file" accept="image/jpeg,image/png,image/webp" required className="field" /></label>
      <Result state={state} />
      <Submit pending={pending}>Gửi ủng hộ {money(amount)}</Submit>
    </form>
  );
}