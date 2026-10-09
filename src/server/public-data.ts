import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { publicDb } from "@/lib/supabase/public";
import type { MemberStats, PubMember } from "@/lib/domain";

// Public data access — reads ONLY field-limited pub_* projections through the anonymous client.

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export type Team = {
  team_name: string; tagline: string; monthly_fee: number; fee_student: number; fee_maintain: number; penalty_absent: number;
  due_day: number; collect_start_day: number; bank_name: string | null;
  bank_account_no: string | null; bank_account_name: string | null; transfer_note_template: string;
  default_formation: string; rsvp_hours_before: number; expense_categories: string[]; income_categories: string[];
};

export const getTeam = cache(async (): Promise<Team> => {
  await connection();
  return must(await publicDb().from("pub_team").select("*").single());
});

export const getMembers = cache(async (): Promise<PubMember[]> => {
  await connection();
  return must(await publicDb().from("pub_members").select("*").order("shirt_number", { ascending: true, nullsFirst: false }));
});

export const getMemberStats = cache(async (from: string, to: string): Promise<Map<string, MemberStats>> => {
  await connection();
  const rows = must<MemberStats[]>(await publicDb().rpc("pub_member_stats", { p_from: from, p_to: to }));
  return new Map(rows.map((r) => [r.member_id, r]));
});

export type FormRow = { member_id: string; appearances: number; goals: number; gatherings: number; score: number; season_score: number };

/** Monthly form: score = appearances + 2 × confirmed goals; season score breaks ties (same rule as the auto lineup). */
export const getMemberForm = cache(async (month: string): Promise<FormRow[]> => {
  await connection();
  const rows = must<FormRow[]>(await publicDb().rpc("pub_member_form", { p_month: month }));
  return rows
    .map((r) => ({ ...r, score: Number(r.score), season_score: Number(r.season_score), appearances: Number(r.appearances), goals: Number(r.goals) }))
    .sort((a, b) => b.score - a.score || b.season_score - a.season_score);
});

export type FundSummary = {
  balance: number; committed: number; available: number; month_in: number; month_out: number;
  outstanding: number; pending_amount: number; opening_set: boolean; penalties_outstanding: number; updated_at: string | null;
};

export const getFundSummary = cache(async (month: string): Promise<FundSummary> => {
  await connection();
  return must(await publicDb().rpc("pub_fund_summary", { p_month: month }));
});

export type LedgerRow = {
  id: string; direction: "in" | "out"; amount: number; posting_date: string; occurred_at: string; posting_month: string;
  category: string; public_description: string; source_type: string; reversal_of: string | null; reversed_by: string | null;
  is_opening: boolean; match_id: string | null; obligation_month: string | null; period_note: string | null;
  flow: "expense" | "income" | "opening"; match_opponent: string | null; match_starts_at: string | null; created_at: string;
};

export async function getLedger(opts: {
  month?: string; flow?: "expense" | "income"; category?: string; page?: number; pageSize?: number;
}): Promise<{ rows: LedgerRow[]; total: number; sum: number }> {
  await connection();
  const page = Math.max(1, opts.page ?? 1);
  const size = opts.pageSize ?? 10;
  let q = publicDb().from("pub_ledger").select("*", { count: "exact" });
  let s = publicDb().from("pub_ledger").select("direction, amount");
  if (opts.month) { q = q.eq("posting_month", opts.month); s = s.eq("posting_month", opts.month); }
  if (opts.flow) { q = q.eq("flow", opts.flow); s = s.eq("flow", opts.flow); }
  if (opts.category) { q = q.eq("category", opts.category); s = s.eq("category", opts.category); }
  const [res, sumRes] = await Promise.all([
    q.order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).range((page - 1) * size, page * size - 1),
    s,
  ]);
  const rows = must<LedgerRow[]>(res);
  const all = must<{ direction: string; amount: number }[]>(sumRes);
  // Totals follow ledger direction (guideline 7.3/7.6): "chi" = sum of outgoing rows, refunds back count as income.
  const dir = opts.flow === "income" ? "in" : "out";
  const sum = all.reduce((acc, r) => acc + (r.direction === dir ? Number(r.amount) : 0), 0);
  return { rows, total: res.count ?? rows.length, sum };
}

export const getExpectedExpenses = cache(async () => {
  await connection();
  return must<{ id: string; category: string; amount: number; public_description: string; planned_date: string | null; match_id: string | null }[]>(
    await publicDb().from("pub_expected_expenses").select("*").order("planned_date", { ascending: true }),
  );
});

export type Period = { month: string; due_date: string; fee_amount: number; status: string; opening_balance: number | null; closing_balance: number | null; closed_at: string | null };

export const getPeriods = cache(async (): Promise<Period[]> => {
  await connection();
  return must(await publicDb().from("pub_periods").select("*").order("month", { ascending: false }));
});

export type DueRow = { member_id: string; obligation_month: string; amount_due: number; due_date: string; status: string; overdue: boolean };

export const getDues = cache(async (months?: string[]): Promise<DueRow[]> => {
  await connection();
  let q = publicDb().from("pub_dues").select("*");
  if (months?.length) q = q.in("obligation_month", months);
  return must(await q);
});

export type Match = {
  id: string; opponent: string; match_type: string; starts_at: string; ends_at: string | null; venue_name: string;
  pitch_no: string | null; address: string | null; map_url: string | null; parking_note: string | null;
  pitch_cost_estimate: number | null; team_share_estimate: number | null; rsvp_deadline: string; coordinator: string | null;
  note: string | null; status: string; schedule_version: number; score_us: number | null; score_them: number | null;
  post_note: string | null; attendance_complete: boolean; updated_at: string;
};

export const getMatches = cache(async (): Promise<Match[]> => {
  await connection();
  return must(await publicDb().from("pub_matches").select("*").order("starts_at", { ascending: false }));
});

export const getMatch = cache(async (id: string): Promise<Match | null> => {
  await connection();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return must(await publicDb().from("pub_matches").select("*").eq("id", id).maybeSingle());
});

/** Next match = published, not cancelled/postponed/completed, nearest start in the future. */
export const getNextMatch = cache(async (): Promise<Match | null> => {
  await connection();
  return must(
    await publicDb().from("pub_matches").select("*").eq("status", "published").gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true }).limit(1).maybeSingle(),
  );
});

export type Rsvp = {
  match_id: string; member_id: string; response: string; gathering_response: string; position_code: string | null;
  needs_reconfirm: boolean; changed_at: string;
};

export const getRsvps = cache(async (matchId: string): Promise<Rsvp[]> => {
  await connection();
  return must(await publicDb().from("pub_rsvps").select("*").eq("match_id", matchId));
});

export type LineupSlot = { member_id: string; role: "starter" | "sub"; slot_code: string | null; sub_order: number | null };
export type PubLineup = {
  match_id: string; status: string; needs_update_reason: string | null; published_at: string; auto: boolean;
  version: number; formation: string; slots: LineupSlot[];
};

export const getLineup = cache(async (matchId: string): Promise<PubLineup | null> => {
  await connection();
  return must(await publicDb().from("pub_lineups").select("*").eq("match_id", matchId).maybeSingle());
});

export type Participation = { match_id: string; member_id: string; actual_status: string; was_starter: boolean | null; positions: string[]; goals: number | null; goals_confirmed: boolean };

export const getParticipations = cache(async (matchId: string): Promise<Participation[]> => {
  await connection();
  return must(await publicDb().from("pub_participations").select("*").eq("match_id", matchId));
});

export type Gathering = { id: string; match_id: string; starts_at: string | null; location: string | null; note: string | null; status: string };

export const getGathering = cache(async (matchId: string): Promise<{ g: Gathering | null; attendance: { member_id: string; actual_status: string }[] }> => {
  await connection();
  const g = must<Gathering | null>(await publicDb().from("pub_gatherings").select("*").eq("match_id", matchId).maybeSingle());
  if (!g) return { g: null, attendance: [] };
  const attendance = must<{ member_id: string; actual_status: string }[]>(
    await publicDb().from("pub_gathering_attendance").select("member_id, actual_status").eq("gathering_id", g.id),
  );
  return { g, attendance };
});

export type RewardEvent = {
  id: string; title: string; description: string | null; starts_on: string; ends_on: string; result_deadline: string | null;
  audience: string; audience_positions: string[]; requires_played: boolean; rules: string; exclusions: string | null;
  method: string; tie_rule: string; tie_note: string | null; funding_source: string; budget_max: number | null;
  status: string; rules_version: number; finalized_at: string | null; cancel_reason: string | null;
};
export type Prize = { id: string; event_id: string; rank: number; name: string; winners_count: number; amount_each: number; item_desc: string | null };
export type RewardResult = { id: string; prize_id: string; event_id: string; member_id: string; basis: string; amount: number; delivery_status: string; finalized_at: string };

export const getRewards = cache(async () => {
  await connection();
  const [events, prizes, results, matches] = await Promise.all([
    publicDb().from("pub_reward_events").select("*").order("starts_on", { ascending: false }),
    publicDb().from("pub_reward_prizes").select("*").order("rank"),
    publicDb().from("pub_reward_results").select("*"),
    publicDb().from("pub_reward_event_matches").select("*"),
  ]);
  return {
    events: must<RewardEvent[]>(events),
    prizes: must<Prize[]>(prizes),
    results: must<RewardResult[]>(results),
    eventMatches: must<{ event_id: string; match_id: string }[]>(matches),
  };
});

export type Penalty = {
  id: string; match_id: string; member_id: string; amount: number; reason: string; status: string;
  created_at: string; opponent: string; starts_at: string;
};

export const getPenalties = cache(async (): Promise<Penalty[]> => {
  await connection();
  return must(await publicDb().from("pub_penalties").select("*").order("starts_at", { ascending: false }));
});

export type Donation = { id: string; donor_name: string | null; amount: number; message: string | null; reviewed_at: string };

export const getDonations = cache(async (): Promise<Donation[]> => {
  await connection();
  return must(await publicDb().from("pub_donations").select("*").order("reviewed_at", { ascending: false }));
});

export type UnpaidRow = { member_id: string; fee_type: string; amount: number; status: "unpaid" | "pending" };

/** Active members with a fee who have not paid the given month (pending = receipt waiting for approval). */
export const getUnpaid = cache(async (month: string): Promise<UnpaidRow[]> => {
  await connection();
  return must(await publicDb().rpc("pub_unpaid", { p_month: month }));
});

export type Notice = { id: string; kind: string; title: string; body: string | null; link: string | null; created_at: string };

export const getNotices = cache(async (limit = 8): Promise<Notice[]> => {
  await connection();
  return must(await publicDb().from("pub_notifications").select("*").order("created_at", { ascending: false }).limit(limit));
});

export const getAllParticipations = cache(async (): Promise<Participation[]> => {
  await connection();
  return must(await publicDb().from("pub_participations").select("*"));
});
