import "server-only";
import type { MemberOption } from "@/components/forms";
import { displayName, type PubMember } from "@/lib/domain";
import { vnToday } from "@/lib/format";

export function memberOptions(members: PubMember[], filter: (m: PubMember) => boolean = (m) => m.status === "active"): MemberOption[] {
  return members
    .filter(filter)
    .sort((a, b) => (a.shirt_number ?? 999) - (b.shirt_number ?? 999))
    .map((m) => ({
      id: m.id,
      label: `${m.shirt_number ? `#${m.shirt_number} ` : ""}${displayName(m)}`,
      sub: m.nickname ? m.full_name : undefined,
    }));
}

export function rsvpOptions(members: PubMember[]) {
  return memberOptions(members).map((o) => {
    const m = members.find((x) => x.id === o.id)!;
    return { ...o, primary: m.primary_position ?? m.positions[0] ?? null };
  });
}

/** First and last day of a YYYY-MM month (last day capped at today for the current month). */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${String(last).padStart(2, "0")}`;
  const today = vnToday();
  return { from: `${month}-01`, to: end > today ? today : end };
}

/** Monthly fee for a member type (mirrors public.member_fee). */
export function feeFor(team: { monthly_fee: number; fee_student: number; fee_maintain: number }, feeType: string): number {
  return Number({ standard: team.monthly_fee, student: team.fee_student, maintain: team.fee_maintain }[feeType] ?? 0);
}

/** Month currently being collected: collection opens on day `collect_start_day` for the NEXT month (deadline: day `due_day`). */
export function collectionMonth(team: { collect_start_day: number }): string {
  const today = vnToday();
  const month = today.slice(0, 7);
  if (Number(today.slice(8, 10)) < team.collect_start_day) return month;
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function seasonRange(year?: string): { from: string; to: string; year: string } {
  const today = vnToday();
  const y = year && /^\d{4}$/.test(year) ? year : today.slice(0, 4);
  return { from: `${y}-01-01`, to: y === today.slice(0, 4) ? today : `${y}-12-31`, year: y };
}

export type SP = Promise<Record<string, string | string[] | undefined>>;

export async function sp(searchParams: SP): Promise<Record<string, string | undefined>> {
  const raw = await searchParams;
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}

/** Current time for request-time rendering (kept out of component bodies). */
export async function requestTime(): Promise<number> {
  return Date.now();
}
