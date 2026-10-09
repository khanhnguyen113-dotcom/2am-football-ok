-- 2AM FC — admin commands. Every function starts with require_admin() (admin user ID check, AT27).
-- Multi-table financial operations run inside one function = one transaction, with row locks.

-- ───────────────────────── M01 Members ─────────────────────────
create or replace function public.admin_save_member(
  p_id uuid, p_data jsonb, p_positions text[], p_primary text, p_expected_version int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); m public.members; v_id uuid;
begin
  perform public.set_ctx('admin', null, null, p_data->>'reason');
  if p_primary is not null and not (p_primary = any(coalesce(p_positions, '{}'))) then
    p_positions := coalesce(p_positions, '{}') || p_primary;
  end if;
  if p_id is null then
    insert into public.members (full_name, nickname, avatar_path, shirt_number, preferred_foot, joined_on, status, fee_type)
    values (public.clean_text(p_data->>'full_name'), public.clean_text(p_data->>'nickname'), p_data->>'avatar_path',
            nullif(p_data->>'shirt_number', '')::int, coalesce(p_data->>'preferred_foot', 'unknown'),
            coalesce(nullif(p_data->>'joined_on', '')::date, public.vn_today()), coalesce(p_data->>'status', 'active'),
            coalesce(nullif(p_data->>'fee_type', ''), 'standard'))
    returning id into v_id;
  else
    select * into m from public.members where id = p_id for update;
    if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
    if m.version <> p_expected_version then raise exception 'CONFLICT' using errcode = 'P0001'; end if;
    update public.members set
      full_name = public.clean_text(p_data->>'full_name'),
      nickname = public.clean_text(p_data->>'nickname'),
      avatar_path = case when p_data ? 'avatar_path' then p_data->>'avatar_path' else avatar_path end,
      shirt_number = nullif(p_data->>'shirt_number', '')::int,
      preferred_foot = coalesce(p_data->>'preferred_foot', 'unknown'),
      joined_on = coalesce(nullif(p_data->>'joined_on', '')::date, joined_on),
      left_on = nullif(p_data->>'left_on', '')::date,
      status = coalesce(p_data->>'status', status),
      fee_type = coalesce(nullif(p_data->>'fee_type', ''), fee_type)
    where id = p_id;
    v_id := p_id;
  end if;

  delete from public.member_positions where member_id = v_id;
  insert into public.member_positions (member_id, position_code, is_primary)
  select v_id, code, code = p_primary from unnest(coalesce(p_positions, '{}')) as code group by code;

  insert into public.member_private_details (member_id, birth_date, phone, private_note)
  values (v_id, nullif(p_data->>'birth_date', '')::date, public.clean_text(p_data->>'phone'), public.clean_text(p_data->>'private_note'))
  on conflict (member_id) do update set birth_date = excluded.birth_date, phone = excluded.phone, private_note = excluded.private_note;
  perform public.refresh_auto_lineups();
  return v_id;
exception when unique_violation then
  raise exception 'SHIRT_TAKEN' using errcode = 'P0001';
end $$;

create or replace function public.admin_delete_member(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin();
begin
  perform public.set_ctx('admin', null, null, 'Xóa hồ sơ tạo nhầm');
  delete from public.member_positions where member_id = p_id;
  delete from public.member_private_details where member_id = p_id;
  delete from public.member_name_history where member_id = p_id;
  delete from public.members where id = p_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
exception when foreign_key_violation then
  raise exception 'HAS_RELATED_DATA' using errcode = 'P0001';
end $$;

create or replace function public.admin_restore_member_name(p_history_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); h public.member_name_history;
begin
  select * into h from public.member_name_history where id = p_history_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', null, null, 'Khôi phục tên cũ');
  update public.members set full_name = h.old_full_name, nickname = h.old_nickname where id = h.member_id;
end $$;

-- ───────────────────────── M02 Periods & dues ─────────────────────────
create or replace function public.admin_create_period(p_month text, p_due_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); v_fee numeric;
begin
  select monthly_fee into v_fee from public.team_settings;
  perform public.set_ctx('admin', null, null, null);
  insert into public.fund_periods (month, due_date, fee_amount) values (p_month, p_due_date, v_fee);
exception when unique_violation then
  raise exception 'PERIOD_EXISTS' using errcode = 'P0001';
end $$;

-- AT06: generating twice never duplicates nor changes the snapshot.
create or replace function public.admin_generate_dues(p_month text, p_member_ids uuid[]) returns int
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); p public.fund_periods; v_count int;
begin
  select * into p from public.fund_periods where month = p_month;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p.status = 'closed' then raise exception 'PERIOD_CLOSED' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', null, null, 'Sinh nghĩa vụ ' || p_month);
  -- amount follows each member's type (standard / HSSV / duy trì / miễn = 0)
  insert into public.monthly_dues (member_id, obligation_month, amount_snapshot, amount_due, fee_type, due_date)
  select m.id, p.month, public.member_fee(m.id), public.member_fee(m.id), m.fee_type, p.due_date
  from public.members m where m.id = any(p_member_ids)
  on conflict (member_id, obligation_month) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function public.admin_adjust_due(p_due_id uuid, p_amount_due numeric, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); d public.monthly_dues;
begin
  if public.clean_text(p_reason) is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select * into d from public.monthly_dues where id = p_due_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p_amount_due < 0 or p_amount_due > d.amount_snapshot then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  if exists (select 1 from public.payment_submissions where due_id = d.id and status in ('pending','approved')) then
    raise exception 'HAS_LIVE_PAYMENT' using errcode = 'P0001';
  end if;
  perform public.set_ctx('admin', null, null, p_reason);
  update public.monthly_dues set amount_due = p_amount_due, adjustment_reason = public.clean_text(p_reason),
    adjusted_by = v_admin, adjusted_at = now() where id = d.id;
end $$;

-- AT04: atomic approval; repeated/concurrent approval returns the existing result, never a 2nd ledger row.
create or replace function public.admin_approve_payment(p_submission_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); s public.payment_submissions; d public.monthly_dues; pe public.penalties;
        v_today date := public.vn_today(); v_occ date; v_note text; v_label text;
begin
  select * into s from public.payment_submissions where id = p_submission_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if s.status = 'approved' then return jsonb_build_object('already', true); end if;
  if s.status <> 'pending' then raise exception 'NOT_PENDING' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.file_assets where id = s.receipt_asset_id and status = 'ready') then
    raise exception 'FILE_INVALID' using errcode = 'P0001';
  end if;
  if s.penalty_id is not null then
    select * into pe from public.penalties where id = s.penalty_id for update;
    if pe.status <> 'unpaid' then raise exception 'PENALTY_NOT_PAYABLE' using errcode = 'P0001'; end if;
    if s.amount <> pe.amount then raise exception 'AMOUNT_MISMATCH' using errcode = 'P0001'; end if;
  else
    select * into d from public.monthly_dues where id = s.due_id for update;
    if s.amount <> d.amount_due then raise exception 'AMOUNT_MISMATCH' using errcode = 'P0001'; end if;
  end if;
  perform public.set_ctx('admin', 'approve:' || s.id, s.member_id, null);

  v_occ := least((s.transferred_at at time zone 'Asia/Ho_Chi_Minh')::date, v_today);
  if exists (select 1 from public.fund_periods where month = public.month_of(v_occ) and status = 'closed') then
    v_note := 'Tiền nhận ngày ' || to_char(v_occ, 'DD/MM/YYYY') || ' thuộc kỳ đã khóa; ghi sổ kỳ hiện tại';
  end if;

  update public.payment_submissions set status = 'approved', reviewed_by = v_admin, reviewed_at = now() where id = s.id;
  if s.penalty_id is not null then
    update public.penalties set status = 'paid' where id = pe.id;
    select 'Tiền phạt vắng mặt trận vs ' || m.opponent || ' ' || to_char(m.starts_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM') || ' — '
      into v_label from public.matches m where m.id = pe.match_id;
    insert into public.fund_ledger (direction, amount, posting_date, occurred_at, category, public_description,
      source_type, source_id, member_id, match_id, period_note, recorded_by)
    values ('in', s.amount, v_today, v_occ, 'Tiền phạt', v_label || public.member_label(s.member_id),
      'payment_submission', s.id, s.member_id, pe.match_id, v_note, v_admin);
  else
    insert into public.fund_ledger (direction, amount, posting_date, occurred_at, category, public_description,
      source_type, source_id, member_id, obligation_month, period_note, recorded_by)
    values ('in', s.amount, v_today, v_occ, 'Quỹ tháng',
      'Quỹ tháng ' || d.obligation_month || ' — ' || public.member_label(s.member_id),
      'payment_submission', s.id, s.member_id, d.obligation_month, v_note, v_admin);
  end if;
  return jsonb_build_object('already', false);
end $$;

create or replace function public.admin_reject_payment(p_submission_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); s public.payment_submissions;
begin
  if public.clean_text(p_reason) is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select * into s from public.payment_submissions where id = p_submission_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if s.status <> 'pending' then raise exception 'NOT_PENDING' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', 'reject:' || s.id, s.member_id, p_reason);
  update public.payment_submissions set status = 'rejected', reject_reason = public.clean_text(p_reason),
    reviewed_by = v_admin, reviewed_at = now() where id = s.id;
end $$;

create or replace function public.admin_withdraw_payment(p_submission_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin();
begin
  perform public.set_ctx('admin', null, null, p_reason);
  update public.payment_submissions set status = 'withdrawn' where id = p_submission_id and status = 'pending';
  if not found then raise exception 'NOT_PENDING' using errcode = 'P0001'; end if;
end $$;

-- ───────────────────────── M03 Ledger ─────────────────────────
create or replace function public.admin_set_opening_balance(p_amount numeric, p_date date) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin();
begin
  if p_amount is null or p_amount < 0 then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fund_ledger where is_opening) then raise exception 'OPENING_EXISTS' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fund_ledger where posting_date < p_date) then raise exception 'OPENING_AFTER_ENTRIES' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', null, null, 'Số dư khởi tạo');
  insert into public.fund_ledger (direction, amount, posting_date, occurred_at, category, public_description,
    source_type, source_id, is_opening, recorded_by)
  values ('in', p_amount, p_date, p_date, 'Số dư đầu', 'Số dư khởi tạo đã xác nhận', 'opening', null, true, v_admin);
end $$;

create or replace function public.admin_create_fund_request(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); v_id uuid; v_status text := coalesce(p->>'status', 'pending');
begin
  if v_status not in ('draft','pending') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', p->>'request_id', null, null);
  insert into public.fund_requests (kind, category, amount, public_description, private_note, counterparty,
    planned_date, method, status, already_spent, match_id, created_by)
  values (p->>'kind', p->>'category', (p->>'amount')::numeric, public.clean_text(p->>'public_description'),
    public.clean_text(p->>'private_note'), public.clean_text(p->>'counterparty'),
    nullif(p->>'planned_date', '')::date, nullif(p->>'method', ''), v_status,
    coalesce((p->>'already_spent')::boolean, false), nullif(p->>'match_id', '')::uuid, v_admin)
  returning id into v_id;
  return v_id;
end $$;

-- approve | reject | cancel | submit. Expense approval keeps available funds ≥ 0 (D07, AT09).
create or replace function public.admin_decide_fund_request(p_id uuid, p_decision text, p_reason text, p_occurred_at date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); r public.fund_requests; v_today date := public.vn_today();
begin
  perform pg_advisory_xact_lock(hashtext('2amfc_fund'));
  select * into r from public.fund_requests where id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', p_decision || ':' || p_id, null, p_reason);

  if p_decision = 'submit' then
    if r.status <> 'draft' then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
    update public.fund_requests set status = 'pending' where id = p_id;
  elsif p_decision = 'approve' then
    if r.status <> 'pending' then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
    if r.kind = 'expense' then
      if public.fund_balance() - public.fund_committed() < r.amount then
        raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
      end if;
      update public.fund_requests set status = 'approved', approved_by = v_admin, approved_at = now() where id = p_id;
    else
      update public.fund_requests set status = 'recorded', approved_by = v_admin, approved_at = now(),
        occurred_at = coalesce(p_occurred_at, v_today) where id = p_id;
      insert into public.fund_ledger (direction, amount, posting_date, occurred_at, category, public_description,
        source_type, source_id, match_id, recorded_by, period_note)
      values ('in', r.amount, v_today, least(coalesce(p_occurred_at, v_today), v_today), r.category, r.public_description,
        'fund_request', r.id, r.match_id, v_admin,
        case when exists (select 1 from public.fund_periods where month = public.month_of(coalesce(p_occurred_at, v_today)) and status = 'closed')
             then 'Phát sinh ' || to_char(p_occurred_at, 'DD/MM/YYYY') || ' thuộc kỳ đã khóa' end);
    end if;
  elsif p_decision = 'reject' then
    if r.status <> 'pending' then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
    if public.clean_text(p_reason) is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update public.fund_requests set status = 'rejected', decision_reason = p_reason where id = p_id;
  elsif p_decision = 'cancel' then
    if r.status not in ('draft','pending','approved') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
    if public.clean_text(p_reason) is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update public.fund_requests set status = 'cancelled', decision_reason = p_reason where id = p_id;
    update public.reward_payouts set status = 'cancelled' where fund_request_id = p_id and status = 'active';
    if r.reward_result_id is not null then
      update public.reward_results set delivery_status = 'not_delivered' where id = r.reward_result_id and delivery_status = 'pending_payout';
    end if;
  else
    raise exception 'INVALID_DECISION' using errcode = 'P0001';
  end if;
end $$;

-- AT08: only actual payment decreases the fund, exactly once.
create or replace function public.admin_record_expense_paid(
  p_id uuid, p_occurred_at date, p_amount numeric, p_doc_asset_id uuid, p_exception_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); r public.fund_requests; v_today date := public.vn_today(); v_note text;
begin
  perform pg_advisory_xact_lock(hashtext('2amfc_fund'));
  select * into r from public.fund_requests where id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if r.kind <> 'expense' or r.status <> 'approved' then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  if p_amount is distinct from r.amount then raise exception 'AMOUNT_MISMATCH' using errcode = 'P0001'; end if;
  if p_occurred_at is null or p_occurred_at > v_today then raise exception 'INVALID_DATE' using errcode = 'P0001'; end if;
  if p_doc_asset_id is null and public.clean_text(p_exception_note) is null then
    raise exception 'DOC_REQUIRED' using errcode = 'P0001';
  end if;
  if public.fund_balance() < r.amount then raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', 'pay:' || p_id, null, p_exception_note);
  if p_doc_asset_id is not null then
    perform public.claim_uploaded_asset(p_doc_asset_id, 'expense_doc', 'admin');
  end if;
  if exists (select 1 from public.fund_periods where month = public.month_of(p_occurred_at) and status = 'closed') then
    v_note := 'Chi ngày ' || to_char(p_occurred_at, 'DD/MM/YYYY') || ' thuộc kỳ đã khóa; ghi sổ kỳ hiện tại';
  end if;
  update public.fund_requests set status = 'paid', occurred_at = p_occurred_at, doc_asset_id = p_doc_asset_id,
    doc_exception_note = public.clean_text(p_exception_note) where id = p_id;
  insert into public.fund_ledger (direction, amount, posting_date, occurred_at, category, public_description,
    source_type, source_id, match_id, period_note, recorded_by)
  values ('out', r.amount, v_today, p_occurred_at, r.category, r.public_description, 'fund_request', r.id, r.match_id, v_note, v_admin);
  if r.reward_result_id is not null then
    update public.reward_results set delivery_status = 'delivered' where id = r.reward_result_id;
  end if;
end $$;

-- AT10 / AT28: correction = opposite entry referencing the original; history kept.
create or replace function public.admin_reverse_ledger(p_entry_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); e public.fund_ledger; v_req public.fund_requests;
begin
  if public.clean_text(p_reason) is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('2amfc_fund'));
  select * into e from public.fund_ledger where id = p_entry_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if e.source_type in ('reversal','opening') then raise exception 'NOT_REVERSIBLE' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fund_ledger where reversal_of = e.id) then raise exception 'ALREADY_REVERSED' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', 'reverse:' || e.id, e.member_id, p_reason);
  insert into public.fund_ledger (direction, amount, posting_date, occurred_at, category, public_description,
    source_type, source_id, reversal_of, member_id, match_id, obligation_month, period_note, recorded_by)
  values (case e.direction when 'in' then 'out' else 'in' end, e.amount, public.vn_today(), public.vn_today(), e.category,
    'Điều chỉnh: ' || e.public_description, 'reversal', e.id, e.id, e.member_id, e.match_id, e.obligation_month,
    'Điều chỉnh dòng ghi sổ ngày ' || to_char(e.posting_date, 'DD/MM/YYYY'), v_admin);

  if e.source_type = 'payment_submission' then
    update public.payment_submissions set status = 'reversed' where id = e.source_id;
    update public.penalties set status = 'unpaid'
     where id = (select penalty_id from public.payment_submissions where id = e.source_id) and status = 'paid';
  elsif e.source_type = 'donation' then
    update public.donations set status = 'reversed' where id = e.source_id;
  elsif e.source_type = 'fund_request' then
    select * into v_req from public.fund_requests where id = e.source_id;
    if v_req.reward_result_id is not null then
      update public.reward_results set delivery_status = 'not_delivered' where id = v_req.reward_result_id;
      update public.reward_payouts set status = 'cancelled' where fund_request_id = v_req.id and status = 'active';
    end if;
  end if;
end $$;

create or replace function public.admin_close_period(p_month text, p_reconciled numeric, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); p public.fund_periods; v_open numeric; v_in numeric; v_out numeric; v_close numeric;
begin
  perform pg_advisory_xact_lock(hashtext('2amfc_fund'));
  select * into p from public.fund_periods where month = p_month for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p.status = 'closed' then raise exception 'PERIOD_CLOSED' using errcode = 'P0001'; end if;
  if p_month >= public.month_of(public.vn_today()) then raise exception 'PERIOD_NOT_ENDED' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fund_periods where month < p_month and status = 'open') then
    raise exception 'EARLIER_PERIOD_OPEN' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.payment_submissions s where s.status = 'pending' and public.month_of((s.created_at at time zone 'Asia/Ho_Chi_Minh')::date) <= p_month)
     or exists (select 1 from public.fund_requests r where r.status in ('pending','approved')
                and public.month_of(coalesce(r.planned_date, (r.created_at at time zone 'Asia/Ho_Chi_Minh')::date)) <= p_month) then
    raise exception 'HAS_PENDING_ITEMS' using errcode = 'P0001';
  end if;
  select coalesce(sum(case direction when 'in' then amount else -amount end), 0) into v_open from public.fund_ledger where posting_month < p_month;
  select coalesce(sum(amount) filter (where direction = 'in'), 0), coalesce(sum(amount) filter (where direction = 'out'), 0)
    into v_in, v_out from public.fund_ledger where posting_month = p_month;
  v_close := v_open + v_in - v_out;
  if p_reconciled is null then raise exception 'RECONCILE_REQUIRED' using errcode = 'P0001'; end if;
  if p_reconciled <> v_close and public.clean_text(p_note) is null then raise exception 'NOTE_REQUIRED' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', 'close:' || p_month, null, p_note);
  update public.fund_periods set status = 'closed', opening_balance = v_open, closing_balance = v_close,
    reconciled_amount = p_reconciled, reconcile_note = public.clean_text(p_note), closed_by = v_admin, closed_at = now()
  where month = p_month;
  return jsonb_build_object('opening', v_open, 'in', v_in, 'out', v_out, 'closing', v_close);
end $$;

-- ───────────────────────── M04 RSVP by admin ─────────────────────────
create or replace function public.admin_set_rsvp(p_match_id uuid, p_member_id uuid, p_response text, p_gathering text, p_position text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); v_sched int;
begin
  select schedule_version into v_sched from public.matches where id = p_match_id;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', null, p_member_id, coalesce(p_reason, 'Quản trị cập nhật hộ'));
  insert into public.match_rsvps as r (match_id, member_id, response, gathering_response, position_code, accepted_schedule_version, actor_kind, admin_user_id, changed_at)
  values (p_match_id, p_member_id, p_response, p_gathering, nullif(p_position, ''), v_sched, 'admin', v_admin, now())
  on conflict (match_id, member_id) do update set response = excluded.response, gathering_response = excluded.gathering_response,
    position_code = excluded.position_code, accepted_schedule_version = excluded.accepted_schedule_version,
    actor_kind = 'admin', admin_user_id = v_admin, changed_at = now();
  perform public.auto_lineup(p_match_id);
end $$;
-- ───────────────────────── M05 Lineup (INV08, INV09, AT13, AT15) ─────────────────────────
create or replace function public.admin_save_lineup(
  p_match_id uuid, p_formation text, p_slots jsonb, p_expected_version int, p_publish boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public.require_admin();
  v_match public.matches; l public.lineups; v_allowed text[]; v_bad text; v_starters int; v_snapshot jsonb;
begin
  if p_formation not in ('2-3-1','3-2-1','2-2-2') then raise exception 'INVALID_FORMATION' using errcode = 'P0001'; end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_match.status not in ('published','postponed','draft') then raise exception 'MATCH_LOCKED' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', null, null, null);

  select * into l from public.lineups where match_id = p_match_id for update;
  if not found then
    insert into public.lineups (match_id, formation) values (p_match_id, p_formation) returning * into l;
    if coalesce(p_expected_version, 0) not in (0, 1) then raise exception 'CONFLICT' using errcode = 'P0001'; end if;
  elsif l.version <> p_expected_version then
    raise exception 'CONFLICT' using errcode = 'P0001';
  end if;

  v_allowed := public.formation_slots(p_formation);
  select string_agg(distinct x->>'slot_code', ', ') into v_bad from jsonb_array_elements(p_slots) x
   where x->>'role' = 'starter' and not ((x->>'slot_code') = any(v_allowed));
  if v_bad is not null then raise exception 'INVALID_SLOT' using errcode = 'P0001', detail = v_bad; end if;

  -- only active members who confirmed "yes" on the current schedule version
  select string_agg(coalesce(public.member_label((x->>'member_id')::uuid), x->>'member_id'), ', ') into v_bad
  from jsonb_array_elements(p_slots) x
  where not exists (
    select 1 from public.match_rsvps r join public.members m on m.id = r.member_id
    where r.match_id = p_match_id and r.member_id = (x->>'member_id')::uuid and r.response = 'yes'
      and r.accepted_schedule_version = v_match.schedule_version and m.status = 'active');
  if v_bad is not null then raise exception 'INELIGIBLE_PLAYER' using errcode = 'P0001', detail = v_bad; end if;

  delete from public.lineup_slots where lineup_id = l.id;
  begin
    insert into public.lineup_slots (lineup_id, member_id, role, slot_code, sub_order)
    select l.id, (x->>'member_id')::uuid, x->>'role',
           case when x->>'role' = 'starter' then x->>'slot_code' end,
           case when x->>'role' = 'sub' then coalesce((x->>'sub_order')::int, 1) end
    from jsonb_array_elements(p_slots) x;
  exception when unique_violation then
    raise exception 'DUPLICATE_SLOT' using errcode = 'P0001';
  end;

  select count(*) into v_starters from public.lineup_slots where lineup_id = l.id and role = 'starter';
  if p_publish then
    if v_match.status <> 'published' then raise exception 'MATCH_NOT_PUBLISHED' using errcode = 'P0001'; end if;
    if v_starters <> 7 or not exists (select 1 from public.lineup_slots where lineup_id = l.id and slot_code = 'GK') then
      raise exception 'LINEUP_INCOMPLETE' using errcode = 'P0001', detail = (7 - v_starters)::text;
    end if;
    -- tg_bump_version sets version = old.version + 1
    update public.lineups set formation = p_formation, status = 'published', needs_update_reason = null, auto = false,
      published_at = now(), published_version = l.version + 1 where id = l.id returning * into l;
    select jsonb_agg(jsonb_build_object('member_id', s.member_id, 'role', s.role, 'slot_code', s.slot_code, 'sub_order', s.sub_order)
                     order by s.role desc, s.slot_code, s.sub_order)
      into v_snapshot from public.lineup_slots s where s.lineup_id = l.id;
    insert into public.lineup_snapshots (lineup_id, version, formation, slots) values (l.id, l.version, p_formation, v_snapshot);
    perform public.notify('public', 'lineup_pub:' || l.id || ':' || l.version, 'lineup',
      'Đội hình vs ' || v_match.opponent || ' (' || p_formation || ')', 'Đội hình dự kiến đã công bố.', '/matches/' || p_match_id);
  else
    update public.lineups set formation = p_formation, auto = false,
      status = case when status = 'needs_update' then 'needs_update' else 'draft' end
    where id = l.id returning * into l;
  end if;
  return jsonb_build_object('version', l.version, 'status', l.status, 'starters', v_starters);
end $$;

-- ───────────────────────── M07 Participation & gathering ─────────────────────────
create or replace function public.admin_save_participation(
  p_match_id uuid, p_rows jsonb, p_score_us int, p_score_them int, p_post_note text,
  p_attendance_complete boolean, p_complete_match boolean, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); v_match public.matches; x jsonb;
begin
  select * into v_match from public.matches where id = p_match_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_match.status = 'cancelled' then raise exception 'MATCH_CANCELLED' using errcode = 'P0001'; end if;
  if v_match.starts_at > now() then raise exception 'MATCH_NOT_STARTED' using errcode = 'P0001'; end if;
  if v_match.status = 'completed' and public.clean_text(p_reason) is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', null, null, p_reason);

  for x in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if (x->>'actual_status') <> 'played' and coalesce((x->>'goals')::int, 0) > 0 then
      raise exception 'GOALS_REQUIRE_PLAYED' using errcode = 'P0001', detail = public.member_label((x->>'member_id')::uuid);
    end if;
    insert into public.match_participations as p (match_id, member_id, actual_status, was_starter, positions, goals, goals_confirmed, note, confirmed_by, updated_at)
    values (p_match_id, (x->>'member_id')::uuid, x->>'actual_status', (x->>'was_starter')::boolean,
      coalesce(array(select jsonb_array_elements_text(x->'positions')), '{}'),
      case when x->>'actual_status' = 'played' then nullif(x->>'goals', '')::int else null end,
      case when x->>'actual_status' = 'played' then coalesce((x->>'goals_confirmed')::boolean, false) else false end,
      public.clean_text(x->>'note'), v_admin, now())
    on conflict (match_id, member_id) do update set actual_status = excluded.actual_status, was_starter = excluded.was_starter,
      positions = excluded.positions, goals = excluded.goals, goals_confirmed = excluded.goals_confirmed,
      note = excluded.note, confirmed_by = v_admin, updated_at = now();
  end loop;

  update public.matches set score_us = p_score_us, score_them = p_score_them, post_note = public.clean_text(p_post_note),
    attendance_complete = coalesce(p_attendance_complete, false),
    status = case when p_complete_match then 'completed' else status end
  where id = p_match_id;

  -- AT21: edits touching a finalized reward event raise an admin warning; results are not rewritten.
  if exists (select 1 from public.reward_event_matches em join public.reward_events e on e.id = em.event_id
             where em.match_id = p_match_id and e.status = 'finalized') then
    perform public.notify('admin', 'reward_impact:' || p_match_id || ':' || extract(epoch from now())::bigint, 'reward',
      'Điểm danh/bàn thắng thay đổi sau khi chốt giải', 'Kiểm tra lại các event thưởng liên quan trận vs ' || v_match.opponent, '/admin/events');
  end if;
  perform public.sync_penalties(p_match_id); -- RSVP yes + absent ⇒ penalty
  perform public.refresh_auto_lineups();     -- monthly form changed
end $$;

-- ───────────────────────── Penalties, donations, direct entries (v3) ─────────────────────────
create or replace function public.admin_waive_penalty(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); pe public.penalties;
begin
  if public.clean_text(p_reason) is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select * into pe from public.penalties where id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if pe.status <> 'unpaid' then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  if exists (select 1 from public.payment_submissions where penalty_id = p_id and status = 'pending') then
    raise exception 'HAS_LIVE_PAYMENT' using errcode = 'P0001';
  end if;
  perform public.set_ctx('admin', null, pe.member_id, p_reason);
  update public.penalties set status = 'waived', waive_reason = public.clean_text(p_reason) where id = p_id;
end $$;

create or replace function public.admin_review_donation(p_id uuid, p_decision text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); d public.donations; v_today date := public.vn_today(); v_occ date;
begin
  select * into d from public.donations where id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if d.status = 'approved' and p_decision = 'approve' then return jsonb_build_object('already', true); end if;
  if d.status <> 'pending' then raise exception 'NOT_PENDING' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', p_decision || ':' || d.id, null, p_reason);
  if p_decision = 'approve' then
    v_occ := least((d.transferred_at at time zone 'Asia/Ho_Chi_Minh')::date, v_today);
    update public.donations set status = 'approved', reviewed_by = v_admin, reviewed_at = now() where id = d.id;
    insert into public.fund_ledger (direction, amount, posting_date, occurred_at, category, public_description,
      source_type, source_id, recorded_by)
    values ('in', d.amount, v_today, v_occ, 'Ủng hộ',
      'Ủng hộ — ' || case when d.anonymous then 'Nhà hảo tâm' else d.donor_name end, 'donation', d.id, v_admin);
  elsif p_decision = 'reject' then
    if public.clean_text(p_reason) is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update public.donations set status = 'rejected', reject_reason = public.clean_text(p_reason), reviewed_by = v_admin, reviewed_at = now() where id = d.id;
  else
    raise exception 'INVALID_DECISION' using errcode = 'P0001';
  end if;
  return jsonb_build_object('already', false);
end $$;

-- Quick entry: an income or expense that already happened, recorded in one step (request + ledger, one transaction).
create or replace function public.admin_record_direct(p jsonb, p_doc_asset_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); v_kind text := p->>'kind'; v_amount numeric := (p->>'amount')::numeric;
        v_today date := public.vn_today(); v_occ date := coalesce(nullif(p->>'occurred_at', '')::date, public.vn_today());
        v_id uuid; v_note text;
begin
  if v_kind not in ('income','expense') then raise exception 'INVALID_DECISION' using errcode = 'P0001'; end if;
  if v_amount is null or v_amount <= 0 or v_amount <> trunc(v_amount) then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  if v_occ > v_today then raise exception 'INVALID_DATE' using errcode = 'P0001'; end if;
  if v_kind = 'expense' and p_doc_asset_id is null and public.clean_text(p->>'private_note') is null then
    raise exception 'DOC_REQUIRED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('2amfc_fund'));
  if v_kind = 'expense' and public.fund_balance() - public.fund_committed() < v_amount then
    raise exception 'INSUFFICIENT_FUNDS' using errcode = 'P0001';
  end if;
  perform public.set_ctx('admin', p->>'request_id', null, 'Ghi nhận trực tiếp');
  if p_doc_asset_id is not null then perform public.claim_uploaded_asset(p_doc_asset_id, 'expense_doc', 'admin'); end if;
  if exists (select 1 from public.fund_periods where month = public.month_of(v_occ) and status = 'closed') then
    v_note := 'Phát sinh ' || to_char(v_occ, 'DD/MM/YYYY') || ' thuộc kỳ đã khóa; ghi sổ kỳ hiện tại';
  end if;
  insert into public.fund_requests (kind, category, amount, public_description, private_note, counterparty, occurred_at,
    method, status, already_spent, match_id, doc_asset_id, doc_exception_note, created_by, approved_by, approved_at)
  values (v_kind, p->>'category', v_amount, public.clean_text(p->>'public_description'), public.clean_text(p->>'private_note'),
    public.clean_text(p->>'counterparty'), v_occ, coalesce(nullif(p->>'method', ''), 'bank'),
    case v_kind when 'income' then 'recorded' else 'paid' end, v_kind = 'expense', nullif(p->>'match_id', '')::uuid,
    p_doc_asset_id, case when p_doc_asset_id is null then public.clean_text(p->>'private_note') end, v_admin, v_admin, now())
  returning id into v_id;
  insert into public.fund_ledger (direction, amount, posting_date, occurred_at, category, public_description,
    source_type, source_id, match_id, period_note, recorded_by)
  select case v_kind when 'income' then 'in' else 'out' end, v_amount, v_today, v_occ, r.category, r.public_description,
    'fund_request', r.id, r.match_id, v_note, v_admin
  from public.fund_requests r where r.id = v_id;
  return v_id;
end $$;

create or replace function public.admin_save_gathering(p_match_id uuid, p_data jsonb, p_rows jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); v_id uuid; x jsonb;
begin
  perform public.set_ctx('admin', null, null, p_data->>'reason');
  insert into public.post_match_gatherings as g (match_id, starts_at, location, note, status)
  values (p_match_id, nullif(p_data->>'starts_at', '')::timestamptz, public.clean_text(p_data->>'location'),
          public.clean_text(p_data->>'note'), coalesce(p_data->>'status', 'planned'))
  on conflict (match_id) do update set starts_at = excluded.starts_at, location = excluded.location,
    note = excluded.note, status = excluded.status
  returning id into v_id;
  for x in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    insert into public.gathering_attendance as a (gathering_id, member_id, actual_status, confirmed_by, updated_at)
    values (v_id, (x->>'member_id')::uuid, x->>'actual_status', v_admin, now())
    on conflict (gathering_id, member_id) do update set actual_status = excluded.actual_status, confirmed_by = v_admin, updated_at = now();
  end loop;
  return v_id;
end $$;

-- ───────────────────────── M06 Reward events ─────────────────────────
create or replace function public.reward_snapshot(p_event_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'title', e.title, 'rules', e.rules, 'exclusions', e.exclusions, 'method', e.method, 'tie_rule', e.tie_rule,
    'audience', e.audience, 'audience_positions', e.audience_positions, 'budget_max', e.budget_max,
    'funding_source', e.funding_source, 'starts_on', e.starts_on, 'ends_on', e.ends_on,
    'matches', (select coalesce(jsonb_agg(match_id), '[]') from public.reward_event_matches where event_id = e.id),
    'prizes', (select coalesce(jsonb_agg(jsonb_build_object('rank', rank, 'name', name, 'winners_count', winners_count,
                 'amount_each', amount_each, 'item_desc', item_desc) order by rank), '[]') from public.reward_prizes where event_id = e.id))
  from public.reward_events e where e.id = p_event_id
$$;

create or replace function public.admin_save_reward_event(
  p_id uuid, p jsonb, p_match_ids uuid[], p_prizes jsonb, p_eligible uuid[], p_expected_version int, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); e public.reward_events; v_id uuid; x jsonb; v_rank int := 0;
begin
  perform public.set_ctx('admin', null, null, p_reason);
  if p_id is null then
    insert into public.reward_events (title, description, starts_on, ends_on, result_deadline, audience, audience_positions,
      requires_played, rules, exclusions, method, tie_rule, tie_note, funding_source, budget_max)
    values (public.clean_text(p->>'title'), p->>'description', (p->>'starts_on')::date, (p->>'ends_on')::date,
      nullif(p->>'result_deadline', '')::date, coalesce(p->>'audience', 'all'),
      coalesce(array(select jsonb_array_elements_text(p->'audience_positions')), '{}'),
      coalesce((p->>'requires_played')::boolean, true), coalesce(p->>'rules', ''), p->>'exclusions',
      coalesce(p->>'method', 'manual'), coalesce(p->>'tie_rule', 'manager'), p->>'tie_note',
      coalesce(p->>'funding_source', 'fund'), nullif(p->>'budget_max', '')::numeric)
    returning id into v_id;
  else
    select * into e from public.reward_events where id = p_id for update;
    if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
    if e.version <> p_expected_version then raise exception 'CONFLICT' using errcode = 'P0001'; end if;
    if e.status in ('finalized','cancelled') then raise exception 'EVENT_LOCKED' using errcode = 'P0001'; end if;
    if e.status <> 'draft' and public.clean_text(p_reason) is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update public.reward_events set title = public.clean_text(p->>'title'), description = p->>'description',
      starts_on = (p->>'starts_on')::date, ends_on = (p->>'ends_on')::date, result_deadline = nullif(p->>'result_deadline', '')::date,
      audience = coalesce(p->>'audience', 'all'),
      audience_positions = coalesce(array(select jsonb_array_elements_text(p->'audience_positions')), '{}'),
      requires_played = coalesce((p->>'requires_played')::boolean, true), rules = coalesce(p->>'rules', ''),
      exclusions = p->>'exclusions', method = coalesce(p->>'method', 'manual'), tie_rule = coalesce(p->>'tie_rule', 'manager'),
      tie_note = p->>'tie_note', funding_source = coalesce(p->>'funding_source', 'fund'),
      budget_max = nullif(p->>'budget_max', '')::numeric,
      rules_version = case when status <> 'draft' then rules_version + 1 else rules_version end
    where id = p_id;
    v_id := p_id;
  end if;

  delete from public.reward_event_matches where event_id = v_id;
  insert into public.reward_event_matches (event_id, match_id) select v_id, mid from unnest(coalesce(p_match_ids, '{}')) mid on conflict do nothing;
  delete from public.reward_event_eligible_members where event_id = v_id;
  insert into public.reward_event_eligible_members (event_id, member_id, basis)
  select v_id, eid, 'Chọn thủ công' from unnest(coalesce(p_eligible, '{}')) eid on conflict do nothing;
  delete from public.reward_prizes where event_id = v_id;
  for x in select * from jsonb_array_elements(coalesce(p_prizes, '[]'::jsonb)) loop
    v_rank := v_rank + 1;
    insert into public.reward_prizes (event_id, rank, name, winners_count, amount_each, item_desc)
    values (v_id, v_rank, coalesce(public.clean_text(x->>'name'), 'Giải ' || v_rank), coalesce((x->>'winners_count')::int, 1),
      coalesce(nullif(x->>'amount_each', '')::numeric, 0), public.clean_text(x->>'item_desc'));
  end loop;

  select * into e from public.reward_events where id = v_id;
  if e.budget_max is not null and (select coalesce(sum(winners_count * amount_each), 0) from public.reward_prizes where event_id = v_id) > e.budget_max then
    raise exception 'OVER_BUDGET' using errcode = 'P0001';
  end if;
  if e.status <> 'draft' then
    update public.reward_events set published_snapshot = public.reward_snapshot(v_id) where id = v_id;
    perform public.notify('public', 'reward_rules:' || v_id || ':' || e.rules_version, 'reward',
      'Cập nhật thể lệ: ' || e.title, coalesce(public.clean_text(p_reason), ''), '/events');
  end if;
  return v_id;
end $$;

create or replace function public.admin_set_reward_status(p_id uuid, p_status text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); e public.reward_events;
begin
  select * into e from public.reward_events where id = p_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', null, null, p_reason);
  if p_status = 'published' and e.status = 'draft' then
    if not exists (select 1 from public.reward_prizes where event_id = p_id) then raise exception 'NO_PRIZES' using errcode = 'P0001'; end if;
    update public.reward_events set status = 'published', published_snapshot = public.reward_snapshot(p_id) where id = p_id;
    perform public.notify('public', 'reward_pub:' || p_id, 'reward', 'Event thưởng: ' || e.title, 'Xem thể lệ và cơ cấu giải.', '/events');
  elsif p_status in ('running','pending_final') and e.status in ('published','running','pending_final') then
    update public.reward_events set status = p_status where id = p_id;
  elsif p_status = 'cancelled' and e.status not in ('finalized','cancelled') then
    if public.clean_text(p_reason) is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
    update public.reward_events set status = 'cancelled', cancel_reason = p_reason where id = p_id;
    perform public.notify('public', 'reward_cancel:' || p_id, 'reward', 'Hủy event: ' || e.title, p_reason, '/events');
  else
    raise exception 'INVALID_STATUS' using errcode = 'P0001';
  end if;
end $$;

-- Goals leaderboard for an event (only confirmed goals in completed in-scope matches).
create or replace function public.reward_goal_table(p_event_id uuid)
returns table (member_id uuid, goals bigint, matches_played bigint, data_complete boolean)
language sql stable security definer set search_path = '' as $$
  with scope as (
    select m.id, m.status from public.reward_event_matches em join public.matches m on m.id = em.match_id where em.event_id = p_event_id
  ), complete as (
    select bool_and(s.status in ('completed','cancelled')) and not exists (
      select 1 from public.match_participations p join scope s2 on s2.id = p.match_id
      where s2.status = 'completed' and p.actual_status = 'played' and not p.goals_confirmed) as ok
    from scope s
  )
  select p.member_id, sum(p.goals) filter (where p.goals_confirmed), count(*), (select ok from complete)
  from public.match_participations p join scope s on s.id = p.match_id
  where s.status = 'completed' and p.actual_status = 'played'
  group by p.member_id
$$;

-- AT19: finalize winners — respects audience, prize slots and budget; goals method requires complete data.
create or replace function public.admin_finalize_reward(p_event_id uuid, p_results jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); e public.reward_events; x jsonb; pr public.reward_prizes; v_member uuid; v_total numeric;
begin
  select * into e from public.reward_events where id = p_event_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if e.status not in ('published','running','pending_final') then raise exception 'INVALID_STATUS' using errcode = 'P0001'; end if;
  if e.method = 'goals' and (
      not exists (select 1 from public.reward_event_matches where event_id = p_event_id)
      or exists (select 1 from public.reward_goal_table(p_event_id) where not data_complete)
      or exists (select 1 from public.reward_event_matches em join public.matches m on m.id = em.match_id
                 where em.event_id = p_event_id and m.status not in ('completed','cancelled'))) then
    raise exception 'INSUFFICIENT_DATA' using errcode = 'P0001';
  end if;
  perform public.set_ctx('admin', 'finalize:' || p_event_id, null, null);

  for x in select * from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) loop
    select * into pr from public.reward_prizes where id = (x->>'prize_id')::uuid and event_id = p_event_id;
    if not found then raise exception 'INVALID_PRIZE' using errcode = 'P0001'; end if;
    v_member := (x->>'member_id')::uuid;
    if not exists (select 1 from public.members where id = v_member) then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
    if e.audience = 'selected' and not exists (select 1 from public.reward_event_eligible_members where event_id = p_event_id and member_id = v_member) then
      raise exception 'NOT_ELIGIBLE' using errcode = 'P0001', detail = public.member_label(v_member);
    end if;
    if e.audience = 'positions' and not exists (
        select 1 from public.member_positions mp where mp.member_id = v_member and mp.position_code = any(e.audience_positions)
        union all
        select 1 from public.match_participations p join public.reward_event_matches em on em.match_id = p.match_id
        where em.event_id = p_event_id and p.member_id = v_member and p.positions && e.audience_positions) then
      raise exception 'NOT_ELIGIBLE' using errcode = 'P0001', detail = public.member_label(v_member);
    end if;
    if e.requires_played and not exists (
        select 1 from public.match_participations p join public.reward_event_matches em on em.match_id = p.match_id
        join public.matches m on m.id = p.match_id
        where em.event_id = p_event_id and p.member_id = v_member and p.actual_status = 'played' and m.status = 'completed') then
      raise exception 'NOT_ELIGIBLE' using errcode = 'P0001', detail = public.member_label(v_member) || ' chưa thi đấu trong phạm vi';
    end if;
    if public.clean_text(x->>'basis') is null then raise exception 'BASIS_REQUIRED' using errcode = 'P0001'; end if;
    insert into public.reward_results (prize_id, member_id, basis, amount)
    values (pr.id, v_member, public.clean_text(x->>'basis'), coalesce(nullif(x->>'amount', '')::numeric, pr.amount_each));
  end loop;

  if exists (select 1 from public.reward_prizes p
             where p.event_id = p_event_id
               and ((select count(*) from public.reward_results r where r.prize_id = p.id and r.status = 'active') > p.winners_count
                 or (select coalesce(sum(r.amount), 0) from public.reward_results r where r.prize_id = p.id and r.status = 'active') > p.winners_count * p.amount_each)) then
    raise exception 'PRIZE_SLOTS_EXCEEDED' using errcode = 'P0001';
  end if;
  select coalesce(sum(r.amount), 0) into v_total from public.reward_results r join public.reward_prizes p on p.id = r.prize_id
   where p.event_id = p_event_id and r.status = 'active';
  if e.budget_max is not null and v_total > e.budget_max then raise exception 'OVER_BUDGET' using errcode = 'P0001'; end if;

  update public.reward_events set status = 'finalized', finalized_by = v_admin, finalized_at = now() where id = p_event_id;
  perform public.notify('public', 'reward_final:' || p_event_id, 'reward', 'Kết quả: ' || e.title, 'Đã chốt người thắng.', '/events');
exception when unique_violation then
  raise exception 'DUPLICATE_WINNER' using errcode = 'P0001';
end $$;

-- AT20: one active payout per result; re-clicking returns the existing request.
create or replace function public.admin_request_reward_payout(p_result_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); r public.reward_results; pr public.reward_prizes; e public.reward_events; v_req uuid;
begin
  select * into r from public.reward_results where id = p_result_id for update;
  if not found or r.status <> 'active' then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  select * into pr from public.reward_prizes where id = r.prize_id;
  select * into e from public.reward_events where id = pr.event_id;
  if e.funding_source <> 'fund' then raise exception 'NOT_FUND_REWARD' using errcode = 'P0001'; end if;
  if r.amount <= 0 then raise exception 'INVALID_AMOUNT' using errcode = 'P0001'; end if;
  select fund_request_id into v_req from public.reward_payouts where result_id = r.id and status = 'active';
  if found then return v_req; end if;
  if r.delivery_status = 'delivered' then raise exception 'ALREADY_DELIVERED' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', 'payout:' || r.id, r.member_id, null);
  insert into public.fund_requests (kind, category, amount, public_description, status, reward_result_id, created_by)
  values ('expense', 'Thưởng tuần', r.amount, 'Thưởng ' || e.title || ' — ' || pr.name || ' — ' || public.member_label(r.member_id),
          'pending', r.id, v_admin)
  returning id into v_req;
  insert into public.reward_payouts (result_id, fund_request_id) values (r.id, v_req);
  update public.reward_results set delivery_status = 'pending_payout' where id = r.id;
  return v_req;
end $$;

create or replace function public.admin_mark_reward_delivered(p_result_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); v_src text;
begin
  select e.funding_source into v_src from public.reward_results r join public.reward_prizes p on p.id = r.prize_id
    join public.reward_events e on e.id = p.event_id where r.id = p_result_id and r.status = 'active';
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if v_src = 'fund' then raise exception 'USE_PAYOUT_FLOW' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', null, null, 'Trao thưởng ngoài quỹ');
  update public.reward_results set delivery_status = 'delivered' where id = p_result_id;
end $$;

create or replace function public.admin_void_reward_result(p_result_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); r public.reward_results;
begin
  if public.clean_text(p_reason) is null then raise exception 'REASON_REQUIRED' using errcode = 'P0001'; end if;
  select * into r from public.reward_results where id = p_result_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if r.delivery_status <> 'not_delivered' then raise exception 'HAS_PAYOUT' using errcode = 'P0001'; end if;
  perform public.set_ctx('admin', null, r.member_id, p_reason);
  update public.reward_results set status = 'voided', void_reason = p_reason where id = r.id;
end $$;

create or replace function public.admin_mark_notifications_read() returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin();
begin
  update public.notifications set read_at = now() where audience = 'admin' and read_at is null;
end $$;

-- Admin upload reservation (avatars, expense docs).
create or replace function public.admin_begin_upload(p_purpose text, p_mime text, p_size int, p_sha256 text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); v_bucket text; v_ext text; v_path text; v_id uuid;
begin
  v_bucket := case p_purpose when 'avatar' then 'avatars' when 'expense_doc' then 'expense-docs' end;
  if v_bucket is null then raise exception 'FILE_INVALID' using errcode = 'P0001'; end if;
  v_ext := case p_mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp'
                       when 'application/pdf' then case when p_purpose = 'expense_doc' then 'pdf' end end;
  if v_ext is null then raise exception 'FILE_TYPE' using errcode = 'P0001'; end if;
  if p_size > (case p_purpose when 'avatar' then 5 else 10 end) * 1024 * 1024 then raise exception 'FILE_TOO_LARGE' using errcode = 'P0001'; end if;
  v_path := to_char(now(), 'YYYY/MM') || '/' || gen_random_uuid() || '.' || v_ext;
  insert into public.file_assets (bucket, object_path, purpose, mime, size_bytes, sha256, actor_kind, uploader_admin_id)
  values (v_bucket, v_path, p_purpose, p_mime, p_size, p_sha256, 'admin', v_admin) returning id into v_id;
  return jsonb_build_object('asset_id', v_id, 'bucket', v_bucket, 'path', v_path);
end $$;

create or replace function public.admin_finish_avatar(p_member_id uuid, p_asset_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.require_admin(); a public.file_assets;
begin
  a := public.claim_uploaded_asset(p_asset_id, 'avatar', 'admin');
  perform public.set_ctx('admin', null, null, 'Cập nhật ảnh');
  update public.members set avatar_path = a.object_path where id = p_member_id;
end $$;
