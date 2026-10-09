-- Admin may record money received using an explicit confirmation instead of a
-- bank receipt. Keep the transfer date/method unknown and post exactly once.
alter table public.payment_submissions add column admin_confirmation_note text;
alter table public.payment_submissions drop constraint payment_submissions_evidence_check;
alter table public.payment_submissions add constraint payment_submissions_evidence_check check (
  (opening_ledger_id is null and opening_note is null and admin_confirmation_note is null
    and receipt_asset_id is not null and transferred_at is not null and method is not null)
  or
  (opening_ledger_id is not null and opening_note is not null and admin_confirmation_note is null
    and char_length(btrim(opening_note)) between 3 and 1000
    and actor_kind = 'admin' and status = 'approved'
    and due_id is not null and penalty_id is null
    and receipt_asset_id is null and transferred_at is null and method is null
    and reviewed_by is not null and reviewed_at is not null)
  or
  (opening_ledger_id is null and opening_note is null and admin_confirmation_note is not null
    and char_length(btrim(admin_confirmation_note)) between 3 and 1000
    and actor_kind = 'admin' and status in ('approved', 'reversed')
    and due_id is not null and penalty_id is null
    and receipt_asset_id is null and transferred_at is null and method is null
    and reviewed_by is not null and reviewed_at is not null)
);

create or replace function public.admin_confirm_due_payment(p_due_id uuid, p_amount numeric, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public.require_admin();
  d public.monthly_dues;
  s public.payment_submissions;
  v_id uuid := gen_random_uuid();
  v_today date := public.vn_today();
  v_note text := public.clean_text(p_note);
begin
  if v_note is null or char_length(v_note) not between 3 and 1000 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('2amfc_fund'));
  select * into d from public.monthly_dues where id = p_due_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) or p_amount <> d.amount_due then
    raise exception 'AMOUNT_MISMATCH' using errcode = 'P0001';
  end if;
  select * into s from public.payment_submissions where due_id = d.id and status in ('pending', 'approved');
  if found then
    if s.status = 'approved' then return s.id; end if;
    raise exception 'HAS_LIVE_PAYMENT' using errcode = 'P0001';
  end if;
  perform public.set_ctx('admin', 'admin-confirm:' || v_id, d.member_id, v_note);
  insert into public.payment_submissions (
    id, group_ref, due_id, member_id, amount, transferred_at, method, receipt_asset_id,
    status, reviewed_by, reviewed_at, actor_kind, request_id, admin_confirmation_note
  ) values (
    v_id, 'ADMIN-' || v_id, d.id, d.member_id, p_amount, null, null, null,
    'approved', v_admin, now(), 'admin', 'admin-confirm:' || v_id, v_note
  );
  insert into public.fund_ledger (
    direction, amount, posting_date, occurred_at, category, public_description,
    source_type, source_id, member_id, obligation_month, period_note, recorded_by
  ) values (
    'in', p_amount, v_today, v_today, 'Quỹ tháng',
    'Quỹ tháng ' || d.obligation_month || ' — ' || public.member_label(d.member_id),
    'payment_submission', v_id, d.member_id, d.obligation_month,
    'Ghi ngày quản trị xác nhận đã nhận tiền. ' || v_note, v_admin
  );
  return v_id;
end $$;

revoke all on function public.admin_confirm_due_payment(uuid, numeric, text) from public, anon;
grant execute on function public.admin_confirm_due_payment(uuid, numeric, text) to authenticated;
notify pgrst, 'reload schema';
