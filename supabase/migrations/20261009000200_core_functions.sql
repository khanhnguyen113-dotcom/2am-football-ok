-- 2AM FC — helpers, triggers (audit, versioning, immutability, invalidation, notifications).

-- ───────────────────────── Identity & request context ─────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admin_settings where admin_user_id = (select auth.uid()))
$$;

create or replace function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists (select 1 from public.admin_settings where admin_user_id = v_uid) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  return v_uid;
end $$;

create or replace function public.set_ctx(p_actor text, p_request_id text, p_claimed_member uuid, p_reason text)
returns void language sql set search_path = '' as $$
  select set_config('app.actor', coalesce(p_actor, ''), true),
         set_config('app.request_id', coalesce(left(p_request_id, 80), ''), true),
         set_config('app.claimed_member_id', coalesce(p_claimed_member::text, ''), true),
         set_config('app.reason', coalesce(left(p_reason, 500), ''), true);
$$;

create or replace function public.ctx(k text) returns text
language sql stable set search_path = '' as $$
  select nullif(current_setting('app.' || k, true), '')
$$;

create or replace function public.notify(p_audience text, p_key text, p_kind text, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (audience, event_key, kind, title, body, link)
  values (p_audience, p_key, p_kind, p_title, p_body, p_link)
  on conflict (event_key) do nothing;
$$;

create or replace function public.member_label(p_member_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(m.nickname, m.full_name) || coalesce(' #' || m.shirt_number, '')
  from public.members m where m.id = p_member_id
$$;

create or replace function public.vnd(p numeric) returns text
language sql immutable set search_path = '' as $$
  select replace(to_char(p, 'FM999,999,999,999,990'), ',', '.') || ' ₫'
$$;

-- ───────────────────────── Generic triggers ─────────────────────────
create or replace function public.tg_bump_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.tg_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.tg_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_before jsonb;
  v_after jsonb;
  v_row jsonb;
  v_actor text;
begin
  v_is_admin := v_uid is not null and exists (select 1 from public.admin_settings where admin_user_id = v_uid);
  if tg_op <> 'INSERT' then v_before := to_jsonb(old) - coalesce(tg_argv, '{}'::text[]); end if;
  if tg_op <> 'DELETE' then v_after := to_jsonb(new) - coalesce(tg_argv, '{}'::text[]); end if;
  if tg_op = 'UPDATE' and (v_before - 'updated_at' - 'version') = (v_after - 'updated_at' - 'version') then
    return null;
  end if;
  v_row := coalesce(v_after, v_before);
  v_actor := case when v_is_admin then 'admin' when public.ctx('actor') = 'public' then 'public' else 'system' end;
  insert into public.audit_logs (actor_kind, admin_user_id, claimed_member_id, request_id, action, entity, entity_id, before, after, reason)
  values (
    v_actor,
    case when v_is_admin then v_uid end,
    public.ctx('claimed_member_id')::uuid,
    public.ctx('request_id'),
    lower(tg_op),
    tg_table_name,
    coalesce(v_row->>'id', v_row->>'month',
             concat_ws(':', coalesce(v_row->>'match_id', v_row->>'gathering_id', v_row->>'mission_id', v_row->>'lineup_id', v_row->>'submission_id'), v_row->>'member_id')),
    v_before, v_after, public.ctx('reason'));
  return null;
end $$;

-- Version bump on optimistic-concurrency tables
create trigger members_bump before update on public.members for each row execute function public.tg_bump_version();
create trigger matches_bump before update on public.matches for each row execute function public.tg_bump_version();
create trigger lineups_bump before update on public.lineups for each row execute function public.tg_bump_version();
create trigger reward_events_bump before update on public.reward_events for each row execute function public.tg_bump_version();
create trigger fund_requests_bump before update on public.fund_requests for each row execute function public.tg_bump_version();
create trigger team_settings_touch before update on public.team_settings for each row execute function public.tg_touch();
create trigger mpd_touch before update on public.member_private_details for each row execute function public.tg_touch();

-- Audit (args = keys excluded from before/after snapshots)
create trigger members_audit after insert or update or delete on public.members for each row execute function public.tg_audit();
create trigger member_private_audit after insert or update or delete on public.member_private_details for each row execute function public.tg_audit('phone','birth_date','private_note');
create trigger team_settings_audit after update on public.team_settings for each row execute function public.tg_audit();
create trigger fund_periods_audit after insert or update on public.fund_periods for each row execute function public.tg_audit();
create trigger monthly_dues_audit after insert or update or delete on public.monthly_dues for each row execute function public.tg_audit();
create trigger payment_submissions_audit after insert or update on public.payment_submissions for each row execute function public.tg_audit();
create trigger fund_requests_audit after insert or update on public.fund_requests for each row execute function public.tg_audit();
create trigger fund_ledger_audit after insert on public.fund_ledger for each row execute function public.tg_audit();
create trigger matches_audit after insert or update or delete on public.matches for each row execute function public.tg_audit('opponent_contact');
create trigger match_rsvps_audit after insert or update on public.match_rsvps for each row execute function public.tg_audit('private_note');
create trigger lineups_audit after insert or update on public.lineups for each row execute function public.tg_audit();
create trigger participations_audit after insert or update on public.match_participations for each row execute function public.tg_audit();
create trigger gatherings_audit after insert or update on public.post_match_gatherings for each row execute function public.tg_audit();
create trigger gathering_att_audit after insert or update on public.gathering_attendance for each row execute function public.tg_audit();
create trigger reward_events_audit after insert or update or delete on public.reward_events for each row execute function public.tg_audit('published_snapshot');
create trigger reward_results_audit after insert or update on public.reward_results for each row execute function public.tg_audit();
create trigger reward_payouts_audit after insert or update on public.reward_payouts for each row execute function public.tg_audit();
create trigger penalties_audit after insert or update on public.penalties for each row execute function public.tg_audit();
create trigger donations_audit after insert or update on public.donations for each row execute function public.tg_audit();
create trigger penalties_touch before update on public.penalties for each row execute function public.tg_touch();

-- ───────────────────────── Ledger invariants (INV04, INV12) ─────────────────────────
create or replace function public.tg_ledger_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'LEDGER_IMMUTABLE' using errcode = '42501';
end $$;
create trigger fund_ledger_no_update before update or delete on public.fund_ledger
  for each row execute function public.tg_ledger_immutable();

create or replace function public.tg_ledger_period_open() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from public.fund_periods p where p.month = to_char(new.posting_date, 'YYYY-MM') and p.status = 'closed') then
    raise exception 'PERIOD_CLOSED' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.fund_periods p where p.status = 'closed' and p.month > to_char(new.posting_date, 'YYYY-MM')) then
    raise exception 'PERIOD_CLOSED' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger fund_ledger_period_check before insert on public.fund_ledger
  for each row execute function public.tg_ledger_period_open();

create or replace function public.tg_period_locked() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status = 'closed' then
    raise exception 'PERIOD_CLOSED' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger fund_periods_locked before update or delete on public.fund_periods
  for each row execute function public.tg_period_locked();

-- ───────────────────────── Members: name history & lineup invalidation ─────────────────────────
create or replace function public.tg_member_after_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_is_admin boolean;
begin
  v_is_admin := v_uid is not null and exists (select 1 from public.admin_settings where admin_user_id = v_uid);
  if new.full_name is distinct from old.full_name or new.nickname is distinct from old.nickname then
    insert into public.member_name_history (member_id, old_full_name, new_full_name, old_nickname, new_nickname, actor_kind, admin_user_id, request_id)
    values (new.id, old.full_name, new.full_name, old.nickname, new.nickname,
            case when v_is_admin then 'admin' else 'public' end,
            case when v_is_admin then v_uid end, public.ctx('request_id'));
  end if;
  if new.status <> 'active' and old.status = 'active' then
    update public.lineups l set status = 'needs_update', needs_update_reason = 'Cầu thủ ngừng hoạt động: ' || coalesce(new.nickname, new.full_name)
    from public.matches m
    where l.match_id = m.id and l.status = 'published' and not l.auto and m.status = 'published' and m.starts_at > now()
      and exists (select 1 from public.lineup_slots s where s.lineup_id = l.id and s.member_id = new.id);
  end if;
  return null;
end $$;
create trigger members_after_update after update on public.members
  for each row execute function public.tg_member_after_update();

-- ───────────────────────── Matches: schedule versioning & notifications ─────────────────────────
create or replace function public.tg_match_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status in ('published','postponed') and (
       new.starts_at is distinct from old.starts_at
    or new.venue_name is distinct from old.venue_name
    or new.address is distinct from old.address
    or new.pitch_no is distinct from old.pitch_no) then
    new.schedule_version := old.schedule_version + 1;
  else
    new.schedule_version := old.schedule_version;
  end if;
  return new;
end $$;
create trigger matches_schedule before update on public.matches
  for each row execute function public.tg_match_before_update();

create or replace function public.tg_match_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_label text := 'vs ' || new.opponent || ' — ' || to_char(new.starts_at at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM');
        v_link text := '/matches/' || new.id;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status = 'draft') then
    perform public.notify('public', 'match_published:' || new.id, 'match', 'Trận mới ' || v_label, 'Hãy xác nhận đi đá và liên hoan trước hạn.', v_link);
  end if;
  -- keep the auto lineup in sync with schedule/status changes (defined in admin_commands)
  if new.status = 'published' and (tg_op = 'INSERT' or new.schedule_version <> old.schedule_version or old.status <> 'published') then
    perform public.auto_lineup(new.id);
  end if;
  if tg_op = 'UPDATE' then
    if new.schedule_version > old.schedule_version then
      perform public.notify('public', 'match_resched:' || new.id || ':' || new.schedule_version, 'match',
        'Đổi lịch ' || v_label, 'Lịch/sân đã thay đổi. Mọi người cần xác nhận lại.', v_link);
      update public.lineups set status = 'needs_update', needs_update_reason = 'Trận đổi lịch/sân — cần xác nhận lại'
       where match_id = new.id and status = 'published' and not auto;
    end if;
    if new.status <> old.status then
      if new.status = 'postponed' then
        perform public.notify('public', 'match_postponed:' || new.id || ':' || new.version, 'match', 'Hoãn trận ' || v_label, null, v_link);
      elsif new.status = 'cancelled' then
        perform public.notify('public', 'match_cancelled:' || new.id, 'match', 'Hủy trận ' || v_label, null, v_link);
      elsif new.status = 'completed' then
        perform public.notify('public', 'match_completed:' || new.id, 'match',
          'Kết quả ' || v_label || coalesce(': ' || new.score_us || ' - ' || new.score_them, ''), null, v_link);
      elsif new.status = 'published' and old.status = 'postponed' then
        perform public.notify('public', 'match_republished:' || new.id || ':' || new.version, 'match', 'Lịch mới ' || v_label, 'Hãy xác nhận lại.', v_link);
      end if;
    end if;
  end if;
  return null;
end $$;
create trigger matches_after_write after insert or update on public.matches
  for each row execute function public.tg_match_after_write();

-- ───────────────────────── RSVP: history & lineup invalidation (INV09) ─────────────────────────
create or replace function public.tg_rsvp_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_sched int; v_lineup public.lineups;
begin
  select schedule_version into v_sched from public.matches where id = new.match_id;
  insert into public.match_rsvp_history (match_id, member_id, response, gathering_response, position_code, schedule_version, actor_kind, admin_user_id, request_id)
  values (new.match_id, new.member_id, new.response, new.gathering_response, new.position_code, new.accepted_schedule_version, new.actor_kind, new.admin_user_id, new.request_id);

  if new.response <> 'yes' or new.accepted_schedule_version < v_sched then
    select * into v_lineup from public.lineups where match_id = new.match_id;
    if found and v_lineup.status = 'published' and not v_lineup.auto
       and exists (select 1 from public.lineup_slots s where s.lineup_id = v_lineup.id and s.member_id = new.member_id) then
      update public.lineups set status = 'needs_update',
        needs_update_reason = public.member_label(new.member_id) || ' đổi xác nhận sang "' ||
          case new.response when 'no' then 'Không tham gia' else 'Chưa phản hồi' end || '"'
       where id = v_lineup.id;
      perform public.notify('admin', 'lineup_nu:' || v_lineup.id || ':' || v_lineup.version, 'lineup',
        'Đội hình cần cập nhật', public.member_label(new.member_id) || ' không còn xác nhận tham gia.', '/admin/matches/' || new.match_id);
    end if;
  end if;
  return null;
end $$;
create trigger match_rsvps_after_write after insert or update on public.match_rsvps
  for each row execute function public.tg_rsvp_after_write();

-- ───────────────────────── Other notifications ─────────────────────────
create or replace function public.tg_notify_misc() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'fund_periods' and tg_op = 'INSERT' then
    perform public.notify('public', 'period_open:' || new.month, 'fund', 'Mở kỳ quỹ ' || new.month,
      'Mức đóng ' || public.vnd(new.fee_amount) || ', hạn ' || to_char(new.due_date, 'DD/MM/YYYY') || '.', '/funds');
  elsif tg_table_name = 'payment_submissions' and tg_op = 'INSERT' then
    perform public.notify('admin', 'payment_sub:' || new.group_ref, 'fund', 'Biên lai chờ duyệt ' || new.group_ref,
      public.member_label(new.member_id) || ' — ' || public.vnd(new.amount), '/admin/funds?tab=receipts');
  elsif tg_table_name = 'donations' and tg_op = 'INSERT' then
    perform public.notify('admin', 'donation:' || new.id, 'fund', 'Ủng hộ chờ xác nhận ' || new.reference,
      coalesce(new.donor_name, 'Ẩn danh') || ' — ' || public.vnd(new.amount), '/admin/funds?tab=receipts');
  end if;
  return null;
end $$;
create trigger fund_periods_notify after insert on public.fund_periods for each row execute function public.tg_notify_misc();
create trigger payment_submissions_notify after insert on public.payment_submissions for each row execute function public.tg_notify_misc();
create trigger donations_notify after insert on public.donations for each row execute function public.tg_notify_misc();

-- ───────────────────────── Fund helpers ─────────────────────────
-- Monthly fee by member type (configurable in team_settings): standard / student (HSSV) / maintain (duy trì) / exempt (miễn).
create or replace function public.member_fee(p_member_id uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case m.fee_type when 'standard' then t.monthly_fee when 'student' then t.fee_student
                         when 'maintain' then t.fee_maintain else 0 end::numeric(14,0)
  from public.members m cross join public.team_settings t where m.id = p_member_id
$$;

-- Absence penalties for a match: RSVP "yes" (current schedule) + recorded absent ⇒ penalty; otherwise an unpaid one is cancelled.
create or replace function public.sync_penalties(p_match_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_amount numeric; v_sched int;
begin
  select penalty_absent into v_amount from public.team_settings;
  select schedule_version into v_sched from public.matches where id = p_match_id and status <> 'cancelled';
  if not found then
    update public.penalties set status = 'cancelled' where match_id = p_match_id and status = 'unpaid';
    return;
  end if;
  insert into public.penalties (match_id, member_id, amount)
  select p.match_id, p.member_id, v_amount
  from public.match_participations p
  join public.match_rsvps r on r.match_id = p.match_id and r.member_id = p.member_id
  where p.match_id = p_match_id and p.actual_status = 'absent' and r.response = 'yes' and r.accepted_schedule_version = v_sched
    and v_amount > 0
  on conflict (match_id, member_id) do update set status = 'unpaid', amount = excluded.amount
    where public.penalties.status = 'cancelled';
  update public.penalties pe set status = 'cancelled'
  where pe.match_id = p_match_id and pe.status = 'unpaid'
    and not exists (select 1 from public.match_participations p join public.match_rsvps r on r.match_id = p.match_id and r.member_id = p.member_id
                    where p.match_id = pe.match_id and p.member_id = pe.member_id and p.actual_status = 'absent'
                      and r.response = 'yes' and r.accepted_schedule_version = v_sched);
end $$;

create or replace function public.fund_balance() returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case direction when 'in' then amount else -amount end), 0)::numeric(14,0) from public.fund_ledger
$$;

create or replace function public.fund_committed() returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(amount), 0)::numeric(14,0) from public.fund_requests where kind = 'expense' and status = 'approved'
$$;

create or replace function public.formation_slots(p_formation text) returns text[]
language plpgsql immutable set search_path = '' as $$
declare d int := split_part(p_formation, '-', 1)::int; m int := split_part(p_formation, '-', 2)::int; f int := split_part(p_formation, '-', 3)::int;
        r text[] := array['GK'];
begin
  for i in 1..d loop r := r || ('DEF' || i); end loop;
  for i in 1..m loop r := r || ('MID' || i); end loop;
  for i in 1..f loop r := r || ('FWD' || i); end loop;
  return r;
end $$;

-- Validate an uploaded object matches its pending asset (MIME/size from Storage metadata).
create or replace function public.claim_uploaded_asset(p_asset_id uuid, p_purpose text, p_actor text) returns public.file_assets
language plpgsql security definer set search_path = '' as $$
declare a public.file_assets; o record;
begin
  select * into a from public.file_assets where id = p_asset_id for update;
  if not found or a.purpose <> p_purpose or a.status <> 'pending' or a.actor_kind <> p_actor then
    raise exception 'FILE_INVALID' using errcode = 'P0001';
  end if;
  select metadata into o from storage.objects where bucket_id = a.bucket and name = a.object_path;
  if not found then
    raise exception 'FILE_NOT_UPLOADED' using errcode = 'P0001';
  end if;
  if (o.metadata->>'mimetype') is distinct from a.mime or (o.metadata->>'size')::int is distinct from a.size_bytes then
    raise exception 'FILE_INVALID' using errcode = 'P0001';
  end if;
  update public.file_assets set status = 'ready' where id = a.id returning * into a;
  return a;
end $$;

create or replace function public.storage_can_insert(p_bucket text, p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.file_assets
    where bucket = p_bucket and object_path = p_name and status = 'pending'
      and created_at > now() - interval '15 minutes'
      and (actor_kind = 'public' or public.is_admin())
  )
$$;
