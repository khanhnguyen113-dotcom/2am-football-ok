const TZ = "Asia/Ho_Chi_Minh";

const vnd = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });

/** 150000 → "150.000 ₫" (money is always whole VND; never floating point arithmetic on amounts) */
export function money(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  return `${vnd.format(Number(v))} ₫`;
}

export function moneyShort(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}TR`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function fmtDate(v: string | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (!v) return "—";
  const d = typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00+07:00`) : new Date(v);
  return new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", ...opts }).format(d);
}

export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
  }).format(new Date(v));
}

export function fmtTime(v: string | Date): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}

export function fmtWeekday(v: string | Date): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" }).format(new Date(v));
}

/** Today's date in Vietnam as YYYY-MM-DD */
export function vnToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function vnMonth(): string {
  return vnToday().slice(0, 7);
}

export function monthLabel(m: string): string {
  const [y, mo] = m.split("-");
  return `Tháng ${Number(mo)}/${y}`;
}

export function shiftMonth(m: string, delta: number): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function isMonth(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** datetime-local input value (VN time) → ISO string with +07:00 */
export function localInputToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  return new Date(`${v.length === 16 ? `${v}:00` : v}+07:00`).toISOString();
}

/** ISO → datetime-local value in VN time */
export function isoToLocalInput(v: string | null | undefined): string {
  if (!v) return "";
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(v));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}

export function relativeFromNow(v: string): string {
  const diff = new Date(v).getTime() - Date.now();
  const abs = Math.abs(diff);
  const h = Math.floor(abs / 3_600_000);
  const d = Math.floor(h / 24);
  const txt = d >= 1 ? `${d} ngày ${h % 24} giờ` : h >= 1 ? `${h} giờ` : `${Math.max(1, Math.floor(abs / 60_000))} phút`;
  return diff >= 0 ? `còn ${txt}` : `${txt} trước`;
}
