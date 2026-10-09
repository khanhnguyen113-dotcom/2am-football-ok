# 2AM FC — Quỹ đội & Lịch thi đấu

Dashboard công khai cho đội bóng sân 7 **2AM FC** (Next.js 16 + Supabase), triển khai theo `docs/2AM_FC_APP_GUIDELINE.md` v1.1.
Giao diện tối phong cách EA FC (thẻ cầu thủ, sân 7, nút xiên), dùng logo đội tại `public/brand/logo.webp`.

- **Công khai, không đăng nhập:** trang chủ (số dư, tổng thu/chi tháng, **danh sách khoản đã chi** có lọc tháng/danh mục + phân trang, **phong độ tháng** có xếp hạng), trận đấu & RSVP đi đá/liên hoan **kèm vị trí muốn đá**, **đội hình dự kiến tự xếp & lưu**, thành viên (thẻ FC) + **ai cũng sửa được tên, vị trí, ảnh thẻ**, đóng quỹ **một hoặc nhiều tháng** (100% chuyển khoản) kèm ảnh biên lai, event thưởng, thống kê.
- **Quản trị (`/admin`, một tài khoản duy nhất):** duyệt biên lai theo lần chuyển (ảnh qua signed URL 5 phút), kỳ quỹ/nghĩa vụ/miễn giảm, đề nghị thu–chi (duyệt ≠ thực chi), sổ quỹ bất biến + đảo dòng, khóa sổ tháng, số dư khởi tạo, CRUD thành viên + ảnh + khôi phục tên, trận/đổi lịch/hủy, chỉnh đội hình thủ công hoặc bật lại tự động, điểm danh thực tế + bàn thắng, liên hoan, event thưởng (thể lệ, cơ cấu giải, chốt, chi thưởng), cấu hình, audit log.

### Quỹ, loại thành viên, phạt, ủng hộ (v3)
- **Loại thành viên** (chọn trong hồ sơ admin, mức phí sửa ở Cài đặt): Chính thức 150.000 ₫ · HSSV 50.000 ₫ · Duy trì (không đá) 50.000 ₫ · Miễn phí 0 ₫. Nghĩa vụ tháng lưu snapshot theo loại tại lúc tạo.
- **Lịch thu:** mở thu từ ngày 20 tháng trước, hạn chót ngày 05. Cuối trang chủ hiện danh sách **chưa đóng quỹ** của tháng đang thu (trước ngày 20: tháng này; từ ngày 20: tháng sau).
- **Phạt vắng mặt:** xác nhận *Tham gia* mà điểm danh sau trận *Vắng mặt* → tự tạo khoản phạt 50.000 ₫ (cấu hình được). Sửa điểm danh thì khoản chưa đóng tự hủy; admin có thể miễn kèm lý do. Đóng phạt cùng form Đóng quỹ; duyệt xong ghi sổ danh mục *Tiền phạt*.
- **Ủng hộ** (/donate): ai cũng gửi được (tên hoặc ẩn danh, lời nhắn, ảnh biên lai); admin xác nhận đã nhận tiền thì vào sổ quỹ (*Ủng hộ*) và bảng vàng.
- **Admin ghi thu/chi trực tiếp** (Quỹ → *Ghi thu / chi*): khoản đã thực thu/chi ghi thẳng vào sổ trong một bước (khoản chi cần chứng từ hoặc ghi chú, không vượt quỹ khả dụng). Tab *Đề nghị thu/chi* vẫn dùng cho khoản cần duyệt trước khi trả.

### Đội hình dự kiến tự động
Mỗi khi có xác nhận/đổi lịch/cập nhật điểm danh, DB (`public.auto_lineup`) xếp lại và lưu đội hình trận sắp tới:
1. Mỗi ô (GK, hậu vệ, tiền vệ, tiền đạo theo sơ đồ) lấy người **đăng ký đúng tuyến** đó có **phong độ tháng** cao nhất.
2. Ô còn trống lấy người còn lại — ưu tiên người có **sở trường** thuộc tuyến đó, rồi tới phong độ.
3. Người còn lại vào dự bị theo phong độ.
Phong độ tháng = số trận đã thi đấu + 2 × bàn thắng đã xác nhận (hòa điểm thì xét điểm cả mùa). Quản trị lưu tay sẽ tắt tự động cho trận đó; có nút bật lại.

## Chạy local

Yêu cầu: Node 20.9+, Docker Desktop.

```bash
npm install
npx supabase start
npx supabase db reset
npm run dev
```

`.env.local` trỏ tới Supabase local (xem `.env.example`). `db reset` áp dụng migrations và `supabase/seed.sql` (dữ liệu **giả**: 14 thành viên, 3 kỳ quỹ, 5 trận, nhiệm vụ, 2 event).
Tài khoản quản trị local và tài khoản thử "không phải admin" được ghi trong đầu file `supabase/seed.sql` — chỉ dùng cho môi trường dev.
Ảnh biên lai lịch sử trong seed chỉ là bản ghi DB (không có file ảnh thật); biên lai gửi qua form thì có ảnh.

## Kiểm thử

```bash
npm run typecheck
npm run lint
npx supabase db reset
npm test
```

`tests/integration/permissions.test.ts` chạy trên Supabase local thật (cần `db reset` trước vì test ghi dữ liệu) và kiểm tra: anon không đọc bảng gốc/cột riêng; sửa hồ sơ công khai (tên, vị trí, ảnh) + xung đột version; đóng nhiều tháng chờ duyệt không cộng quỹ, sai tổng/tháng quá xa/tháng cũ không nợ bị chặn; khách không tải/list/ghi đè file biên lai; **hai lần duyệt đồng thời chỉ tạo một dòng sổ mỗi tháng**; RSVP bắt buộc vị trí, đội hình tự xếp theo vị trí + phong độ và tự lấp chỗ khi có người rút; tài khoản Auth không phải admin bị chặn trong DB; đội hình thiếu GK / người không xác nhận / version cũ bị chặn; rút RSVP làm đội hình "cần cập nhật"; duyệt chi không trừ số dư, thực chi trừ đúng một lần, đảo dòng tối đa một lần; chi vượt quỹ khả dụng bị chặn; sổ bất biến và ghi lùi vào kỳ đã khóa; RSVP không tính là ra sân.

## Kiến trúc

```
src/app/(public)/*        trang công khai — chỉ đọc view pub_* qua client anon không cookie
src/app/admin/*           khu quản trị — requireAdminPage() + require_admin() trong DB
src/server/actions/       server actions: public.ts (whitelist command), admin.ts
src/server/public-data.ts truy vấn DTO công khai
src/proxy.ts              làm mới phiên Supabase cho /admin/*
supabase/migrations/      schema, trigger (audit, version, sổ bất biến, khóa kỳ), RPC công khai/quản trị, RLS, Storage
```

Nguyên tắc chính:
- Bảng nghiệp vụ đóng hoàn toàn với `anon`; dữ liệu công khai đi qua view `pub_*` liệt kê rõ cột (không có SĐT, ngày sinh, ghi chú riêng, mã GD, chứng từ).
- Ghi công khai chỉ qua 5 RPC `SECURITY DEFINER` (hồ sơ thành viên, ảnh thẻ, đặt chỗ upload, đóng quỹ, RSVP) có whitelist trường, validation, rate limit và `actor_kind='public'`.
- Mọi RPC quản trị gọi `require_admin()` (so khớp đúng `admin_settings.admin_user_id`) — có session thôi là chưa đủ.
- Tiền: `numeric(14,0)` VND; sổ quỹ chỉ INSERT; khoản thu/chi tạo trong cùng transaction với thay đổi trạng thái, có `UNIQUE(source_type, source_id, operation)` + khóa hàng/advisory lock.
- Upload khách: server kiểm tra magic bytes + SHA-256 → DB cấp đúng một object path → Storage policy chỉ cho INSERT path đó (không list/đọc/ghi đè) → RPC đối chiếu MIME/size thực.

## Triển khai thật (chưa thực hiện)

1. Tạo project Supabase (staging trước), `npx supabase link` rồi `npx supabase db push` (**không** chạy `seed.sql`).
2. Auth: tắt "Allow new users to sign up", tạo đúng một user quản trị trong Dashboard, bật MFA nếu có thể.
3. SQL Editor: `insert into public.admin_settings (admin_user_id) values ('<uuid user quản trị>');`
4. Đặt biến môi trường `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `APP_URL` trên hosting (VD Vercel) và deploy.
5. Đăng nhập `/admin` → kiểm tra Cài đặt (tài khoản nhận tiền mặc định: NGUYEN QUOC KHANH · MBV · 55886668) → Sổ quỹ (số dư khởi tạo) → Thành viên → Kỳ quỹ.
6. Lên lịch backup DB **và** file Storage, diễn tập restore (guideline mục 18).

## Quyết định & điểm khác guideline cần chủ website xác nhận

| Mục | Hiện trạng trong app |
|---|---|
| D08 nhận diện | Logo đội do chủ đội cung cấp; màu tối kiểu FC theo yêu cầu (guideline gợi ý giao diện sáng). Tên đội/khẩu hiệu sửa ở Cài đặt. |
| D03 nghĩa vụ | 150.000 ₫, hạn ngày 05 (cấu hình). Người vào giữa kỳ/không hoạt động được đánh dấu khi sinh nghĩa vụ, quản trị tự chọn — app không tự suy ra số tiền. |
| D05 RSVP | Hạn mặc định 24h trước trận; sơ đồ mặc định 2-3-1; không hỗ trợ đá thiếu người/cầu thủ khách. |
| D07 chi quỹ | Chặn duyệt chi khi quỹ khả dụng không đủ; thực chi cần chứng từ hoặc giải trình ngoại lệ. |
| Thay đổi theo yêu cầu chủ đội (v2) | Bỏ module nhiệm vụ và trang theo dõi biên lai; đóng quỹ chỉ chuyển khoản, một biên lai cho nhiều tháng (nợ cũ hoặc đóng trước tối đa 6 tháng — app tự mở kỳ/nghĩa vụ cho tháng tương lai); khách được sửa vị trí & ảnh thẻ của bất kỳ thành viên (guideline gốc chỉ cho sửa tên), có audit. |
| D10 | Retention file (ảnh biên lai/ảnh thẻ cũ) chưa tự động dọn. |
| Mô hình dữ liệu | Phản hồi liên hoan lưu cùng RSVP trận (`match_rsvps.gathering_response`, mỗi trận ≤ 1 buổi); vị trí thực tế lưu dạng mảng trong `match_participations.positions`. |
| Rate limit | Bộ nhớ trong của từng instance + giới hạn trong DB; khi chạy nhiều instance nên thêm limiter dùng chung. |
| Thay đổi v3 | Trang chủ bỏ danh sách khoản chi và bảng tin (khoản chi xem ở Quỹ đội); thanh dưới điện thoại: Trang chủ · Trận đấu · Quỹ đội · BXH · Thêm. |
| Ngoài phạm vi | Nhiệm vụ, nhắc email/Zalo, PWA, xuất PDF, QR tự động, OCR, thanh toán online. |
