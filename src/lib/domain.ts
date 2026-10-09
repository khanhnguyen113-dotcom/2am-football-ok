// Shared labels/types for 2AM FC. Pure module — safe on client and server.

export const POSITIONS = [
  { code: "GK", name: "Thủ môn", line: "GK" },
  { code: "DEF", name: "Hậu vệ", line: "DEF" },
  { code: "MID", name: "Tiền vệ", line: "MID" },
  { code: "FWD", name: "Tiền đạo", line: "FWD" },
] as const;

export type PositionCode = (typeof POSITIONS)[number]["code"];
export type Line = "GK" | "DEF" | "MID" | "FWD";

export const POSITION_LINE: Record<string, Line> = Object.fromEntries(POSITIONS.map((p) => [p.code, p.line]));
export const POSITION_NAME: Record<string, string> = Object.fromEntries(POSITIONS.map((p) => [p.code, p.name]));

export const LINE_LABEL: Record<Line, string> = { GK: "Thủ môn", DEF: "Hậu vệ", MID: "Tiền vệ", FWD: "Tiền đạo" };

export const FORMATIONS = ["2-3-1", "3-2-1", "2-2-2"] as const;
export type Formation = (typeof FORMATIONS)[number];

export function formationSlots(f: string): string[] {
  const [d, m, w] = f.split("-").map(Number);
  return [
    "GK",
    ...Array.from({ length: d }, (_, i) => `DEF${i + 1}`),
    ...Array.from({ length: m }, (_, i) => `MID${i + 1}`),
    ...Array.from({ length: w }, (_, i) => `FWD${i + 1}`),
  ];
}

export function slotLine(slot: string): Line {
  if (slot === "GK") return "GK";
  return slot.replace(/\d+$/, "") as Line;
}

export const FOOT_LABEL: Record<string, string> = { left: "Trái", right: "Phải", both: "Cả hai", unknown: "Chưa cập nhật" };

export const MEMBER_STATUS_LABEL: Record<string, string> = {
  active: "Đang hoạt động", paused: "Tạm ngừng", left: "Đã nghỉ", archived: "Lưu trữ",
};

export const RSVP_LABEL: Record<string, string> = { no_response: "Chưa phản hồi", yes: "Có", no: "Không" };
export const GATHER_LABEL: Record<string, string> = { no_response: "Chưa phản hồi", yes: "Có", no: "Không" };

export const DUE_STATUS: Record<string, { label: string; cls: string }> = {
  paid: { label: "Đã đóng", cls: "bg-neon/15 text-neon" },
  pending: { label: "Chờ duyệt", cls: "bg-info/15 text-info" },
  unpaid: { label: "Chưa đóng", cls: "bg-warn/15 text-warn" },
  exempt: { label: "Được miễn", cls: "bg-violet/20 text-violet" },
};

export const MATCH_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Nháp", cls: "bg-white/10 text-muted" },
  published: { label: "Đã công bố", cls: "bg-neon/15 text-neon" },
  postponed: { label: "Hoãn", cls: "bg-warn/15 text-warn" },
  cancelled: { label: "Đã hủy", cls: "bg-danger/15 text-danger" },
  completed: { label: "Đã kết thúc", cls: "bg-teal/15 text-teal" },
};

export const SUBMISSION_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: "Chờ duyệt", cls: "bg-info/15 text-info" },
  approved: { label: "Đã duyệt", cls: "bg-neon/15 text-neon" },
  rejected: { label: "Từ chối", cls: "bg-danger/15 text-danger" },
  withdrawn: { label: "Đã rút", cls: "bg-white/10 text-muted" },
  reversed: { label: "Đã đảo", cls: "bg-warn/15 text-warn" },
};

export const REQUEST_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Nháp", cls: "bg-white/10 text-muted" },
  pending: { label: "Chờ duyệt", cls: "bg-info/15 text-info" },
  approved: { label: "Đã duyệt — chờ chi", cls: "bg-warn/15 text-warn" },
  paid: { label: "Đã chi", cls: "bg-neon/15 text-neon" },
  recorded: { label: "Đã ghi nhận", cls: "bg-neon/15 text-neon" },
  rejected: { label: "Từ chối", cls: "bg-danger/15 text-danger" },
  cancelled: { label: "Đã hủy", cls: "bg-white/10 text-muted" },
};

export const REWARD_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Nháp", cls: "bg-white/10 text-muted" },
  published: { label: "Đã công bố", cls: "bg-info/15 text-info" },
  running: { label: "Đang diễn ra", cls: "bg-neon/15 text-neon" },
  pending_final: { label: "Chờ chốt", cls: "bg-warn/15 text-warn" },
  finalized: { label: "Đã chốt", cls: "bg-gold/20 text-gold" },
  cancelled: { label: "Đã hủy", cls: "bg-danger/15 text-danger" },
};

export const DELIVERY_STATUS: Record<string, string> = {
  not_delivered: "Chưa trao", pending_payout: "Chờ duyệt chi", delivered: "Đã trao",
};

export const ATTEND_LABEL: Record<string, string> = {
  unconfirmed: "Chưa xác nhận", present_not_played: "Có mặt, chưa thi đấu", played: "Đã thi đấu", absent: "Vắng mặt",
};

export const FEE_TYPE_LABEL: Record<string, string> = {
  standard: "Chính thức", student: "HSSV", maintain: "Duy trì (không đá)", exempt: "Miễn phí",
};

export const PENALTY_STATUS: Record<string, { label: string; cls: string }> = {
  unpaid: { label: "Chưa đóng", cls: "bg-danger/15 text-danger" },
  pending: { label: "Chờ duyệt", cls: "bg-info/15 text-info" },
  paid: { label: "Đã đóng", cls: "bg-neon/15 text-neon" },
  waived: { label: "Được miễn", cls: "bg-violet/20 text-violet" },
};

export const METHOD_LABEL: Record<string, string> = { bank: "Chuyển khoản", cash: "Tiền mặt", ewallet: "Ví điện tử" };

export type PubMember = {
  id: string;
  full_name: string;
  nickname: string | null;
  avatar_path: string | null;
  shirt_number: number | null;
  preferred_foot: string;
  joined_on: string;
  left_on: string | null;
  status: string;
  version: number;
  fee_type: string;
  primary_position: string | null;
  positions: string[];
};

export type MemberStats = {
  member_id: string;
  appearances: number;
  goals: number;
  gatherings: number;
  rsvp_yes: number;
  rewards: number;
  paid_amount: number;
  unconfirmed: number;
};

export function displayName(m: { full_name: string; nickname: string | null }): string {
  return m.nickname || m.full_name;
}

export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
}
