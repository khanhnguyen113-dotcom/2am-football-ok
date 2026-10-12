-- Fee exemption is independent of participation status and vote obligations.
alter table public.members drop constraint members_fee_type_check;
alter table public.members add constraint members_fee_type_check
  check (fee_type in ('standard', 'student', 'student_exempt', 'maintain', 'exempt'));

-- member_fee() and feeFor() already return zero for exempt fee types.
