-- Run against a migrated disposable database; all fixture changes roll back.
begin;
update public.team_settings set no_vote_effective_from=now()-interval '1 day', penalty_no_vote=50000;
insert into public.members (id,full_name,status,fee_type,created_at,joined_on) values
 ('fa000000-0000-4000-8000-000000000001','HSSV miễn quỹ','active','student_exempt',now()-interval '2 days',current_date-2),
 ('fa000000-0000-4000-8000-000000000002','Không vote','active','standard',now()-interval '2 days',current_date-2),
 ('fa000000-0000-4000-8000-000000000003','Đang nghỉ','paused','standard',now()-interval '2 days',current_date-2),
 ('fa000000-0000-4000-8000-000000000004','Đã quay lại','active','standard',now()-interval '2 days',current_date-2),
 ('fa000000-0000-4000-8000-000000000005','Đã vote không','active','standard',now()-interval '2 days',current_date-2),
 ('fa000000-0000-4000-8000-000000000006','Vote có nhưng vắng','active','standard',now()-interval '2 days',current_date-2),
 ('fa000000-0000-4000-8000-000000000007','Mới gia nhập','active','standard',now(),current_date),
 ('fa000000-0000-4000-8000-000000000008','Nghỉ giữa hạn vote và trận','active','standard',now()-interval '2 days',current_date-2);
insert into public.audit_logs (actor_kind,action,entity,entity_id,before,after,created_at) values
 ('admin','UPDATE','members','fa000000-0000-4000-8000-000000000004','{"status":"paused","version":1}','{"status":"active","version":2}',now()),
 ('admin','UPDATE','members','fa000000-0000-4000-8000-000000000008','{"status":"active","version":1}','{"status":"paused","version":2}',now()-interval '90 minutes'),
 ('admin','UPDATE','members','fa000000-0000-4000-8000-000000000008','{"status":"paused","version":2}','{"status":"active","version":3}',now()-interval '70 minutes');
insert into public.matches (id,opponent,starts_at,venue_name,rsvp_deadline,status) values
 ('fb000000-0000-4000-8000-000000000001','Test miễn vote',now()-interval '1 hour','Sân thử',now()-interval '2 hours','completed');
insert into public.match_rsvps (match_id,member_id,response,accepted_schedule_version,actor_kind) values
 ('fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000005','no',1,'admin'),
 ('fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000006','yes',1,'admin');
insert into public.match_participations (match_id,member_id,actual_status) values
 ('fb000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000006','absent');
select public.sync_penalties('fb000000-0000-4000-8000-000000000001');
select public.sync_penalties('fb000000-0000-4000-8000-000000000001');
do $$ begin
  if (select count(*) from public.penalties where match_id='fb000000-0000-4000-8000-000000000001') <> 3 then
    raise exception 'Expected exactly 3 fines; paused, resumed, voted-no and new members must be exempt';
  end if;
  if not exists (select 1 from public.penalties where member_id='fa000000-0000-4000-8000-000000000001'
    and reason='Không vote xác nhận tham gia' and amount=50000) then raise exception 'HSSV exemption incorrectly exempts missing votes'; end if;
  if public.member_fee('fa000000-0000-4000-8000-000000000001') <> 0 then raise exception 'Student fee must be zero'; end if;
end $$;
-- Only completed matches get no-vote fines. Absence still follows attendance.
update public.matches set status='published' where id='fb000000-0000-4000-8000-000000000001';
select public.sync_penalties('fb000000-0000-4000-8000-000000000001');
do $$ begin
  if (select count(*) from public.penalties where match_id='fb000000-0000-4000-8000-000000000001' and status='unpaid') <> 1
    then raise exception 'Missing vote charged before match completion'; end if;
end $$;
update public.matches set status='completed' where id='fb000000-0000-4000-8000-000000000001';
select public.sync_penalties('fb000000-0000-4000-8000-000000000001');
update public.penalties set status='paid' where member_id='fa000000-0000-4000-8000-000000000001';
update public.penalties set status='waived',waive_reason='Test' where member_id='fa000000-0000-4000-8000-000000000002';
update public.team_settings set penalty_no_vote=60000;
select public.sync_penalties('fb000000-0000-4000-8000-000000000001');
do $$ begin
  if not exists(select 1 from public.penalties where member_id='fa000000-0000-4000-8000-000000000001' and status='paid' and amount=50000)
    then raise exception 'Paid fine rewritten'; end if;
  if not exists(select 1 from public.penalties where member_id='fa000000-0000-4000-8000-000000000002' and status='waived' and amount=50000)
    then raise exception 'Waived fine rewritten'; end if;
end $$;
update public.matches set status='cancelled' where id='fb000000-0000-4000-8000-000000000001';
select public.sync_penalties('fb000000-0000-4000-8000-000000000001');
do $$ begin
  if exists(select 1 from public.penalties where match_id='fb000000-0000-4000-8000-000000000001' and status='unpaid')
    then raise exception 'Cancelled match retained unpaid fines'; end if;
end $$;
-- Old matches must not gain retrospective no-vote fines.
update public.matches set status='completed' where id='fb000000-0000-4000-8000-000000000001';
update public.team_settings set no_vote_effective_from=now();
select public.sync_penalties('fb000000-0000-4000-8000-000000000001');
do $$ begin
  if exists(select 1 from public.penalties where match_id='fb000000-0000-4000-8000-000000000001' and status='unpaid' and reason='Không vote xác nhận tham gia')
    then raise exception 'Retroactive no-vote fine'; end if;
end $$;
rollback;
