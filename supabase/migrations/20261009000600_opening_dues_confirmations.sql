-- Historical dues included in the opening balance: no invented receipt,
-- transfer date or second income entry. Regular submissions still need evidence.
alter table public.payment_submissions
  add column opening_ledger_id uuid references public.fund_ledger(id) on delete restrict,
  add column opening_note text,
  alter column receipt_asset_id drop not null,
  alter column transferred_at drop not null,
  alter column method drop not null;

alter table public.payment_submissions add constraint payment_submissions_evidence_check check (
  (opening_ledger_id is null and opening_note is null
    and receipt_asset_id is not null and transferred_at is not null and method is not null)
  or
  (opening_ledger_id is not null and opening_note is not null
    and char_length(btrim(opening_note)) between 3 and 1000
    and actor_kind = 'admin' and status = 'approved'
    and due_id is not null and penalty_id is null
    and receipt_asset_id is null and transferred_at is null and method is null
    and reviewed_by is not null and reviewed_at is not null)
);

create or replace function public.admin_confirm_opening_due(p_due_id uuid, p_note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public.require_admin();
  d public.monthly_dues;
  v_opening uuid;
  v_opening_date date;
  v_existing public.payment_submissions;
  v_id uuid;
  v_note text := public.clean_text(p_note);
begin
  if v_note is null or char_length(v_note) not between 3 and 1000 then
    raise exception 'REASON_REQUIRED' using errcode = 'P0001';
  end if;
  select * into d from public.monthly_dues where id = p_due_id for update;
  if not found then raise exception 'NOT_FOUND' using errcode = 'P0001'; end if;
  if d.amount_due <= 0 then raise exception 'EXEMPT' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fund_periods where month = d.obligation_month and status = 'closed') then
    raise exception 'PERIOD_CLOSED' using errcode = 'P0001';
  end if;
  select id, posting_date into v_opening, v_opening_date from public.fund_ledger l
    where l.is_opening and not exists (select 1 from public.fund_ledger r where r.reversal_of = l.id);
  if v_opening is null then raise exception 'OPENING_REQUIRED' using errcode = 'P0001'; end if;
  if d.obligation_month > public.month_of(v_opening_date) then
    raise exception 'MONTH_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  select * into v_existing from public.payment_submissions
    where due_id = d.id and status in ('pending', 'approved') for update;
  if found then
    if v_existing.opening_ledger_id = v_opening then return v_existing.id; end if;
    raise exception 'HAS_LIVE_PAYMENT' using errcode = 'P0001';
  end if;
  perform public.set_ctx('admin', 'opening-confirm:' || d.id, d.member_id, v_note);
  insert into public.payment_submissions (
    group_ref, due_id, member_id, amount, transferred_at, method, receipt_asset_id,
    status, reviewed_by, reviewed_at, actor_kind, request_id, opening_ledger_id, opening_note
  ) values (
    'KHOITAO-' || d.obligation_month, d.id, d.member_id, d.amount_due, null, null, null,
    'approved', v_admin, now(), 'admin', 'opening-confirm:' || d.id, v_opening, v_note
  ) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.admin_confirm_opening_due(uuid, text) from public, anon;
grant execute on function public.admin_confirm_opening_due(uuid, text) to authenticated;

notify pgrst, 'reload schema';
