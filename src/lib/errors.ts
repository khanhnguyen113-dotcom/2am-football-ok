// Maps database error codes (raised by RPCs) to user-facing Vietnamese messages.

const MESSAGES: Record<string, string> = {
  FORBIDDEN: "Bạn không có quyền thực hiện thao tác này.",
  NOT_FOUND: "Không tìm thấy dữ liệu.",
  CONFLICT: "Dữ liệu vừa được người khác cập nhật. Vui lòng tải lại và thử lại.",
  RATE_LIMITED: "Bạn thao tác quá nhanh. Vui lòng đợi một chút rồi thử lại.",
  INVALID_NAME: "Tên phải từ 2 đến 80 ký tự.",
  INVALID_NICKNAME: "Tên thường gọi phải từ 2 đến 80 ký tự.",
  INVALID_REQUEST: "Yêu cầu không hợp lệ, vui lòng tải lại trang.",
  MEMBER_INACTIVE: "Thành viên này không còn hoạt động.",
  INVALID_METHOD: "Phương thức thanh toán không hợp lệ.",
  INVALID_DATE: "Ngày không hợp lệ.",
  INVALID_CODE: "Mã giao dịch quá dài.",
  NOTE_TOO_LONG: "Ghi chú quá dài.",
  NO_OBLIGATION: "Tháng này không có nghĩa vụ đóng quỹ cho thành viên đã chọn",
  EXEMPT: "Thành viên được miễn quỹ tháng",
  AMOUNT_MISMATCH: "Số tiền không khớp với tổng phải đóng",
  ALREADY_SUBMITTED: "Đã có biên lai chờ duyệt hoặc đã duyệt cho tháng",
  FILE_INVALID: "File không hợp lệ.",
  FILE_TYPE: "Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.",
  FILE_TOO_LARGE: "File quá lớn.",
  FILE_NOT_UPLOADED: "Tải file lên chưa thành công, vui lòng thử lại.",
  NOT_PENDING: "Hồ sơ không còn ở trạng thái chờ duyệt.",
  INVALID_RESPONSE: "Lựa chọn không hợp lệ.",
  MATCH_NOT_OPEN: "Trận đấu chưa mở xác nhận.",
  RSVP_CLOSED: "Đã qua hạn xác nhận. Vui lòng liên hệ quản lý đội.",
  PENALTY_NOT_PAYABLE: "Khoản phạt không còn ở trạng thái chưa đóng.",
  POSITION_REQUIRED: "Vui lòng chọn vị trí muốn đá để xếp đội hình.",
  INVALID_POSITION: "Vị trí không hợp lệ (chọn 1–5 vị trí).",
  NO_MONTHS: "Chọn ít nhất một tháng đóng.",
  TOO_MANY_MONTHS: "Mỗi lần gửi tối đa 12 tháng.",
  MONTH_NOT_ALLOWED: "Tháng không hợp lệ hoặc quá xa (chỉ đóng trước tối đa 6 tháng)",
  SHIRT_TAKEN: "Số áo đã được thành viên đang hoạt động khác sử dụng.",
  HAS_RELATED_DATA: "Hồ sơ đã có dữ liệu liên quan — hãy lưu trữ thay vì xóa.",
  PERIOD_EXISTS: "Kỳ quỹ này đã tồn tại.",
  PERIOD_CLOSED: "Kỳ quỹ đã khóa sổ.",
  REASON_REQUIRED: "Vui lòng nhập lý do.",
  INVALID_AMOUNT: "Số tiền không hợp lệ.",
  HAS_LIVE_PAYMENT: "Nghĩa vụ đã có biên lai chờ/đã duyệt; xử lý biên lai trước.",
  OPENING_EXISTS: "Số dư khởi tạo đã được nhập.",
  OPENING_AFTER_ENTRIES: "Ngày khởi tạo phải trước mọi dòng sổ.",
  INVALID_STATUS: "Trạng thái hiện tại không cho phép thao tác này.",
  INSUFFICIENT_FUNDS: "Quỹ khả dụng không đủ cho khoản chi này.",
  INVALID_DECISION: "Thao tác không hợp lệ.",
  DOC_REQUIRED: "Cần chứng từ hoặc giải trình ngoại lệ.",
  NOT_REVERSIBLE: "Dòng sổ này không thể đảo.",
  ALREADY_REVERSED: "Dòng sổ đã được đảo trước đó.",
  PERIOD_NOT_ENDED: "Chỉ khóa sổ khi tháng đã kết thúc.",
  EARLIER_PERIOD_OPEN: "Cần khóa các kỳ trước đó trước.",
  HAS_PENDING_ITEMS: "Còn biên lai/đề nghị chờ xử lý trong kỳ.",
  RECONCILE_REQUIRED: "Nhập số tiền thực tế đối soát.",
  NOTE_REQUIRED: "Số đối soát lệch sổ — cần ghi giải thích.",
  INVALID_FORMATION: "Sơ đồ không hợp lệ.",
  MATCH_LOCKED: "Trận đã kết thúc/hủy, không sửa đội hình.",
  INVALID_SLOT: "Vị trí không thuộc sơ đồ.",
  INELIGIBLE_PLAYER: "Có cầu thủ chưa xác nhận Tham gia theo lịch hiện hành hoặc không hoạt động",
  DUPLICATE_SLOT: "Một vị trí/cầu thủ bị xếp hai lần.",
  MATCH_NOT_PUBLISHED: "Trận chưa công bố.",
  LINEUP_INCOMPLETE: "Đội hình công bố cần đúng 7 người và 1 thủ môn.",
  MATCH_CANCELLED: "Trận đã hủy.",
  MATCH_NOT_STARTED: "Trận chưa diễn ra.",
  GOALS_REQUIRE_PLAYED: "Chỉ nhập bàn thắng cho người đã thi đấu",
  EVENT_LOCKED: "Event đã chốt/hủy, không sửa được.",
  OVER_BUDGET: "Tổng giải vượt ngân sách tối đa.",
  NO_PRIZES: "Cần ít nhất một hạng giải.",
  INSUFFICIENT_DATA: "Chưa đủ căn cứ: các trận chưa hoàn tất hoặc bàn thắng chưa xác nhận.",
  INVALID_PRIZE: "Hạng giải không hợp lệ.",
  NOT_ELIGIBLE: "Thành viên không thuộc đối tượng của event",
  BASIS_REQUIRED: "Cần ghi căn cứ xét giải.",
  PRIZE_SLOTS_EXCEEDED: "Vượt số suất hoặc giá trị của hạng giải.",
  DUPLICATE_WINNER: "Một người được chọn hai lần cho cùng hạng giải.",
  NOT_FUND_REWARD: "Giải không chi từ quỹ.",
  ALREADY_DELIVERED: "Giải đã được trao.",
  USE_PAYOUT_FLOW: "Giải chi từ quỹ phải đi qua đề nghị chi.",
  HAS_PAYOUT: "Kết quả đã có khoản chi liên kết.",
  LEDGER_IMMUTABLE: "Sổ quỹ không được sửa trực tiếp.",
  NOT_ADMIN: "Tài khoản này không phải quản trị website.",
};

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; field?: string };

/** Error whose message is already safe to show to the user. */
export class UserError extends Error {}

export function errorMessage(err: unknown): string {
  if (err instanceof UserError) return err.message;
  const e = err as { message?: string; details?: string; code?: string } | null;
  const raw = e?.message ?? String(err);
  const code = raw.trim().split(/\s/)[0];
  const base = MESSAGES[code];
  if (base) return e?.details ? `${base}: ${e.details}` : base;
  if (e?.code === "23505") return "Dữ liệu bị trùng.";
  if (e?.code === "23514") return "Dữ liệu không thỏa ràng buộc.";
  console.error("[2amfc] unexpected error", raw);
  return "Có lỗi xảy ra, vui lòng thử lại.";
}

export function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: errorMessage(err) };
}
