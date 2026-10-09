-- 2AM FC — public (no-login) commands. Each is a whitelisted SECURITY DEFINER function:
-- only the listed fields can change, inputs are validated, actor is recorded as 'public'.

create or replace function public.clean_text(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(btrim(regexp_replace(coalesce(p, ''), '[[:space:]]+', ' ', 'g')), '')
$$;

-- AT01 / AT29 (+ owner request v2): anyone may edit any member's name, nickname and preferred positions.
-- Photo is a separate command. Shirt number, status, dues, private data stay admin-only.
create or replace function public.update_public_member_profile(
  p_member_id uuid, p_full_name text, p_nickname text, p_positions text[], p_primary text,
  p_expected_version int, p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  m public.members;
  v_full text := public.clean_text(p_full_name);
  v_nick text := public.clean_text(p_nickname);
  v_pos text[];
  v_primary text := nullif(p_primary, '');
  v_old text[];
begin
  if v_full is null or char_length(v_full) not between 2 and 80 or v_full ~ '[[:cntrl:]]' then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;
  if v_nick is not null and (char_length(v_nick) not between 2 and 80 or v_nick ~ '[[:cntrl:]]') then
    raise exception 'INVALID_NICKNAME' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_pos from unnest(coalesce(p_positions, '{}')) x where x <> '';
  if cardinality(v_pos) = 0 or cardinality(v_pos) > 5
     or exists (select 1 from unnest(v_pos) x where not exists (select 1 from public.positions p where p.code = x)) then
    raise exception 'INVALID_POSITION' using errcode = 'P0001';
  end if;
  if v_primary is null or not (v_primary = any(v_pos)) then
    select x into v_primary from unnest(v_pos) x join public.positions p on p.code = x order by p.sort limit 1;
  end if;
  perform public.set_ctx('public', p_request_id, p_member_id, null);

  select * into m from public.members where id = p_member_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if m.status = 'archived' then raise exception 'MEMBER_INACTIVE' using errcode = 'P0001'; end if;
  if m.version <> p_expected_version then raise exception 'CONFLICT' using errcode = 'P0001'; end if;

  -- anti-spam only (does not change who may edit)
  if (select count(*) from public.audit_logs where actor_kind = 'public' and entity = 'members'
        and entity_id = p_member_id::text and created_at > now() - interval '1 minute') >= 5
     or (select count(*) from public.audit_logs where actor_kind = 'public' and created_at > now() - interval '1 minute') >= 120 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(position_code || case when is_primary then '*' else '' end order by position_code), '{}')
    into v_old from public.member_positions where member_id = p_member_id;
  -- always bump version (also when only positions change) so concurrent editors get CONFLICT
  update public.members set full_name = v_full, nickname = v_nick where id = p_member_id returning * into m;

  if v_old is distinct from (select array_agg(x || case when x = v_primary then '*' else '' end order by x) from unnest(v_pos) x) then
    delete from public.member_positions where member_id = p_member_id;
    insert into public.member_positions (member_id, position_code, is_primary)
    select p_member_id, x, x = v_primary from unnest(v_pos) x;
    insert into public.audit_logs (actor_kind, claimed_member_id, request_id, action, entity, entity_id, before, after)
    values ('public', p_member_id, p_request_id, 'update_positions', 'member_positions', p_member_id::text,
            to_jsonb(v_old), (select to_jsonb(array_agg(x || case when x = v_primary then '*' else '' end order by x)) from unnest(v_pos) x));
    perform public.refresh_auto_lineups();
  end if;
  return jsonb_build_object('version', m.version);
end $$;

-- Reserve a pending object path for a guest upload (receipt / member photo).
create or replace function public.begin_public_upload(p_purpose text, p_mime text, p_size int, p_sha256 text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_bucket text; v_ext text; v_path text; v_id uuid; v_max int;
begin
  if p_purpose = 'receipt' then v_bucket := 'receipts'; v_max := 10;
  elsif p_purpose = 'avatar' then v_bucket := 'avatars'; v_max := 5;
  else raise exception 'FILE_INVALID' using errcode = 'P0001'; end if;
  v_ext := case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' end;
  if v_ext is null then raise exception 'FILE_TYPE' using errcode = 'P0001'; end if;
  if p_size is null or p_size <= 0 or p_size > v_max * 1024 * 1024 then raise exception 'FILE_TOO_LARGE' using errcode = 'P0001'; end if;
  if p_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'FILE_INVALID' using errcode = 'P0001'; end if;
  if (select count(*) from public.file_assets where actor_kind = 'public' and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  v_path := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY/MM') || '/' || gen_random_uuid() || '.' || v_ext;
  insert into public.file_assets (bucket, object_path, purpose, mime, size_bytes, sha256, actor_kind)
  values (v_bucket, v_path, p_purpose, p_mime, p_size, p_sha256, 'public') returning id into v_id;
  return jsonb_build_object('asset_id', v_id, 'bucket', v_bucket, 'path', v_path);
end $$;

create or replace function public.set_public_member_avatar(p_member_id uuid, p_asset_id uuid, p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m public.members; a public.file_assets;
begin
  select * into m from public.members where id = p_member_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if m.status = 'archived' then raise exception 'MEMBER_INACTIVE' using errcode = 'P0001'; end if;
  perform public.set_ctx('public', p_request_id, p_member_id, 'Cập nhật ảnh đại diện');
  a := public.claim_uploaded_asset(p_asset_id, 'avatar', 'public');
  update public.members set avatar_path = a.object_path where id = p_member_id returning * into m;
  return jsonb_build_object('avatar_path', a.object_path, 'version', m.version);
end $$;

-- AT03 / AT26 (+ v2/v3): one bank transfer may pay several months (past debt, current, up to 6 months ahead)
-- and/or unpaid absence penalties. One pending submission per item, sharing the receipt and group reference.
-- Monthly amount follows the member type (standard / HSSV / duy trì / miễn). Money is never added here.
create or replace function public.submit_public_payment(
  p_member_id uuid, p_months text[], p_penalty_ids uuid[], p_amount numeric, p_transferred_at timestamptz,
  p_receipt_asset_id uuid, p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_member public.members;
  v_period public.fund_periods;
  v_due public.monthly_dues;
  v_pen public.penalties;
  v_asset public.file_assets;
  v_months text[];
  v_pens uuid[];
  v_m text;
  v_p uuid;
  v_cur text := public.month_of(public.vn_today());
  v_max text := public.month_of((public.vn_today() + interval '6 months')::date);
  v_due_day int;
  v_fee numeric;
  v_due_ids uuid[] := '{}';
  v_total numeric := 0;
  v_group text;
  v_flags text[] := '{}';
  v_existing text;
begin
  if p_request_id is null or p_request_id !~ '^[A-Za-z0-9-]{8,80}$' then raise exception 'INVALID_REQUEST' using errcode = 'P0001'; end if;
  select group_ref into v_existing from public.payment_submissions where request_id like p_request_id || ':%' limit 1;
  if v_existing is not null then
    return jsonb_build_object('reference', v_existing, 'duplicate', true);
  end if;

  select coalesce(array_agg(distinct x order by x), '{}') into v_months from unnest(coalesce(p_months, '{}')) x;
  select coalesce(array_agg(distinct x), '{}') into v_pens from unnest(coalesce(p_penalty_ids, '{}')) x;
  if cardinality(v_months) + cardinality(v_pens) = 0 then raise exception 'NO_MONTHS' using errcode = 'P0001'; end if;
  if cardinality(v_months) > 12 or cardinality(v_pens) > 20 then raise exception 'TOO_MANY_MONTHS' using errcode = 'P0001'; end if;
  if p_transferred_at is null or p_transferred_at > now() + interval '1 day' then raise exception 'INVALID_DATE' using errcode = 'P0001'; end if;

  select * into v_member from public.members where id = p_member_id;
  if not found or v_member.status not in ('active','paused') then raise exception 'MEMBER_INACTIVE' using errcode = 'P0001'; end if;
  if (select count(*) from public.payment_submissions where actor_kind = 'public' and created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  perform public.set_ctx('public', p_request_id, p_member_id, null);
  select due_day into v_due_day from public.team_settings;
  v_fee := public.member_fee(p_member_id);

  foreach v_m in array v_months loop
    if v_m !~ '^\d{4}-(0[1-9]|1[0-2])$' or v_m > v_max then
      raise exception 'MONTH_NOT_ALLOWED' using errcode = 'P0001', detail = v_m;
    end if;
    select * into v_due from public.monthly_dues where member_id = p_member_id and obligation_month = v_m for update;
    if not found then
      -- past months need an existing obligation; current/future months are opened on demand (prepayment)
      if v_m < v_cur or v_member.status <> 'active' or v_m < public.month_of(v_member.joined_on) then
        raise exception 'NO_OBLIGATION' using errcode = 'P0001', detail = v_m;
      end if;
      if v_fee = 0 then raise exception 'EXEMPT' using errcode = 'P0001', detail = v_m; end if;
      insert into public.fund_periods (month, due_date, fee_amount)
      select v_m, make_date(split_part(v_m, '-', 1)::int, split_part(v_m, '-', 2)::int, v_due_day), t.monthly_fee
      from public.team_settings t
      on conflict (month) do nothing;
      select * into v_period from public.fund_periods where month = v_m;
      if v_period.status = 'closed' then raise exception 'PERIOD_CLOSED' using errcode = 'P0001'; end if;
      insert into public.monthly_dues (member_id, obligation_month, amount_snapshot, amount_due, fee_type, due_date)
      values (p_member_id, v_m, v_fee, v_fee, v_member.fee_type, v_period.due_date)
      on conflict (member_id, obligation_month) do nothing;
      select * into v_due from public.monthly_dues where member_id = p_member_id and obligation_month = v_m for update;
    end if;
    if v_due.amount_due = 0 then raise exception 'EXEMPT' using errcode = 'P0001', detail = v_m; end if;
    if exists (select 1 from public.payment_submissions where due_id = v_due.id and status in ('pending','approved')) then
      raise exception 'ALREADY_SUBMITTED' using errcode = 'P0001', detail = v_m;
    end if;
    v_total := v_total + v_due.amount_due;
    v_due_ids := v_due_ids || v_due.id;
  end loop;

  foreach v_p in array v_pens loop
    select * into v_pen from public.penalties where id = v_p and member_id = p_member_id for update;
    if not found or v_pen.status <> 'unpaid' then raise exception 'PENALTY_NOT_PAYABLE' using errcode = 'P0001'; end if;
    if exists (select 1 from public.payment_submissions where penalty_id = v_p and status in ('pending','approved')) then
      raise exception 'ALREADY_SUBMITTED' using errcode = 'P0001', detail = 'tiền phạt';
    end if;
    v_total := v_total + v_pen.amount;
  end loop;

  if p_amount is distinct from v_total then
    raise exception 'AMOUNT_MISMATCH' using errcode = 'P0001', detail = public.vnd(v_total);
  end if;

  v_asset := public.claim_uploaded_asset(p_receipt_asset_id, 'receipt', 'public');
  if exists (select 1 from public.file_assets where sha256 = v_asset.sha256 and id <> v_asset.id and status = 'ready') then
    v_flags := v_flags || 'file_hash';
  end if;

  v_group := 'NQ-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  insert into public.payment_submissions (group_ref, due_id, member_id, amount, transferred_at, method,
    receipt_asset_id, duplicate_flags, actor_kind, request_id)
  select v_group, d.id, p_member_id, d.amount_due, p_transferred_at, 'bank', v_asset.id, v_flags, 'public',
         p_request_id || ':' || d.obligation_month
  from public.monthly_dues d where d.id = any(v_due_ids);
  insert into public.payment_submissions (group_ref, penalty_id, member_id, amount, transferred_at, method,
    receipt_asset_id, duplicate_flags, actor_kind, request_id)
  select v_group, pe.id, p_member_id, pe.amount, p_transferred_at, 'bank', v_asset.id, v_flags, 'public',
         p_request_id || ':p:' || pe.id
  from public.penalties pe where pe.id = any(v_pens) and pe.amount > 0;

  return jsonb_build_object('reference', v_group, 'months', to_jsonb(v_months), 'penalties', cardinality(v_pens),
    'total', v_total, 'status', 'pending');
end $$;

-- Donation (ủng hộ) from anyone, optional name/message shown publicly once the admin confirms the money.
create or replace function public.submit_public_donation(
  p_donor_name text, p_anonymous boolean, p_amount numeric, p_message text, p_transferred_at timestamptz,
  p_receipt_asset_id uuid, p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_name text := public.clean_text(p_donor_name); v_msg text := public.clean_text(p_message); d public.donations; v_asset public.file_assets;
begin
  if p_request_id is null or p_request_id !~ '^[A-Za-z0-9-]{8,80}$' then raise exception 'INVALID_REQUEST' using errcode = 'P0001'; end if;
  select * into d from public.donations where request_id = p_request_id;
  if found then return jsonb_build_object('reference', d.reference, 'duplicate', true); end if;
  if not coalesce(p_anonymous, false) and (v_name is null or char_length(v_name) not between 2 and 80) then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;
  if v_name is not null and char_length(v_name) > 80 then raise exception 'INVALID_NAME' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount < 1000 or p_amount > 100000000 or p_amount <> trunc(p_amount) then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;
  if v_msg is not null and char_length(v_msg) > 200 then raise exception 'NOTE_TOO_LONG' using errcode = 'P0001'; end if;
  if p_transferred_at is null or p_transferred_at > now() + interval '1 day' then raise exception 'INVALID_DATE' using errcode = 'P0001'; end if;
  if (select count(*) from public.donations where created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  perform public.set_ctx('public', p_request_id, null, null);
  v_asset := public.claim_uploaded_asset(p_receipt_asset_id, 'receipt', 'public');
  insert into public.donations (donor_name, anonymous, amount, message, transferred_at, receipt_asset_id, request_id)
  values (v_name, coalesce(p_anonymous, false), p_amount, v_msg, p_transferred_at, v_asset.id, p_request_id)
  returning * into d;
  return jsonb_build_object('reference', d.reference, 'status', d.status);
end $$;
-- AT26 (+ v2): guest RSVP for match and gathering, with the position the player wants to play.
create or replace function public.set_public_rsvp(
  p_match_id uuid, p_member_id uuid, p_response text, p_gathering_response text, p_position_code text,
  p_note text, p_request_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_match public.matches; v_member public.members; v_pos text := nullif(p_position_code, '');
begin
  if p_response not in ('yes','no') or p_gathering_response not in ('yes','no','no_response') then
    raise exception 'INVALID_RESPONSE' using errcode = 'P0001';
  end if;
  if p_response = 'yes' and v_pos is null then raise exception 'POSITION_REQUIRED' using errcode = 'P0001'; end if;
  if v_pos is not null and not exists (select 1 from public.positions where code = v_pos) then
    raise exception 'INVALID_POSITION' using errcode = 'P0001';
  end if;
  if p_note is not null and char_length(p_note) > 300 then raise exception 'NOTE_TOO_LONG' using errcode = 'P0001'; end if;
  select * into v_match from public.matches where id = p_match_id;
  if not found or v_match.status <> 'published' then raise exception 'MATCH_NOT_OPEN' using errcode = 'P0001'; end if;
  if now() > v_match.rsvp_deadline then raise exception 'RSVP_CLOSED' using errcode = 'P0001'; end if;
  select * into v_member from public.members where id = p_member_id;
  if not found or v_member.status <> 'active' then raise exception 'MEMBER_INACTIVE' using errcode = 'P0001'; end if;
  if (select count(*) from public.match_rsvp_history where actor_kind = 'public' and created_at > now() - interval '1 minute') >= 60 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
  perform public.set_ctx('public', p_request_id, p_member_id, null);

  insert into public.match_rsvps as r (match_id, member_id, response, gathering_response, position_code, accepted_schedule_version,
    private_note, actor_kind, admin_user_id, request_id, changed_at)
  values (p_match_id, p_member_id, p_response, p_gathering_response, v_pos, v_match.schedule_version,
    public.clean_text(p_note), 'public', null, p_request_id, now())
  on conflict (match_id, member_id) do update set
    response = excluded.response, gathering_response = excluded.gathering_response, position_code = excluded.position_code,
    accepted_schedule_version = excluded.accepted_schedule_version,
    private_note = coalesce(excluded.private_note, r.private_note),
    actor_kind = 'public', admin_user_id = null, request_id = excluded.request_id, changed_at = now();

  perform public.auto_lineup(p_match_id);
  return jsonb_build_object('ok', true, 'schedule_version', v_match.schedule_version);
end $$;
