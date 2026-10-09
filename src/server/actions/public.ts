"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { publicDb } from "@/lib/supabase/public";
import { fail, type ActionResult } from "@/lib/errors";
import { rateLimit, readUpload } from "@/lib/request-guard";
import { localInputToIso } from "@/lib/format";
import { POSITIONS } from "@/lib/domain";

// Public commands. Each one is a whitelisted RPC; the payload never reaches a generic table update.

const uuid = z.string().uuid();
const requestId = z.string().regex(/^[A-Za-z0-9-]{8,80}$/);
const positionCode = z.enum(POSITIONS.map((p) => p.code) as [string, ...string[]]);

/** Upload a guest file into the exact object path reserved by the database (insert-only, no overwrite). */
async function uploadGuestFile(purpose: "receipt" | "avatar", file: FormDataEntryValue | null, required: boolean) {
  const up = await readUpload(file, { maxBytes: (purpose === "avatar" ? 5 : 10) * 1024 * 1024, required });
  if (up === null) return { ok: true as const, assetId: null };
  if (!up.ok) return up;
  const { data: res, error } = await publicDb().rpc("begin_public_upload", {
    p_purpose: purpose, p_mime: up.mime, p_size: up.size, p_sha256: up.sha256,
  });
  if (error) return fail(error);
  const { error: upErr } = await publicDb().storage.from(res.bucket).upload(res.path, up.bytes, { contentType: up.mime, upsert: false });
  if (upErr) {
    console.error("[2amfc] upload failed", upErr.message);
    return { ok: false as const, error: "Tải ảnh lên thất bại, vui lòng thử lại." };
  }
  return { ok: true as const, assetId: res.asset_id as string };
}

// ───────── Member profile: name, nickname, positions, photo (anyone, any member) ─────────
const profileSchema = z.object({
  member_id: uuid,
  full_name: z.string().trim().min(2, "Tên phải từ 2 ký tự").max(80, "Tên tối đa 80 ký tự"),
  nickname: z.string().trim().max(80).optional().transform((v) => (v ? v : null)),
  positions: z.array(positionCode).min(1, "Chọn ít nhất một vị trí").max(5, "Tối đa 5 vị trí"),
  primary: positionCode.optional(),
  version: z.coerce.number().int().positive(),
  request_id: requestId,
});

export async function profileAction(_: unknown, fd: FormData): Promise<ActionResult<{ version: number }>> {
  const parsed = profileSchema.safeParse({
    member_id: fd.get("member_id"), full_name: fd.get("full_name"), nickname: fd.get("nickname") ?? undefined,
    positions: fd.getAll("positions"), primary: fd.get("primary") || undefined, version: fd.get("version"), request_id: fd.get("request_id"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (d.nickname && d.nickname.length < 2) return { ok: false, error: "Tên thường gọi phải từ 2 ký tự." };
  if (!(await rateLimit("profile", 10, 60_000))) return { ok: false, error: "Bạn thao tác quá nhanh, thử lại sau ít phút." };

  const { data, error } = await publicDb().rpc("update_public_member_profile", {
    p_member_id: d.member_id, p_full_name: d.full_name, p_nickname: d.nickname, p_positions: d.positions,
    p_primary: d.primary ?? null, p_expected_version: d.version, p_request_id: d.request_id,
  });
  if (error) return fail(error);
  let version = data.version as number;

  const photo = fd.get("avatar");
  if (photo instanceof File && photo.size > 0) {
    const up = await uploadGuestFile("avatar", photo, false);
    if (!up.ok) return up;
    const { data: av, error: avErr } = await publicDb().rpc("set_public_member_avatar", {
      p_member_id: d.member_id, p_asset_id: up.assetId, p_request_id: `${d.request_id}-avatar`,
    });
    if (avErr) return fail(avErr);
    version = av.version;
  }
  revalidatePath("/", "layout");
  return { ok: true, data: { version }, message: "Đã lưu hồ sơ." };
}

// ───────── RSVP with chosen position ─────────
const rsvpSchema = z.object({
  match_id: uuid,
  member_id: uuid,
  response: z.enum(["yes", "no"]),
  gathering_response: z.enum(["yes", "no", "no_response"]),
  position_code: positionCode.optional(),
  note: z.string().max(300).optional(),
  request_id: requestId,
});

export async function rsvpAction(_: unknown, fd: FormData): Promise<ActionResult> {
  const parsed = rsvpSchema.safeParse({ ...Object.fromEntries(fd), position_code: fd.get("position_code") || undefined });
  if (!parsed.success) return { ok: false, error: "Vui lòng chọn tên, phản hồi và vị trí." };
  const d = parsed.data;
  if (d.response !== "no" && !d.position_code) return { ok: false, error: "Vui lòng chọn vị trí muốn đá để xếp đội hình." };
  if (!(await rateLimit("rsvp", 30, 60_000))) return { ok: false, error: "Bạn thao tác quá nhanh, thử lại sau ít phút." };
  const { error } = await publicDb().rpc("set_public_rsvp", {
    p_match_id: d.match_id, p_member_id: d.member_id, p_response: d.response, p_gathering_response: d.gathering_response,
    p_position_code: d.response === "no" ? null : d.position_code, p_note: d.note?.trim() || null, p_request_id: d.request_id,
  });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return { ok: true, message: "Đã ghi nhận — đội hình dự kiến được xếp lại tự động." };
}

// ───────── Fund payment: one bank transfer, one or several months ─────────
const paySchema = z.object({
  member_id: uuid,
  months: z.array(z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)).max(12, "Tối đa 12 tháng"),
  penalties: z.array(uuid).max(20),
  amount: z.coerce.number().int().positive(),
  transferred_at: z.string().min(10),
  request_id: requestId,
});

export async function submitPaymentAction(
  _: unknown,
  fd: FormData,
): Promise<ActionResult<{ reference: string; months?: string[]; total?: number; duplicate?: boolean }>> {
  const parsed = paySchema.safeParse({
    member_id: fd.get("member_id"), months: fd.getAll("months"), penalties: fd.getAll("penalties"), amount: fd.get("amount"),
    transferred_at: fd.get("transferred_at"), request_id: fd.get("request_id"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.path[0] === "months" ? "Chọn ít nhất một tháng đóng." : "Vui lòng chọn tên, tháng và thời điểm chuyển." };
  if (!(await rateLimit("pay", 6, 10 * 60_000))) return { ok: false, error: "Bạn gửi quá nhiều lần, thử lại sau." };
  const d = parsed.data;
  if (d.months.length + d.penalties.length === 0) return { ok: false, error: "Chọn ít nhất một tháng hoặc khoản phạt." };
  const iso = localInputToIso(d.transferred_at);
  if (!iso || Number.isNaN(Date.parse(iso))) return { ok: false, error: "Thời điểm chuyển không hợp lệ." };

  const file = await uploadGuestFile("receipt", fd.get("receipt"), true);
  if (!file.ok) return file;

  const { data, error } = await publicDb().rpc("submit_public_payment", {
    p_member_id: d.member_id, p_months: d.months, p_penalty_ids: d.penalties, p_amount: d.amount, p_transferred_at: iso,
    p_receipt_asset_id: file.assetId, p_request_id: d.request_id,
  });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return { ok: true, data: { reference: data.reference, months: data.months, total: data.total, duplicate: data.duplicate } };
}

// ───────── Donation (ủng hộ) ─────────
const donateSchema = z.object({
  donor_name: z.string().trim().max(80).optional(),
  anonymous: z.literal("on").optional(),
  amount: z.coerce.number().int().min(1000, "Số tiền tối thiểu 1.000 ₫").max(100_000_000),
  message: z.string().trim().max(200).optional(),
  transferred_at: z.string().min(10),
  request_id: requestId,
});

export async function donateAction(_: unknown, fd: FormData): Promise<ActionResult<{ reference: string }>> {
  const parsed = donateSchema.safeParse({
    donor_name: fd.get("donor_name") || undefined, anonymous: fd.get("anonymous") || undefined, amount: fd.get("amount"),
    message: fd.get("message") || undefined, transferred_at: fd.get("transferred_at"), request_id: fd.get("request_id"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const d = parsed.data;
  if (!d.anonymous && (!d.donor_name || d.donor_name.length < 2)) return { ok: false, error: "Nhập tên người ủng hộ hoặc chọn ẩn danh." };
  if (!(await rateLimit("donate", 5, 10 * 60_000))) return { ok: false, error: "Bạn gửi quá nhiều lần, thử lại sau." };
  const iso = localInputToIso(d.transferred_at);
  if (!iso) return { ok: false, error: "Thời điểm chuyển không hợp lệ." };
  const file = await uploadGuestFile("receipt", fd.get("receipt"), true);
  if (!file.ok) return file;
  const { data, error } = await publicDb().rpc("submit_public_donation", {
    p_donor_name: d.donor_name ?? null, p_anonymous: Boolean(d.anonymous), p_amount: d.amount, p_message: d.message ?? null,
    p_transferred_at: iso, p_receipt_asset_id: file.assetId, p_request_id: d.request_id,
  });
  if (error) return fail(error);
  revalidatePath("/donate");
  return { ok: true, data: { reference: data.reference } };
}