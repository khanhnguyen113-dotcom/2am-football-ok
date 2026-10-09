-- 2AM FC — LOCAL/DEMO SEED ONLY. Fake people & money. Never run against production.
-- Local admin login (test credentials for this dev environment only):
--   email:    admin@2amfc.local
--   password: Owl-2am-Local!2026

-- ───────── Admin account (single website owner) ─────────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'admin@2amfc.local', extensions.crypt('Owl-2am-Local!2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001',
  jsonb_build_object('sub', 'a0000000-0000-4000-8000-000000000001', 'email', 'admin@2amfc.local', 'email_verified', true),
  'email', now(), now(), now());
insert into public.admin_settings (admin_user_id) values ('a0000000-0000-4000-8000-000000000001');

-- A second Auth account that is NOT the admin (used by permission tests AT27). Local test value only.
--   email: outsider@2amfc.local · password: Outsider-Local!2026
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
  'outsider@2amfc.local', extensions.crypt('Outsider-Local!2026', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), 'b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
  jsonb_build_object('sub', 'b0000000-0000-4000-8000-000000000002', 'email', 'outsider@2amfc.local', 'email_verified', true),
  'email', now(), now(), now());

-- ───────── Members (fake) ─────────
insert into public.members (id, full_name, nickname, shirt_number, preferred_foot, joined_on, status) values
  ('10000000-0000-4000-8000-000000000001', 'Nguyễn Văn An', 'An Gôn', 1, 'right', '2025-01-10', 'active'),
  ('10000000-0000-4000-8000-000000000002', 'Trần Minh Bảo', null, 4, 'right', '2025-01-10', 'active'),
  ('10000000-0000-4000-8000-000000000003', 'Lê Hoàng Cường', null, 5, 'right', '2025-01-10', 'active'),
  ('10000000-0000-4000-8000-000000000004', 'Phạm Đức Dũng', 'Dũng Trái', 3, 'left', '2025-02-01', 'active'),
  ('10000000-0000-4000-8000-000000000005', 'Hoàng Quốc Huy', null, 2, 'right', '2025-02-01', 'active'),
  ('10000000-0000-4000-8000-000000000006', 'Vũ Thành Long', null, 6, 'both', '2025-01-10', 'active'),
  ('10000000-0000-4000-8000-000000000007', 'Đặng Tuấn Kiệt', null, 8, 'right', '2025-03-15', 'active'),
  ('10000000-0000-4000-8000-000000000008', 'Bùi Gia Khánh', 'Khánh Mười', 10, 'left', '2025-01-10', 'active'),
  ('10000000-0000-4000-8000-000000000009', 'Đỗ Nhật Nam', null, 11, 'left', '2025-04-01', 'active'),
  ('10000000-0000-4000-8000-000000000010', 'Ngô Thanh Phong', null, 7, 'right', '2025-04-01', 'active'),
  ('10000000-0000-4000-8000-000000000011', 'Dương Văn Quân', 'Quân Sát Thủ', 9, 'right', '2025-01-10', 'active'),
  ('10000000-0000-4000-8000-000000000012', 'Lý Minh Tâm', null, 17, 'both', '2025-06-01', 'active'),
  ('10000000-0000-4000-8000-000000000013', 'Phan Hữu Thắng', null, 12, 'right', '2025-06-01', 'active'),
  ('10000000-0000-4000-8000-000000000014', 'Mai Xuân Vinh', null, 14, 'right', '2025-02-01', 'active');

-- member types: miễn phí / HSSV / duy trì (không tham gia đá); others are standard (150.000 ₫)
update public.members set fee_type = 'exempt' where id = '10000000-0000-4000-8000-000000000013';
update public.members set fee_type = 'student' where id = '10000000-0000-4000-8000-000000000012';
update public.members set fee_type = 'maintain' where id = '10000000-0000-4000-8000-000000000014';

insert into public.member_positions (member_id, position_code, is_primary) values
  ('10000000-0000-4000-8000-000000000001','GK',true),
  ('10000000-0000-4000-8000-000000000002','DEF',true),
  ('10000000-0000-4000-8000-000000000003','DEF',true),
  ('10000000-0000-4000-8000-000000000004','DEF',true), ('10000000-0000-4000-8000-000000000004','MID',false),
  ('10000000-0000-4000-8000-000000000005','DEF',true),
  ('10000000-0000-4000-8000-000000000006','MID',true),
  ('10000000-0000-4000-8000-000000000007','MID',true),
  ('10000000-0000-4000-8000-000000000008','MID',true),
  ('10000000-0000-4000-8000-000000000009','MID',true),
  ('10000000-0000-4000-8000-000000000010','MID',true), ('10000000-0000-4000-8000-000000000010','FWD',false),
  ('10000000-0000-4000-8000-000000000011','FWD',true),
  ('10000000-0000-4000-8000-000000000012','FWD',true), ('10000000-0000-4000-8000-000000000012','MID',false),
  ('10000000-0000-4000-8000-000000000013','GK',true), ('10000000-0000-4000-8000-000000000013','DEF',false),
  ('10000000-0000-4000-8000-000000000014','MID',true);

insert into public.member_private_details (member_id, phone, birth_date)
select id, '09000000' || lpad(right(id::text, 2), 2, '0'), date '1995-01-01' + (right(id::text, 2)::int * 97) from public.members;

-- ───────── Act as admin for commands ─────────
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', false);

select public.admin_set_opening_balance(1500000, '2026-08-01');
select public.admin_create_period('2026-08', '2026-08-05');
select public.admin_create_period('2026-09', '2026-09-05');
select public.admin_create_period('2026-10', '2026-10-05');
select public.admin_generate_dues('2026-08', array(select id from public.members));
select public.admin_generate_dues('2026-09', array(select id from public.members where status = 'active'));
select public.admin_generate_dues('2026-10', array(select id from public.members where status = 'active'));

-- Historic Aug/Sep collections (demo history inserted directly, posted in their own months)
do $$
declare d record; v_asset uuid; v_sub uuid; v_day int;
begin
  for d in select md.*, m.full_name from public.monthly_dues md join public.members m on m.id = md.member_id
           where md.obligation_month in ('2026-08','2026-09') and md.amount_due > 0
             and not (md.obligation_month = '2026-09' and md.member_id = '10000000-0000-4000-8000-000000000012')
  loop
    v_day := 1 + (abs(hashtext(d.member_id::text || d.obligation_month)) % 6);
    insert into public.file_assets (bucket, object_path, purpose, mime, size_bytes, sha256, actor_kind, status, created_at)
    values ('receipts', 'seed/' || d.id || '.png', 'receipt', 'image/png', 1000,
            encode(sha256(convert_to(d.id::text, 'UTF8')), 'hex'), 'public', 'ready',
            (d.obligation_month || '-0' || v_day || ' 20:00+07')::timestamptz) returning id into v_asset;
    insert into public.payment_submissions (group_ref, due_id, member_id, amount, transferred_at, method, receipt_asset_id, status,
      reviewed_by, reviewed_at, actor_kind, request_id, created_at)
    values ('NQ-' || upper(substr(md5(d.id::text), 1, 8)), d.id, d.member_id, d.amount_due, (d.obligation_month || '-0' || v_day || ' 20:00+07')::timestamptz, 'bank', v_asset, 'approved',
      'a0000000-0000-4000-8000-000000000001', (d.obligation_month || '-0' || v_day || ' 22:00+07')::timestamptz, 'public', 'seed-' || d.id,
      (d.obligation_month || '-0' || v_day || ' 20:00+07')::timestamptz)
    returning id into v_sub;
    insert into public.fund_ledger (direction, amount, posting_date, occurred_at, category, public_description, source_type, source_id,
      member_id, obligation_month, recorded_by)
    values ('in', d.amount_due, (d.obligation_month || '-0' || v_day)::date, (d.obligation_month || '-0' || v_day)::date, 'Quỹ tháng',
      'Quỹ tháng ' || d.obligation_month || ' — ' || public.member_label(d.member_id), 'payment_submission', v_sub, d.member_id,
      d.obligation_month, 'a0000000-0000-4000-8000-000000000001');
  end loop;
end $$;

-- Historic matches
insert into public.matches (id, opponent, match_type, starts_at, ends_at, venue_name, pitch_no, address, map_url, rsvp_deadline,
  pitch_cost_estimate, team_share_estimate, status, score_us, score_them, attendance_complete) values
  ('20000000-0000-4000-8000-000000000001', 'FC Cú Đêm', 'friendly', '2026-09-19 20:00+07', '2026-09-19 21:30+07', 'Sân Chảo Lửa', '3',
   '30 Phan Thúc Duyện, Tân Bình, TP.HCM', 'https://maps.google.com/?q=San+Chao+Lua', '2026-09-18 20:00+07', 900000, 450000, 'completed', 4, 2, true),
  ('20000000-0000-4000-8000-000000000002', 'Kỹ Sư United', 'friendly', '2026-09-26 20:00+07', '2026-09-26 21:30+07', 'Sân Chảo Lửa', '2',
   '30 Phan Thúc Duyện, Tân Bình, TP.HCM', 'https://maps.google.com/?q=San+Chao+Lua', '2026-09-25 20:00+07', 900000, 450000, 'completed', 2, 2, true),
  ('20000000-0000-4000-8000-000000000003', 'Lão Tướng FC', 'tournament', '2026-10-03 20:00+07', '2026-10-03 21:30+07', 'Sân K334', '1',
   'Đường Thành Thái, Quận 10, TP.HCM', 'https://maps.google.com/?q=San+K334', '2026-10-02 20:00+07', 1000000, 500000, 'completed', 3, 1, true);

do $$
declare
  v_m1 uuid := '20000000-0000-4000-8000-000000000001'; v_m2 uuid := '20000000-0000-4000-8000-000000000002'; v_m3 uuid := '20000000-0000-4000-8000-000000000003';
  p text := '10000000-0000-4000-8000-0000000000';
begin
  insert into public.match_rsvps (match_id, member_id, response, gathering_response, actor_kind)
  select mm, m.id, case when right(m.id::text, 2)::int % 5 = 0 then 'no' else 'yes' end, case when right(m.id::text, 2)::int % 2 = 0 then 'yes' else 'no' end, 'public'
  from unnest(array[v_m1, v_m2, v_m3]) mm cross join public.members m where m.status = 'active';

  insert into public.match_participations (match_id, member_id, actual_status, was_starter, positions, goals, goals_confirmed) values
    (v_m1, (p||'01')::uuid, 'played', true, '{GK}', 0, true), (v_m1, (p||'02')::uuid, 'played', true, '{DEF}', 0, true),
    (v_m1, (p||'03')::uuid, 'played', true, '{DEF}', 1, true), (v_m1, (p||'06')::uuid, 'played', true, '{MID}', 0, true),
    (v_m1, (p||'07')::uuid, 'played', true, '{MID}', 0, true), (v_m1, (p||'08')::uuid, 'played', true, '{MID}', 1, true),
    (v_m1, (p||'11')::uuid, 'played', true, '{FWD}', 2, true), (v_m1, (p||'12')::uuid, 'played', false, '{FWD}', 0, true),
    (v_m1, (p||'05')::uuid, 'absent', null, '{}', null, false), (v_m1, (p||'09')::uuid, 'present_not_played', false, '{}', null, false),
    (v_m2, (p||'13')::uuid, 'played', true, '{GK}', 0, true), (v_m2, (p||'02')::uuid, 'played', true, '{DEF}', 0, true),
    (v_m2, (p||'04')::uuid, 'played', true, '{DEF}', 0, true), (v_m2, (p||'06')::uuid, 'played', true, '{MID}', 0, true),
    (v_m2, (p||'08')::uuid, 'played', true, '{MID}', 1, true), (v_m2, (p||'09')::uuid, 'played', true, '{MID}', 0, true),
    (v_m2, (p||'11')::uuid, 'played', true, '{FWD}', 1, true), (v_m2, (p||'12')::uuid, 'played', false, '{FWD}', 0, true),
    (v_m3, (p||'01')::uuid, 'played', true, '{GK}', 0, true), (v_m3, (p||'02')::uuid, 'played', true, '{DEF}', 0, true),
    (v_m3, (p||'03')::uuid, 'played', true, '{DEF}', 0, true), (v_m3, (p||'04')::uuid, 'played', true, '{DEF}', 0, true),
    (v_m3, (p||'07')::uuid, 'played', true, '{MID}', 1, true), (v_m3, (p||'08')::uuid, 'played', true, '{MID}', 0, true),
    (v_m3, (p||'11')::uuid, 'played', true, '{FWD}', 2, true), (v_m3, (p||'12')::uuid, 'played', false, '{FWD,MID}', 0, true),
    (v_m3, (p||'10')::uuid, 'played', false, '{MID}', 0, true),
    (v_m3, (p||'06')::uuid, 'absent', null, '{}', null, false);  -- confirmed yes but absent: penalty

  insert into public.post_match_gatherings (id, match_id, starts_at, location, status) values
    ('30000000-0000-4000-8000-000000000001', v_m1, '2026-09-19 22:00+07', 'Quán nướng Ba Cây Trâm', 'done'),
    ('30000000-0000-4000-8000-000000000003', v_m3, '2026-10-03 22:00+07', 'Lẩu dê Hoàng Hoa Thám', 'done');
  insert into public.gathering_attendance (gathering_id, member_id, actual_status)
  select '30000000-0000-4000-8000-000000000001', id, case when right(id::text, 2)::int % 2 = 0 then 'attended' else 'not_attended' end
  from public.members where status = 'active';
  insert into public.gathering_attendance (gathering_id, member_id, actual_status)
  select '30000000-0000-4000-8000-000000000003', id, case when right(id::text, 2)::int % 3 = 0 then 'not_attended' else 'attended' end
  from public.members where status = 'active';
end $$;

select public.sync_penalties(id) from public.matches where status = 'completed';

-- Historic expenses (Aug/Sep) inserted as paid requests + ledger rows
do $$
declare r record; v_id uuid;
begin
  for r in select * from (values
    ('Tiền sân', 450000, 'Tiền sân tuần 1 tháng 8', '2026-08-08'::date, null::uuid),
    ('Tiền sân', 450000, 'Tiền sân tuần 2 tháng 8', '2026-08-15'::date, null),
    ('Nước uống', 120000, 'Nước suối + đá tháng 8', '2026-08-15'::date, null),
    ('Dụng cụ', 350000, 'Mua 1 quả bóng size 5', '2026-08-20'::date, null),
    ('Tiền sân', 450000, 'Tiền sân tuần 4 tháng 8', '2026-08-29'::date, null),
    ('Tiền sân', 450000, 'Tiền sân vs FC Cú Đêm', '2026-09-19'::date, '20000000-0000-4000-8000-000000000001'::uuid),
    ('Nước uống', 80000, 'Nước uống trận vs FC Cú Đêm', '2026-09-19'::date, '20000000-0000-4000-8000-000000000001'::uuid),
    ('Tiền sân', 450000, 'Tiền sân vs Kỹ Sư United', '2026-09-26'::date, '20000000-0000-4000-8000-000000000002'::uuid),
    ('Liên hoan', 600000, 'Phụ thu liên hoan từ quỹ (trận 19/09)', '2026-09-20'::date, '20000000-0000-4000-8000-000000000001'::uuid)
  ) as t(category, amount, descr, d, match_id)
  loop
    insert into public.fund_requests (kind, category, amount, public_description, status, occurred_at, match_id, created_by, approved_by, approved_at, doc_exception_note)
    values ('expense', r.category, r.amount, r.descr, 'paid', r.d, r.match_id, 'a0000000-0000-4000-8000-000000000001',
            'a0000000-0000-4000-8000-000000000001', r.d, 'Dữ liệu demo') returning id into v_id;
    insert into public.fund_ledger (direction, amount, posting_date, occurred_at, category, public_description, source_type, source_id, match_id, recorded_by)
    values ('out', r.amount, r.d, r.d, r.category, r.descr, 'fund_request', v_id, r.match_id, 'a0000000-0000-4000-8000-000000000001');
  end loop;
end $$;

select public.admin_close_period('2026-08', (select coalesce(sum(case direction when 'in' then amount else -amount end), 0)
  from public.fund_ledger where posting_month <= '2026-08'), null);

-- ───────── October flows through the real commands ─────────
-- Expense for Oct 3 match: request → approve → record paid
do $$
declare v_id uuid;
begin
  v_id := public.admin_create_fund_request(jsonb_build_object('kind','expense','category','Tiền sân','amount',500000,
    'public_description','Tiền sân vs Lão Tướng FC','planned_date','2026-10-03','method','bank','match_id','20000000-0000-4000-8000-000000000003'));
  perform public.admin_decide_fund_request(v_id, 'approve', null, null);
  perform public.admin_record_expense_paid(v_id, '2026-10-03', 500000, null, 'Chủ sân không xuất hóa đơn (demo)');

  v_id := public.admin_create_fund_request(jsonb_build_object('kind','income','category','Tài trợ','amount',500000,
    'public_description','Anh Bảo tài trợ nước tháng 10'));
  perform public.admin_decide_fund_request(v_id, 'approve', null, '2026-10-02');

  v_id := public.admin_create_fund_request(jsonb_build_object('kind','expense','category','Dụng cụ','amount',420000,
    'public_description','Mua bộ áo bib 2 màu','planned_date','2026-10-12'));
end $$;

-- Guest receipts (anon) → admin approves some
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$
declare r record; v_up jsonb; v_res jsonb; i int := 0; v_months text[];
begin
  for r in select md.member_id, md.amount_due from public.monthly_dues md
           where md.obligation_month = '2026-10' and md.amount_due > 0 order by md.member_id limit 10
  loop
    i := i + 1;
    -- the first member prepays October + November in one transfer (multi-month payment)
    v_months := case when i = 1 then array['2026-10','2026-11'] else array['2026-10'] end;
    v_up := public.begin_public_upload('receipt', 'image/png', 2048, encode(sha256(convert_to('oct' || r.member_id, 'UTF8')), 'hex'));
    insert into storage.objects (bucket_id, name, metadata)
    values (v_up->>'bucket', v_up->>'path', jsonb_build_object('mimetype', 'image/png', 'size', 2048));
    v_res := public.submit_public_payment(r.member_id, v_months, '{}', r.amount_due * cardinality(v_months),
      ('2026-10-0' || (1 + i % 7) || ' 21:00+07')::timestamptz, (v_up->>'asset_id')::uuid, 'seed-oct-' || r.member_id);
  end loop;
  -- donations
  for i in 1..2 loop
    v_up := public.begin_public_upload('receipt', 'image/png', 3000 + i, encode(sha256(convert_to('donation' || i, 'UTF8')), 'hex'));
    insert into storage.objects (bucket_id, name, metadata)
    values (v_up->>'bucket', v_up->>'path', jsonb_build_object('mimetype', 'image/png', 'size', 3000 + i));
    perform public.submit_public_donation(case i when 1 then 'Chị Lan (fan cứng)' else null end, i = 2,
      case i when 1 then 300000 else 200000 end, case i when 1 then 'Chúc 2AM FC đá hay, giữ lửa sân 7!' else null end,
      '2026-10-06 20:00+07', (v_up->>'asset_id')::uuid, 'seed-donation-' || i);
  end loop;
end $$;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
select public.admin_approve_payment(s.id) from (select id from public.payment_submissions where status = 'pending' order by created_at, reference limit 9) s;
select public.admin_review_donation((select id from public.donations where donor_name like 'Chị Lan%'), 'approve', null);
select public.admin_reject_payment((select id from public.payment_submissions where status = 'pending' order by created_at limit 1),
  'Ảnh biên lai bị mờ, không đọc được số tiền (demo)');

-- Upcoming match (relative to seed time) + RSVPs with chosen positions → lineup is auto-arranged
insert into public.matches (id, opponent, match_type, starts_at, ends_at, venue_name, pitch_no, address, map_url, parking_note,
  rsvp_deadline, pitch_cost_estimate, team_share_estimate, coordinator, status)
values ('20000000-0000-4000-8000-000000000004', 'Bóng Đêm FC', 'friendly',
  ((public.vn_today() + 2)::text || ' 20:00+07')::timestamptz, ((public.vn_today() + 2)::text || ' 21:30+07')::timestamptz,
  'Sân Chảo Lửa', '3', '30 Phan Thúc Duyện, Tân Bình, TP.HCM', 'https://maps.google.com/?q=San+Chao+Lua',
  'Gửi xe trong hẻm, tập trung cổng sân 19:40', ((public.vn_today() + 1)::text || ' 20:00+07')::timestamptz,
  1000000, 500000, 'Khánh Mười', 'published');
insert into public.matches (id, opponent, starts_at, venue_name, rsvp_deadline, status)
values ('20000000-0000-4000-8000-000000000005', 'Đối thủ chưa chốt', ((public.vn_today() + 9)::text || ' 20:00+07')::timestamptz,
  'Sân K334', ((public.vn_today() + 8)::text || ' 20:00+07')::timestamptz, 'draft');

select set_config('request.jwt.claims', '{"role":"anon"}', false);
select public.set_public_rsvp('20000000-0000-4000-8000-000000000004', m.id,
  case when right(m.id::text, 2) in ('05','09','10') then 'no' else 'yes' end,
  case when right(m.id::text, 2)::int % 2 = 0 then 'yes' else 'no' end,
  case when right(m.id::text, 2) = '12' then 'MID'
       else (select mp.position_code from public.member_positions mp where mp.member_id = m.id and mp.is_primary) end,
  null, 'seed-rsvp-' || m.id)
from public.members m where m.status = 'active' and right(m.id::text, 2) not in ('13', '14');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', false);
select public.admin_save_gathering('20000000-0000-4000-8000-000000000004',
  jsonb_build_object('starts_at', ((public.vn_today() + 2)::text || ' 22:00+07'), 'location', 'Ốc Đêm Cô Ba', 'status', 'planned'), '[]');

-- Reward events
do $$
declare v_ev uuid; v_ev2 uuid; v_prize uuid; v_req uuid; v_res uuid;
begin
  v_ev := public.admin_save_reward_event(null, jsonb_build_object('title', 'Vua phá lưới cuối tháng 9', 'description', 'Ghi nhiều bàn nhất 2 trận 19/09 và 26/09',
    'starts_on', '2026-09-19', 'ends_on', '2026-09-27', 'audience', 'all', 'requires_played', true, 'method', 'goals', 'tie_rule', 'split',
    'rules', 'Tổng bàn thắng cá nhân đã xác nhận trong các trận hợp lệ; không tính trận hủy. Đồng hạng chia đều.',
    'funding_source', 'fund', 'budget_max', 150000),
    array['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002']::uuid[],
    '[{"name":"Vua phá lưới","winners_count":1,"amount_each":150000}]'::jsonb, null, null, null);
  perform public.admin_set_reward_status(v_ev, 'published', null);
  select id into v_prize from public.reward_prizes where event_id = v_ev;
  perform public.admin_finalize_reward(v_ev, jsonb_build_array(jsonb_build_object('prize_id', v_prize,
    'member_id', '10000000-0000-4000-8000-000000000011', 'basis', '3 bàn trong 2 trận (cao nhất)')));
  select id into v_res from public.reward_results where prize_id = v_prize;
  v_req := public.admin_request_reward_payout(v_res);
  perform public.admin_decide_fund_request(v_req, 'approve', null, null);
  perform public.admin_record_expense_paid(v_req, public.vn_today(), 150000, null, 'Chuyển khoản trực tiếp (demo)');

  v_ev2 := public.admin_save_reward_event(null, jsonb_build_object('title', 'Hậu vệ xuất sắc nhất tuần', 'description', 'Bình chọn hậu vệ chơi hay nhất trận sắp tới',
    'starts_on', public.vn_today(), 'ends_on', public.vn_today() + 3, 'audience', 'positions', 'audience_positions', jsonb_build_array('DEF'),
    'requires_played', true, 'method', 'manual', 'tie_rule', 'manager',
    'rules', 'Thực tế ra sân ở vị trí phòng ngự; quản lý đánh giá theo thể lệ công bố, ghi lý do.', 'funding_source', 'fund', 'budget_max', 100000),
    array['20000000-0000-4000-8000-000000000004']::uuid[], '[{"name":"Hậu vệ của tuần","winners_count":1,"amount_each":100000}]'::jsonb, null, null, null);
  perform public.admin_set_reward_status(v_ev2, 'published', null);
end $$;

select set_config('request.jwt.claims', '', false);
