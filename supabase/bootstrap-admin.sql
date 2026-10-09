-- 2AM FC — chỉ định tài khoản quản trị duy nhất trên Supabase project thật.
-- Bước 1: Dashboard → Authentication → Users → Add user → Create new user
--         (nhập email + mật khẩu của chủ website, tick "Auto Confirm User").
-- Bước 2: thay email bên dưới rồi chạy file này MỘT LẦN trong Dashboard → SQL Editor.
-- Không chạy supabase/seed.sql lên project thật (đó là dữ liệu demo cho máy local).

insert into public.admin_settings (admin_user_id)
select id from auth.users where email = lower('EMAIL_CUA_BAN@example.com');

-- Kiểm tra: phải trả về đúng 1 dòng
select a.admin_user_id, u.email from public.admin_settings a join auth.users u on u.id = a.admin_user_id;
