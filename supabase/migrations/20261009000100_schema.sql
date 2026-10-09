-- 2AM FC — schema: tables, constraints, indexes.
-- Money: numeric(14,0) VND. Business dates: date. Instants: timestamptz. TZ: Asia/Ho_Chi_Minh.

create or replace function public.vn_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date
$$;

create or replace function public.month_of(d date) returns text
language sql immutable set search_path = '' as $$
  select to_char(d, 'YYYY-MM')
$$;

-- ───────────────────────── Admin & settings ─────────────────────────
create table public.admin_settings (
  id boolean primary key default true check (id),
  admin_user_id uuid not null unique,
  created_at timestamptz not null default now()
);

create table public.team_settings (
  id boolean primary key default true check (id),
  team_name text not null default '2AM FC',
  tagline text not null default 'Không cá nhân ngôi sao – Chỉ có tập thể bất bại',
  monthly_fee numeric(14,0) not null default 150000 check (monthly_fee >= 0),       -- member type 'standard'
  fee_student numeric(14,0) not null default 50000 check (fee_student >= 0),        -- member type 'student' (HSSV)
  fee_maintain numeric(14,0) not null default 50000 check (fee_maintain >= 0),      -- member type 'maintain' (duy trì, không đá)
  penalty_absent numeric(14,0) not null default 50000 check (penalty_absent >= 0),  -- RSVP yes but absent
  due_day int not null default 5 check (due_day between 1 and 28),                  -- deadline: day N of the month
  collect_start_day int not null default 20 check (collect_start_day between 1 and 28), -- collection opens day N of the previous month
  bank_name text,
  bank_account_no text,
  bank_account_name text,
  transfer_note_template text not null default '2AMFC - {ten} - {thang}',
  default_formation text not null default '2-3-1' check (default_formation in ('2-3-1','3-2-1','2-2-2')),
  rsvp_hours_before int not null default 24 check (rsvp_hours_before between 0 and 168),
  expense_categories text[] not null default array['Tiền sân','Nước uống','Dụng cụ','Áo đấu','Liên hoan','Thưởng tuần','Khác'],
  income_categories text[] not null default array['Tài trợ','Đóng góp thêm','Hoàn lại chi phí','Khác'],
  updated_at timestamptz not null default now()
);
insert into public.team_settings (bank_name, bank_account_no, bank_account_name)
values ('MBV - Ngân hàng TNHH MTV Việt Nam Hiện Đại', '55886668', 'NGUYEN QUOC KHANH');

-- ───────────────────────── M01 Members ─────────────────────────
create table public.positions (
  code text primary key,
  name text not null,
  line text not null check (line in ('GK','DEF','MID','FWD')),
  sort int not null
);
insert into public.positions (code, name, line, sort) values
  ('GK','Thủ môn','GK',1), ('DEF','Hậu vệ','DEF',2), ('MID','Tiền vệ','MID',3), ('FWD','Tiền đạo','FWD',4);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 2 and 80 and full_name = btrim(full_name)),
  nickname text check (nickname is null or (char_length(nickname) between 2 and 80 and nickname = btrim(nickname))),
  avatar_path text,
  shirt_number int check (shirt_number between 1 and 99),
  preferred_foot text not null default 'unknown' check (preferred_foot in ('left','right','both','unknown')),
  joined_on date not null default public.vn_today(),
  left_on date,
  status text not null default 'active' check (status in ('active','paused','left','archived')),
  fee_type text not null default 'standard' check (fee_type in ('standard','student','maintain','exempt')),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index members_shirt_active_uq on public.members (shirt_number)
  where shirt_number is not null and status in ('active','paused');

create table public.member_private_details (
  member_id uuid primary key references public.members(id) on delete restrict,
  birth_date date,
  phone text check (phone is null or char_length(phone) <= 20),
  private_note text check (private_note is null or char_length(private_note) <= 1000),
  updated_at timestamptz not null default now()
);

create table public.member_positions (
  member_id uuid not null references public.members(id) on delete cascade,
  position_code text not null references public.positions(code),
  is_primary boolean not null default false,
  primary key (member_id, position_code)
);
create unique index member_positions_one_primary on public.member_positions (member_id) where is_primary;

create table public.member_name_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  old_full_name text not null,
  new_full_name text not null,
  old_nickname text,
  new_nickname text,
  actor_kind text not null check (actor_kind in ('public','admin')),
  admin_user_id uuid,
  request_id text,
  created_at timestamptz not null default now()
);
create index member_name_history_member_idx on public.member_name_history (member_id, created_at desc);

-- ───────────────────────── Files ─────────────────────────
create table public.file_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket in ('avatars','receipts','expense-docs')),
  object_path text not null unique,
  purpose text not null check (purpose in ('avatar','receipt','expense_doc')),
  mime text not null check (mime in ('image/jpeg','image/png','image/webp','application/pdf')),
  size_bytes int not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  actor_kind text not null check (actor_kind in ('public','admin')),
  uploader_admin_id uuid,
  status text not null default 'pending' check (status in ('pending','ready','orphaned')),
  created_at timestamptz not null default now()
);
create index file_assets_sha_idx on public.file_assets (sha256);

-- ───────────────────────── M02 Dues ─────────────────────────
create table public.fund_periods (
  month text primary key check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  due_date date not null,
  fee_amount numeric(14,0) not null check (fee_amount >= 0),
  status text not null default 'open' check (status in ('open','closed')),
  opening_balance numeric(14,0),
  closing_balance numeric(14,0),
  reconciled_amount numeric(14,0),
  reconcile_note text,
  closed_by uuid,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.monthly_dues (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete restrict,
  obligation_month text not null references public.fund_periods(month) on delete restrict,
  amount_snapshot numeric(14,0) not null check (amount_snapshot >= 0),
  amount_due numeric(14,0) not null check (amount_due >= 0),
  fee_type text,                                                            -- member type snapshot at generation
  due_date date not null,
  adjustment_reason text,
  adjusted_by uuid,
  adjusted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (member_id, obligation_month),                                     -- INV01
  check (amount_due <= amount_snapshot),
  check (amount_due = amount_snapshot or adjustment_reason is not null)
);
create index monthly_dues_month_idx on public.monthly_dues (obligation_month);

create table public.payment_submissions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('NQ-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  group_ref text not null,                                                  -- one transfer may cover several months
  due_id uuid references public.monthly_dues(id) on delete restrict,       -- monthly fee …
  penalty_id uuid,                                                          -- … or an absence penalty (FK added below)
  member_id uuid not null references public.members(id) on delete restrict,
  amount numeric(14,0) not null check (amount > 0),
  transferred_at timestamptz not null,
  method text not null default 'bank' check (method in ('bank','cash','ewallet')),
  receipt_asset_id uuid not null references public.file_assets(id) on delete restrict,
  duplicate_flags text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected','withdrawn','reversed')),
  reject_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  actor_kind text not null check (actor_kind in ('public','admin')),
  request_id text not null unique,
  created_at timestamptz not null default now(),
  check (status <> 'rejected' or reject_reason is not null),
  check (num_nonnulls(due_id, penalty_id) = 1)
);
create unique index payment_submissions_one_live_penalty on public.payment_submissions (penalty_id)
  where status in ('pending','approved');
create unique index payment_submissions_one_live on public.payment_submissions (due_id)  -- INV02
  where status in ('pending','approved');
create index payment_submissions_status_idx on public.payment_submissions (status, created_at);
create index payment_submissions_group_idx on public.payment_submissions (group_ref);

-- ───────────────────────── M04 Matches ─────────────────────────
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  opponent text not null check (char_length(btrim(opponent)) between 1 and 120),
  match_type text not null default 'friendly' check (match_type in ('friendly','tournament')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  venue_name text not null,
  pitch_no text,
  address text,
  map_url text check (map_url is null or map_url ~ '^https?://'),
  parking_note text,
  pitch_cost_estimate numeric(14,0) check (pitch_cost_estimate >= 0),
  team_share_estimate numeric(14,0) check (team_share_estimate >= 0),
  rsvp_deadline timestamptz not null,
  coordinator text,
  note text,
  opponent_contact text,
  status text not null default 'draft' check (status in ('draft','published','postponed','cancelled','completed')),
  schedule_version int not null default 1,
  score_us int check (score_us >= 0),
  score_them int check (score_them >= 0),
  post_note text,
  attendance_complete boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (rsvp_deadline <= starts_at)
);
create index matches_status_start_idx on public.matches (status, starts_at);

create table public.match_rsvps (
  match_id uuid not null references public.matches(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  response text not null default 'no_response' check (response in ('no_response','yes','no')),
  gathering_response text not null default 'no_response' check (gathering_response in ('no_response','yes','no')),
  position_code text references public.positions(code),                     -- position the player wants to play this match
  accepted_schedule_version int not null default 1,
  private_note text check (private_note is null or char_length(private_note) <= 300),
  actor_kind text not null check (actor_kind in ('public','admin')),
  admin_user_id uuid,
  request_id text,
  changed_at timestamptz not null default now(),
  primary key (match_id, member_id)                                         -- INV07
);
create index match_rsvps_resp_idx on public.match_rsvps (match_id, response);

create table public.match_rsvp_history (
  id bigint generated always as identity primary key,
  match_id uuid not null,
  member_id uuid not null,
  response text not null,
  gathering_response text not null,
  position_code text,
  schedule_version int not null,
  actor_kind text not null,
  admin_user_id uuid,
  request_id text,
  created_at timestamptz not null default now()
);
create index match_rsvp_history_idx on public.match_rsvp_history (match_id, member_id, created_at desc);

create table public.post_match_gatherings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id) on delete restrict,
  starts_at timestamptz,
  location text,
  note text,
  status text not null default 'planned' check (status in ('planned','done','cancelled')),
  created_at timestamptz not null default now()
);

-- ───────────────────────── M05 Lineups ─────────────────────────
create table public.lineups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches(id) on delete restrict,
  formation text not null default '2-3-1' check (formation in ('2-3-1','3-2-1','2-2-2')),
  status text not null default 'draft' check (status in ('draft','published','needs_update')),
  needs_update_reason text,
  auto boolean not null default true,                                       -- auto-arranged by position + monthly form
  version int not null default 1,
  published_version int,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.lineup_slots (
  lineup_id uuid not null references public.lineups(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  role text not null check (role in ('starter','sub')),
  slot_code text check (slot_code ~ '^(GK|DEF[1-3]|MID[1-3]|FWD[1-2])$'),
  sub_order int,
  primary key (lineup_id, member_id),
  check ((role = 'starter' and slot_code is not null and sub_order is null) or (role = 'sub' and slot_code is null and sub_order is not null))
);
create unique index lineup_slots_starter_uq on public.lineup_slots (lineup_id, slot_code) where role = 'starter';

create table public.lineup_snapshots (
  id uuid primary key default gen_random_uuid(),
  lineup_id uuid not null references public.lineups(id) on delete restrict,
  version int not null,
  formation text not null,
  slots jsonb not null,
  published_at timestamptz not null default now(),
  unique (lineup_id, version)
);

-- ───────────────────────── M07 Participation ─────────────────────────
create table public.match_participations (
  match_id uuid not null references public.matches(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  actual_status text not null default 'unconfirmed' check (actual_status in ('unconfirmed','present_not_played','played','absent')),
  was_starter boolean,
  positions text[] not null default '{}',
  goals int check (goals >= 0),
  goals_confirmed boolean not null default false,
  note text,
  confirmed_by uuid,
  updated_at timestamptz not null default now(),
  primary key (match_id, member_id),                                        -- INV07
  check (goals is null or goals = 0 or actual_status = 'played'),
  check (not goals_confirmed or goals is not null)
);
create index match_participations_member_idx on public.match_participations (member_id, match_id);

-- Absence penalty: confirmed "yes" but recorded absent after the match.
create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  amount numeric(14,0) not null check (amount >= 0),
  reason text not null default 'Xác nhận tham gia nhưng vắng mặt',
  status text not null default 'unpaid' check (status in ('unpaid','paid','waived','cancelled')),
  waive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, member_id),
  check (status <> 'waived' or waive_reason is not null)
);
alter table public.payment_submissions add constraint payment_submissions_penalty_fk
  foreign key (penalty_id) references public.penalties(id) on delete restrict;

create table public.gathering_attendance (
  gathering_id uuid not null references public.post_match_gatherings(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  actual_status text not null default 'unconfirmed' check (actual_status in ('unconfirmed','attended','not_attended')),
  confirmed_by uuid,
  updated_at timestamptz not null default now(),
  primary key (gathering_id, member_id)
);

-- ───────────────────────── M06 Rewards ─────────────────────────
create table public.reward_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  description text,
  starts_on date not null,
  ends_on date not null,
  result_deadline date,
  audience text not null default 'all' check (audience in ('all','positions','selected')),
  audience_positions text[] not null default '{}',
  requires_played boolean not null default true,
  rules text not null default '',
  exclusions text,
  method text not null default 'manual' check (method in ('manual','goals')),
  tie_rule text not null default 'manager' check (tie_rule in ('tiebreak','split','manager')),
  tie_note text,
  funding_source text not null default 'fund' check (funding_source in ('fund','sponsor','item')),
  budget_max numeric(14,0) check (budget_max >= 0),
  status text not null default 'draft' check (status in ('draft','published','running','pending_final','finalized','cancelled')),
  rules_version int not null default 1,
  published_snapshot jsonb,
  finalized_by uuid,
  finalized_at timestamptz,
  cancel_reason text,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table public.reward_event_matches (
  event_id uuid not null references public.reward_events(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete restrict,
  primary key (event_id, match_id)
);

create table public.reward_event_eligible_members (
  event_id uuid not null references public.reward_events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete restrict,
  basis text,
  primary key (event_id, member_id)
);

create table public.reward_prizes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.reward_events(id) on delete cascade,
  rank int not null check (rank >= 1),
  name text not null,
  winners_count int not null default 1 check (winners_count >= 1),
  amount_each numeric(14,0) not null default 0 check (amount_each >= 0),
  item_desc text,
  unique (event_id, rank)
);

create table public.reward_results (
  id uuid primary key default gen_random_uuid(),
  prize_id uuid not null references public.reward_prizes(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  basis text not null,
  amount numeric(14,0) not null default 0 check (amount >= 0),
  delivery_status text not null default 'not_delivered' check (delivery_status in ('not_delivered','pending_payout','delivered')),
  status text not null default 'active' check (status in ('active','voided')),
  void_reason text,
  finalized_at timestamptz not null default now(),
  unique (prize_id, member_id)
);

-- ───────────────────────── M03 Fund requests & ledger ─────────────────────────
create table public.fund_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('income','expense')),
  category text not null,
  amount numeric(14,0) not null check (amount > 0),
  public_description text not null check (char_length(btrim(public_description)) between 3 and 200),
  private_note text,
  counterparty text,
  planned_date date,
  occurred_at date,
  method text check (method in ('bank','cash','ewallet')),
  status text not null default 'pending' check (status in ('draft','pending','approved','paid','recorded','rejected','cancelled')),
  already_spent boolean not null default false,
  match_id uuid references public.matches(id) on delete restrict,
  reward_result_id uuid references public.reward_results(id) on delete restrict,
  doc_asset_id uuid references public.file_assets(id) on delete restrict,
  doc_exception_note text,
  decision_reason text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind = 'expense' or status not in ('approved','paid')),
  check (kind = 'income' or status <> 'recorded')
);
create index fund_requests_status_idx on public.fund_requests (status, created_at);

-- Public donations (ủng hộ): pending until the admin confirms the money arrived.
create table public.donations (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('UH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  donor_name text check (donor_name is null or char_length(donor_name) between 2 and 80),
  anonymous boolean not null default false,
  amount numeric(14,0) not null check (amount >= 1000 and amount <= 100000000),
  message text check (message is null or char_length(message) <= 200),
  transferred_at timestamptz not null,
  receipt_asset_id uuid not null references public.file_assets(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','approved','rejected','reversed')),
  reject_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  request_id text not null unique,
  created_at timestamptz not null default now(),
  check (anonymous or donor_name is not null)
);

create table public.reward_payouts (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.reward_results(id) on delete restrict,
  fund_request_id uuid not null references public.fund_requests(id) on delete restrict,
  status text not null default 'active' check (status in ('active','cancelled')),
  created_at timestamptz not null default now()
);
create unique index reward_payouts_one_active on public.reward_payouts (result_id) where status = 'active'; -- INV10

create table public.fund_ledger (
  id uuid primary key default gen_random_uuid(),
  direction text not null check (direction in ('in','out')),
  amount numeric(14,0) not null check (amount > 0 or (is_opening and amount >= 0)),
  posting_date date not null,
  occurred_at date not null,
  posting_month text generated always as (public.month_of(posting_date)) stored,
  category text not null,
  public_description text not null,
  source_type text not null check (source_type in ('opening','payment_submission','fund_request','donation','reversal')),
  source_id uuid,
  operation text not null default 'post',
  reversal_of uuid unique references public.fund_ledger(id) on delete restrict,  -- INV05
  is_opening boolean not null default false,
  member_id uuid references public.members(id) on delete restrict,
  match_id uuid references public.matches(id) on delete restrict,
  obligation_month text,
  period_note text,
  recorded_by uuid,
  created_at timestamptz not null default now(),
  unique (source_type, source_id, operation),                               -- INV03
  check ((source_type = 'reversal') = (reversal_of is not null)),
  check ((source_type = 'opening') = is_opening)
);
create unique index fund_ledger_one_opening on public.fund_ledger (is_opening) where is_opening;
create index fund_ledger_posting_idx on public.fund_ledger (posting_date, category);
create index fund_ledger_month_idx on public.fund_ledger (posting_month, direction);

-- ───────────────────────── M08 Notifications & audit ─────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  audience text not null check (audience in ('public','admin')),
  event_key text not null unique,
  kind text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (audience = 'admin' or read_at is null)
);
create index notifications_audience_idx on public.notifications (audience, read_at, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_kind text not null check (actor_kind in ('public','admin','system')),
  admin_user_id uuid,
  claimed_member_id uuid,
  request_id text,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
