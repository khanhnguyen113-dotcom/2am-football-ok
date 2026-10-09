-- 2AM FC — public projections (field-limited DTO views), RLS, grants, storage.
-- Views run with owner rights and expose ONLY listed columns; base tables are closed to anon.

create view public.pub_team as
select team_name, tagline, monthly_fee, fee_student, fee_maintain, penalty_absent, due_day, collect_start_day, bank_name, bank_account_no, bank_account_name,
       transfer_note_template, default_formation, rsvp_hours_before, expense_categories, income_categories, updated_at
from public.team_settings;

create view public.pub_members as
select m.id, m.full_name, m.nickname, m.avatar_path, m.shirt_number, m.preferred_foot, m.joined_on, m.left_on, m.status, m.version, m.fee_type,
  (select mp.position_code from public.member_positions mp where mp.member_id = m.id and mp.is_primary) as primary_position,
  coalesce((select array_agg(mp.position_code order by p.sort) from public.member_positions mp
            join public.positions p on p.code = mp.position_code where mp.member_id = m.id), '{}') as positions
from public.members m;

create view public.pub_periods as
select month, due_date, fee_amount, status, opening_balance, closing_balance, closed_at from public.fund_periods;

create view public.pub_dues as
select d.member_id, d.obligation_month, d.amount_due, d.due_date,
  case
    when exists (select 1 from public.payment_submissions s where s.due_id = d.id and s.status = 'approved') then 'paid'
    when d.amount_due = 0 then 'exempt'
    when exists (select 1 from public.payment_submissions s where s.due_id = d.id and s.status = 'pending') then 'pending'
    else 'unpaid' end as status,
  (d.amount_due > 0 and d.due_date < public.vn_today()
   and not exists (select 1 from public.payment_submissions s where s.due_id = d.id and s.status = 'approved')) as overdue
from public.monthly_dues d;

create view public.pub_ledger as
select l.id, l.direction, l.amount, l.posting_date, l.occurred_at, l.posting_month, l.category, l.public_description,
  l.source_type, l.reversal_of, l.is_opening, l.match_id, l.obligation_month, l.period_note, l.created_at,
  (select r.id from public.fund_ledger r where r.reversal_of = l.id) as reversed_by,
  case when l.is_opening then 'opening'
       when l.direction = 'out' or (l.source_type = 'reversal' and o.direction = 'out') then 'expense'
       else 'income' end as flow,
  mt.opponent as match_opponent, mt.starts_at as match_starts_at
from public.fund_ledger l
left join public.fund_ledger o on o.id = l.reversal_of
left join public.matches mt on mt.id = l.match_id;

create view public.pub_expected_expenses as
select r.id, r.category, r.amount, r.public_description, r.planned_date, r.match_id, r.approved_at
from public.fund_requests r where r.kind = 'expense' and r.status = 'approved';

create view public.pub_matches as
select id, opponent, match_type, starts_at, ends_at, venue_name, pitch_no, address, map_url, parking_note,
  pitch_cost_estimate, team_share_estimate, rsvp_deadline, coordinator, note, status, schedule_version,
  score_us, score_them, post_note, attendance_complete, updated_at
from public.matches where status <> 'draft';

create view public.pub_rsvps as
select r.match_id, r.member_id, r.response, r.gathering_response, r.position_code, r.accepted_schedule_version,
  (r.accepted_schedule_version < m.schedule_version) as needs_reconfirm, r.changed_at
from public.match_rsvps r join public.matches m on m.id = r.match_id where m.status <> 'draft';

create view public.pub_lineups as
select l.match_id, l.status, l.needs_update_reason, l.published_at, l.auto, s.version, s.formation, s.slots
from public.lineups l
join public.lineup_snapshots s on s.lineup_id = l.id and s.version = l.published_version
join public.matches m on m.id = l.match_id and m.status <> 'draft';

create view public.pub_participations as
select p.match_id, p.member_id, p.actual_status, p.was_starter, p.positions,
  case when p.goals_confirmed then p.goals end as goals, p.goals_confirmed
from public.match_participations p join public.matches m on m.id = p.match_id where m.status = 'completed';

create view public.pub_gatherings as
select g.id, g.match_id, g.starts_at, g.location, g.note, g.status
from public.post_match_gatherings g join public.matches m on m.id = g.match_id where m.status <> 'draft';

create view public.pub_gathering_attendance as
select a.gathering_id, a.member_id, a.actual_status
from public.gathering_attendance a join public.post_match_gatherings g on g.id = a.gathering_id where g.status = 'done';

create view public.pub_reward_events as
select id, title, description, starts_on, ends_on, result_deadline, audience, audience_positions, requires_played,
  rules, exclusions, method, tie_rule, tie_note, funding_source, budget_max, status, rules_version, finalized_at, cancel_reason
from public.reward_events where status <> 'draft';

create view public.pub_reward_prizes as
select p.id, p.event_id, p.rank, p.name, p.winners_count, p.amount_each, p.item_desc
from public.reward_prizes p join public.reward_events e on e.id = p.event_id where e.status <> 'draft';

create view public.pub_reward_event_matches as
select em.event_id, em.match_id from public.reward_event_matches em
join public.reward_events e on e.id = em.event_id where e.status <> 'draft';

create view public.pub_reward_results as
select r.id, r.prize_id, p.event_id, r.member_id, r.basis, r.amount, r.delivery_status, r.finalized_at
from public.reward_results r join public.reward_prizes p on p.id = r.prize_id
join public.reward_events e on e.id = p.event_id where r.status = 'active' and e.status = 'finalized';

create view public.pub_penalties as
select pe.id, pe.match_id, pe.member_id, pe.amount, pe.reason, pe.created_at, mt.opponent, mt.starts_at,
  case when pe.status = 'unpaid' and exists (select 1 from public.payment_submissions s where s.penalty_id = pe.id and s.status = 'pending')
       then 'pending' else pe.status end as status
from public.penalties pe join public.matches mt on mt.id = pe.match_id where pe.status <> 'cancelled';

create view public.pub_donations as
select d.id, case when d.anonymous then null else d.donor_name end as donor_name, d.amount, d.message, d.reviewed_at
from public.donations d where d.status = 'approved';

create view public.pub_notifications as
select id, kind, title, body, link, created_at from public.notifications where audience = 'public';

-- Fund summary for a month (posting_date based). Opening counted once in balance only.
create or replace function public.pub_fund_summary(p_month text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'balance', public.fund_balance(),
    'committed', public.fund_committed(),
    'available', public.fund_balance() - public.fund_committed(),
    'month_in', (select coalesce(sum(amount), 0) from public.fund_ledger where posting_month = p_month and direction = 'in' and not is_opening),
    'month_out', (select coalesce(sum(amount), 0) from public.fund_ledger where posting_month = p_month and direction = 'out'),
    'outstanding', (select coalesce(sum(d.amount_due), 0) from public.monthly_dues d
                    where not exists (select 1 from public.payment_submissions s where s.due_id = d.id and s.status = 'approved')),
    'pending_amount', (select coalesce(sum(s.amount), 0) from public.payment_submissions s where s.status = 'pending'),
    'opening_set', exists (select 1 from public.fund_ledger where is_opening),
    'penalties_outstanding', (select coalesce(sum(amount), 0) from public.penalties where status = 'unpaid'),
    'updated_at', (select max(created_at) from public.fund_ledger))
$$;

-- Statistics by date range (AT12, AT16–AT18): only confirmed facts of non-cancelled events.
create or replace function public.pub_member_stats(p_from date, p_to date)
returns table (member_id uuid, appearances bigint, goals bigint, gatherings bigint, rsvp_yes bigint,
               rewards bigint, paid_amount numeric, unconfirmed bigint)
language sql stable security definer set search_path = '' as $$
  with ms as (
    select id, (starts_at at time zone 'Asia/Ho_Chi_Minh')::date as d, status from public.matches
    where (starts_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to
  )
  select m.id,
    (select count(distinct p.match_id) from public.match_participations p join ms on ms.id = p.match_id
      where p.member_id = m.id and ms.status = 'completed' and p.actual_status = 'played'),
    (select coalesce(sum(p.goals), 0) from public.match_participations p join ms on ms.id = p.match_id
      where p.member_id = m.id and ms.status = 'completed' and p.goals_confirmed),
    (select count(distinct g.id) from public.gathering_attendance a join public.post_match_gatherings g on g.id = a.gathering_id
      where a.member_id = m.id and g.status = 'done' and a.actual_status = 'attended'
        and (coalesce(g.starts_at, now()) at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to),
    (select count(*) from public.match_rsvps r join ms on ms.id = r.match_id join public.matches mm on mm.id = r.match_id
      where r.member_id = m.id and r.response = 'yes' and r.accepted_schedule_version = mm.schedule_version and ms.status <> 'cancelled'),
    (select count(*) from public.reward_results rr join public.reward_prizes pr on pr.id = rr.prize_id
      join public.reward_events e on e.id = pr.event_id
      where rr.member_id = m.id and rr.status = 'active' and e.status = 'finalized'
        and (e.finalized_at at time zone 'Asia/Ho_Chi_Minh')::date between p_from and p_to),
    (select coalesce(sum(case l.direction when 'in' then l.amount else -l.amount end), 0) from public.fund_ledger l
      where l.member_id = m.id and l.obligation_month is not null
        and l.posting_date between p_from and p_to),
    (select count(*) from public.match_participations p join ms on ms.id = p.match_id
      where p.member_id = m.id and ms.status = 'completed' and (p.actual_status = 'unconfirmed' or (p.actual_status = 'played' and not p.goals_confirmed)))
  from public.members m
$$;

-- Who has not paid a month yet (collection opens on collect_start_day of the previous month, deadline due_day).
-- Active members with a non-zero fee; amount from the existing obligation or from the member type.
create or replace function public.pub_unpaid(p_month text)
returns table (member_id uuid, fee_type text, amount numeric, status text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.fee_type, coalesce(d.amount_due, public.member_fee(m.id)),
    case when exists (select 1 from public.payment_submissions s where s.due_id = d.id and s.status = 'pending') then 'pending' else 'unpaid' end
  from public.members m
  left join public.monthly_dues d on d.member_id = m.id and d.obligation_month = p_month
  where m.status = 'active' and public.month_of(m.joined_on) <= p_month
    and coalesce(d.amount_due, public.member_fee(m.id)) > 0
    and not exists (select 1 from public.payment_submissions s where s.due_id = d.id and s.status = 'approved')
$$;

-- ───────────────────────── Monthly form & auto lineup (owner request v2) ─────────────────────────
-- Form score of a month = appearances + 2 × confirmed goals (only confirmed facts). Season score breaks ties.
create or replace function public.pub_member_form(p_month text)
returns table (member_id uuid, appearances bigint, goals bigint, gatherings bigint, score bigint, season_score bigint)
language sql stable security definer set search_path = '' as $$
  with b as (select (p_month || '-01')::date as d0),
  mon as (select s.* from b, public.pub_member_stats(b.d0, (b.d0 + interval '1 month - 1 day')::date) s),
  sea as (select s.* from b, public.pub_member_stats(date_trunc('year', b.d0)::date, (b.d0 + interval '1 month - 1 day')::date) s)
  select mon.member_id, mon.appearances, mon.goals, mon.gatherings,
         (mon.appearances + 2 * mon.goals)::bigint, (sea.appearances + 2 * sea.goals)::bigint
  from mon join sea on sea.member_id = mon.member_id
$$;

-- Players eligible for a match lineup: active + "yes" on the current schedule, with the line they asked to play.
create or replace function public.lineup_candidates(p_match_id uuid)
returns table (member_id uuid, chosen_line text, alt_lines text[], score bigint, season bigint, shirt int)
language sql stable security definer set search_path = '' as $$
  select r.member_id, p.line,
    coalesce((select array_agg(distinct pp.line) from public.member_positions mp
              join public.positions pp on pp.code = mp.position_code where mp.member_id = r.member_id), '{}'),
    coalesce(f.score, 0), coalesce(f.season_score, 0), m.shirt_number
  from public.match_rsvps r
  join public.matches mt on mt.id = r.match_id
  join public.members m on m.id = r.member_id and m.status = 'active'
  left join public.positions p on p.code = coalesce(r.position_code,
    (select mp.position_code from public.member_positions mp where mp.member_id = r.member_id and mp.is_primary))
  left join public.pub_member_form(public.month_of(public.vn_today())) f on f.member_id = r.member_id
  where r.match_id = p_match_id and r.response = 'yes' and r.accepted_schedule_version = mt.schedule_version
$$;

-- Auto-arrange and save the expected lineup (sân 7 = 1 GK + 6):
--   1) each slot gets the best-form player who chose that line;
--   2) empty slots are filled by remaining players — those listing the line among their positions first, then by form;
--   3) everyone else becomes a substitute ordered by form.
-- Skipped when the admin has taken manual control (lineups.auto = false).
create or replace function public.auto_lineup(p_match_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_match public.matches; l public.lineups; v_slots text[]; v_slot text; v_line text; v_pick uuid;
  v_cand jsonb; v_used uuid[] := '{}'; v_assign jsonb := '[]'::jsonb; v_sub int := 0; v_starters int; v_gk boolean; r record;
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found or v_match.status <> 'published' then return; end if;
  select * into l from public.lineups where match_id = p_match_id for update;
  if found and not l.auto then return; end if;
  if not found then
    insert into public.lineups (match_id, formation, auto)
    select p_match_id, t.default_formation, true from public.team_settings t returning * into l;
  end if;
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_cand from public.lineup_candidates(p_match_id) c;
  v_slots := public.formation_slots(l.formation);

  foreach v_slot in array v_slots loop
    v_line := regexp_replace(v_slot, '\d+$', '');
    select c.member_id into v_pick
    from jsonb_to_recordset(v_cand) as c(member_id uuid, chosen_line text, alt_lines text[], score bigint, season bigint, shirt int)
    where c.chosen_line = v_line and not (c.member_id = any(v_used))
    order by c.score desc, c.season desc, c.shirt nulls last, c.member_id limit 1;
    if v_pick is not null then
      v_used := v_used || v_pick;
      v_assign := v_assign || jsonb_build_array(jsonb_build_object('member_id', v_pick, 'role', 'starter', 'slot_code', v_slot));
    end if;
  end loop;

  foreach v_slot in array v_slots loop
    continue when exists (select 1 from jsonb_array_elements(v_assign) a where a->>'slot_code' = v_slot);
    v_line := regexp_replace(v_slot, '\d+$', '');
    select c.member_id into v_pick
    from jsonb_to_recordset(v_cand) as c(member_id uuid, chosen_line text, alt_lines text[], score bigint, season bigint, shirt int)
    where not (c.member_id = any(v_used))
    order by (v_line = any(c.alt_lines)) desc, c.score desc, c.season desc, c.shirt nulls last, c.member_id limit 1;
    if v_pick is not null then
      v_used := v_used || v_pick;
      v_assign := v_assign || jsonb_build_array(jsonb_build_object('member_id', v_pick, 'role', 'starter', 'slot_code', v_slot));
    end if;
  end loop;

  for r in
    select c.member_id
    from jsonb_to_recordset(v_cand) as c(member_id uuid, chosen_line text, alt_lines text[], score bigint, season bigint, shirt int)
    where not (c.member_id = any(v_used))
    order by c.score desc, c.season desc, c.shirt nulls last, c.member_id
  loop
    v_sub := v_sub + 1;
    v_assign := v_assign || jsonb_build_array(jsonb_build_object('member_id', r.member_id, 'role', 'sub', 'sub_order', v_sub));
  end loop;

  delete from public.lineup_slots where lineup_id = l.id;
  insert into public.lineup_slots (lineup_id, member_id, role, slot_code, sub_order)
  select l.id, (a->>'member_id')::uuid, a->>'role', a->>'slot_code', (a->>'sub_order')::int from jsonb_array_elements(v_assign) a;
  select count(*) filter (where role = 'starter'), coalesce(bool_or(slot_code = 'GK'), false) into v_starters, v_gk
  from public.lineup_slots where lineup_id = l.id;

  update public.lineups set
    status = case when v_starters = 7 and v_gk then 'published' else 'needs_update' end,
    needs_update_reason = case when v_starters < 7 then 'Thiếu ' || (7 - v_starters) || ' cầu thủ xác nhận tham gia'
                               when not v_gk then 'Chưa có thủ môn' end,
    published_at = now(), published_version = l.version + 1
  where id = l.id returning * into l;
  insert into public.lineup_snapshots (lineup_id, version, formation, slots) values (l.id, l.version, l.formation, v_assign);
end $$;

create or replace function public.refresh_auto_lineups() returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select m.id from public.matches m where m.status = 'published' and m.starts_at > now() loop
    perform public.auto_lineup(r.id);
  end loop;
end $$;

create or replace function public.admin_enable_auto_lineup(p_match_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin();
begin
  perform public.set_ctx('admin', null, null, 'Bật lại xếp đội hình tự động');
  update public.lineups set auto = true where match_id = p_match_id;
  perform public.auto_lineup(p_match_id);
end $$;
-- ───────────────────────── RLS ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'admin_settings','team_settings','positions','members','member_private_details','member_positions','member_name_history',
    'file_assets','fund_periods','monthly_dues','payment_submissions','matches','match_rsvps',
    'match_rsvp_history','post_match_gatherings','lineups','lineup_slots','lineup_snapshots','match_participations',
    'gathering_attendance','reward_events','reward_event_matches','reward_event_eligible_members','reward_prizes',
    'reward_results','fund_requests','reward_payouts','fund_ledger','penalties','donations',
    'notifications','audit_logs']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
create policy positions_read on public.positions for select to anon, authenticated using (true);

-- ───────────────────────── Grants ─────────────────────────
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;           -- RLS: admin only
revoke insert, update, delete on public.fund_ledger, public.audit_logs, public.member_name_history,
  public.match_rsvp_history, public.lineup_snapshots, public.admin_settings from authenticated;
-- simple views are auto-updatable with owner rights: never allow writes through projections
revoke insert, update, delete on public.pub_team, public.pub_members, public.pub_periods, public.pub_dues, public.pub_ledger,
  public.pub_expected_expenses, public.pub_matches, public.pub_rsvps, public.pub_lineups, public.pub_participations,
  public.pub_gatherings, public.pub_gathering_attendance,
  public.pub_reward_events, public.pub_reward_prizes, public.pub_reward_event_matches, public.pub_reward_results,
  public.pub_notifications, public.pub_penalties, public.pub_donations from authenticated;
grant select on public.positions to anon;
grant select on public.pub_team, public.pub_members, public.pub_periods, public.pub_dues, public.pub_ledger,
  public.pub_expected_expenses, public.pub_matches, public.pub_rsvps, public.pub_lineups, public.pub_participations,
  public.pub_gatherings, public.pub_gathering_attendance,
  public.pub_reward_events, public.pub_reward_prizes, public.pub_reward_event_matches, public.pub_reward_results,
  public.pub_notifications, public.pub_penalties, public.pub_donations to anon, authenticated;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

-- helpers referenced by views/policies
grant execute on function public.vn_today(), public.month_of(date), public.vnd(numeric), public.is_admin(),
  public.member_label(uuid), public.storage_can_insert(text, text) to anon, authenticated;
-- public read + whitelisted public commands
grant execute on function public.pub_fund_summary(text), public.pub_member_stats(date, date), public.pub_member_form(text),
  public.update_public_member_profile(uuid, text, text, text[], text, int, text),
  public.begin_public_upload(text, text, int, text),
  public.set_public_member_avatar(uuid, uuid, text),
  public.submit_public_payment(uuid, text[], uuid[], numeric, timestamptz, uuid, text),
  public.submit_public_donation(text, boolean, numeric, text, timestamptz, uuid, text),
  public.pub_unpaid(text),
  public.set_public_rsvp(uuid, uuid, text, text, text, text, text),
  public.reward_goal_table(uuid)
  to anon, authenticated;
-- admin commands (each checks require_admin internally)
grant execute on function
  public.admin_save_member(uuid, jsonb, text[], text, int), public.admin_delete_member(uuid),
  public.admin_restore_member_name(uuid), public.admin_create_period(text, date), public.admin_generate_dues(text, uuid[]),
  public.admin_adjust_due(uuid, numeric, text), public.admin_approve_payment(uuid), public.admin_reject_payment(uuid, text),
  public.admin_withdraw_payment(uuid, text), public.admin_set_opening_balance(numeric, date),
  public.admin_create_fund_request(jsonb), public.admin_decide_fund_request(uuid, text, text, date),
  public.admin_record_expense_paid(uuid, date, numeric, uuid, text), public.admin_reverse_ledger(uuid, text),
  public.admin_close_period(text, numeric, text), public.admin_set_rsvp(uuid, uuid, text, text, text, text),
  public.admin_enable_auto_lineup(uuid), public.admin_waive_penalty(uuid, text),
  public.admin_review_donation(uuid, text, text), public.admin_record_direct(jsonb, uuid),
  public.admin_save_lineup(uuid, text, jsonb, int, boolean),
  public.admin_save_participation(uuid, jsonb, int, int, text, boolean, boolean, text),
  public.admin_save_gathering(uuid, jsonb, jsonb),
  public.admin_save_reward_event(uuid, jsonb, uuid[], jsonb, uuid[], int, text),
  public.admin_set_reward_status(uuid, text, text), public.admin_finalize_reward(uuid, jsonb),
  public.admin_request_reward_payout(uuid), public.admin_mark_reward_delivered(uuid), public.admin_void_reward_result(uuid, text),
  public.admin_mark_notifications_read(), public.admin_begin_upload(text, text, int, text), public.admin_finish_avatar(uuid, uuid),
  public.formation_slots(text), public.fund_balance(), public.fund_committed()
  to authenticated;

-- ───────────────────────── Storage ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp']),
  ('receipts', 'receipts', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('expense-docs', 'expense-docs', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Guests may only INSERT the exact new object path reserved by begin_public_upload (no list/read/overwrite/delete).
create policy guest_insert_reserved on storage.objects for insert to anon, authenticated
  with check (bucket_id in ('receipts','avatars') and public.storage_can_insert(bucket_id, name));
create policy admin_insert_reserved on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars','expense-docs') and public.is_admin() and public.storage_can_insert(bucket_id, name));
create policy admin_read_private on storage.objects for select to authenticated
  using (bucket_id in ('receipts','expense-docs','avatars') and public.is_admin());
