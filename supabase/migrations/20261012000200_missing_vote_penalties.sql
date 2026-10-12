-- Applies prospectively. Existing matches and paid/waived fines are preserved.
alter table public.team_settings
  add column penalty_no_vote numeric(14,0) not null default 50000 check (penalty_no_vote >= 0),
  add column no_vote_effective_from timestamptz not null default now();

-- Reconstruct status at a match from the existing immutable audit trail.
-- Resuming activity must not create a fine for a match during a leave.
create function public.member_status_at(p_member_id uuid, p_at timestamptz) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select a.after->>'status' from public.audit_logs a
     where a.entity = 'members' and a.entity_id = p_member_id::text and a.created_at <= p_at
       and a.after ? 'status'
     order by a.created_at desc, (a.after->>'version')::int desc limit 1),
    (select a.before->>'status' from public.audit_logs a
     where a.entity = 'members' and a.entity_id = p_member_id::text and a.created_at > p_at
       and a.before ? 'status'
     order by a.created_at, (a.before->>'version')::int limit 1), m.status)
  from public.members m where m.id = p_member_id and m.created_at <= p_at
$$;

create function public.expected_match_penalties(p_match_id uuid)
returns table(member_id uuid, amount numeric, reason text)
language sql stable security definer set search_path = '' as $$
  -- Existing absence rule: a confirmed yes followed by recorded absence.
  select p.member_id, t.penalty_absent, 'Xác nhận tham gia nhưng vắng mặt'::text
  from public.matches mt cross join public.team_settings t
  join public.match_participations p on p.match_id = mt.id
  join public.match_rsvps r on r.match_id = mt.id and r.member_id = p.member_id
  where mt.id = p_match_id and mt.status <> 'cancelled' and t.penalty_absent > 0
    and p.actual_status = 'absent' and r.response = 'yes'
    and r.accepted_schedule_version = mt.schedule_version
  union all
  -- Missing vote: decided when the match is completed, never by fee type.
  select m.id, t.penalty_no_vote, 'Không vote xác nhận tham gia'::text
  from public.matches mt cross join public.team_settings t cross join public.members m
  left join public.match_rsvps r on r.match_id = mt.id and r.member_id = m.id
  where mt.id = p_match_id and mt.status = 'completed' and mt.starts_at <= now()
    and mt.rsvp_deadline >= t.no_vote_effective_from and t.penalty_no_vote > 0
    and m.joined_on <= (mt.rsvp_deadline at time zone 'Asia/Ho_Chi_Minh')::date
    and public.member_status_at(m.id, mt.rsvp_deadline) = 'active'
    and public.member_status_at(m.id, mt.starts_at) = 'active'
    and not exists (
      select 1 from public.audit_logs a where a.entity = 'members' and a.entity_id = m.id::text
        and a.created_at between mt.rsvp_deadline and mt.starts_at
        and a.after->>'status' in ('paused', 'left', 'archived'))
    and (r.member_id is null or r.response = 'no_response' or r.accepted_schedule_version <> mt.schedule_version)
$$;

create or replace function public.sync_penalties(p_match_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- Serialize retries on the same match and retain the one-fine-per-match invariant.
  perform 1 from public.matches where id = p_match_id for update;
  insert into public.penalties as pe (match_id, member_id, amount, reason)
  select p_match_id, e.member_id, e.amount, e.reason from public.expected_match_penalties(p_match_id) e
  on conflict (match_id, member_id) do update
    set status = 'unpaid',
        amount = case when pe.status = 'cancelled' or pe.reason is distinct from excluded.reason then excluded.amount else pe.amount end,
        reason = excluded.reason
    where pe.status in ('unpaid', 'cancelled');

  update public.penalties pe set status = 'cancelled'
  where pe.match_id = p_match_id and pe.status = 'unpaid'
    and not exists (select 1 from public.expected_match_penalties(p_match_id) e where e.member_id = pe.member_id);
end $$;

-- Append only the public fine amount; audit history remains admin-only.
create or replace view public.pub_team as
select team_name, tagline, monthly_fee, fee_student, fee_maintain, penalty_absent, due_day, collect_start_day,
  bank_name, bank_account_no, bank_account_name, transfer_note_template, default_formation,
  rsvp_hours_before, expense_categories, income_categories, updated_at, penalty_no_vote
from public.team_settings;

revoke all on function public.member_status_at(uuid, timestamptz), public.expected_match_penalties(uuid)
  from public, anon, authenticated;
