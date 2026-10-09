/**
 * Integration tests against the LOCAL Supabase stack (run `npx supabase db reset` first — uses seed data).
 * Covers guideline acceptance cases on permissions, idempotency and money invariants.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
// Safety: these tests write data and rely on the demo seed — never run them against a hosted project.
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL ?? "")) {
  throw new Error(`Integration tests only run against the local Supabase stack (got ${URL}). Check .env.test.local.`);
}
const client = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

// seed.sql test values (local only)
const ADMIN = { email: "admin@2amfc.local", password: "Owl-2am-Local!2026" };
const OUTSIDER = { email: "outsider@2amfc.local", password: "Outsider-Local!2026" };
const M = (n: number) => `10000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const UPCOMING = "20000000-0000-4000-8000-000000000004";
const DRAFT_MATCH = "20000000-0000-4000-8000-000000000005";

// smallest valid PNG
const PNG = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

let anon: SupabaseClient;
let admin: SupabaseClient;
let outsider: SupabaseClient;

async function uploadReceipt(db: SupabaseClient, salt: string) {
  const bytes = Uint8Array.from([...PNG]);
  const sha = createHash("sha256").update(bytes).update(salt).digest("hex");
  const { data, error } = await db.rpc("begin_public_upload", { p_purpose: "receipt", p_mime: "image/png", p_size: bytes.length, p_sha256: sha });
  expect(error).toBeNull();
  const up = await db.storage.from(data.bucket).upload(data.path, bytes, { contentType: "image/png", upsert: false });
  expect(up.error).toBeNull();
  return data as { asset_id: string; bucket: string; path: string };
}

beforeAll(async () => {
  anon = client();
  admin = client();
  outsider = client();
  const a = await admin.auth.signInWithPassword(ADMIN);
  expect(a.error).toBeNull();
  const o = await outsider.auth.signInWithPassword(OUTSIDER);
  expect(o.error).toBeNull();
});

describe("dues already included in the opening balance", () => {
  let memberId: string;
  let dueId: string;
  let otherDueId: string;
  const note = "Chủ đội xác nhận đã đóng trước khi chạy app; đã nằm trong số dư khởi tạo.";

  beforeAll(async () => {
    expect((await admin.rpc("admin_create_period", { p_month: "2026-07", p_due_date: "2026-07-05" })).error).toBeNull();
    const ids: string[] = [];
    for (const full_name of ["Thành viên xác nhận khởi tạo", "Thành viên chưa xác nhận khởi tạo"]) {
      const result = await admin.rpc("admin_save_member", {
        p_id: null, p_data: { full_name, fee_type: "standard" }, p_positions: [], p_primary: null, p_expected_version: null,
      });
      expect(result.error).toBeNull();
      ids.push(result.data);
    }
    memberId = ids[0];
    expect((await admin.rpc("admin_generate_dues", { p_month: "2026-07", p_member_ids: ids })).error).toBeNull();
    const { data, error } = await admin.from("monthly_dues").select("id, member_id").eq("obligation_month", "2026-07");
    expect(error).toBeNull();
    dueId = data!.find((d) => d.member_id === ids[0])!.id;
    otherDueId = data!.find((d) => d.member_id === ids[1])!.id;
  });

  it("allows only the configured admin and requires an explanation", async () => {
    const args = { p_due_id: dueId, p_note: note };
    expect((await anon.rpc("admin_confirm_opening_due", args)).error).not.toBeNull();
    expect((await outsider.rpc("admin_confirm_opening_due", args)).error?.message).toBe("FORBIDDEN");
    expect((await admin.rpc("admin_confirm_opening_due", { ...args, p_note: "" })).error?.message).toBe("REASON_REQUIRED");
  });

  it("confirms paid without a receipt or another income, even for concurrent retries", async () => {
    const before = (await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance;
    const results = await Promise.all([1, 2].map(() => admin.rpc("admin_confirm_opening_due", { p_due_id: dueId, p_note: note })));
    results.forEach((r) => expect(r.error).toBeNull());
    expect(results[0].data).toBe(results[1].data);
    const id = results[0].data;
    const { data } = await admin.from("payment_submissions").select("*").eq("id", id).single();
    expect(data).toMatchObject({ status: "approved", actor_kind: "admin", receipt_asset_id: null, transferred_at: null, method: null, opening_note: note });
    expect(data!.opening_ledger_id).not.toBeNull();
    expect((await anon.from("pub_dues").select("status").eq("member_id", memberId).eq("obligation_month", "2026-07").single()).data!.status).toBe("paid");
    expect((await anon.rpc("pub_unpaid", { p_month: "2026-07" })).data.some((r: { member_id: string }) => r.member_id === memberId)).toBe(false);
    expect((await admin.rpc("admin_approve_payment", { p_submission_id: id })).data).toMatchObject({ already: true });
    expect((await admin.from("fund_ledger").select("id").eq("source_id", id)).data).toHaveLength(0);
    expect((await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance).toBe(before);
    const duplicate = await anon.rpc("submit_public_payment", {
      p_member_id: memberId, p_months: ["2026-07"], p_penalty_ids: [], p_amount: 150000,
      p_transferred_at: new Date().toISOString(), p_receipt_asset_id: randomUUID(), p_request_id: randomUUID(),
    });
    expect(duplicate.error?.message).toBe("ALREADY_SUBMITTED");
  });

  it("keeps receipts mandatory for ordinary payments", async () => {
    const { data } = await admin.from("monthly_dues").select("member_id").eq("id", otherDueId).single();
    const result = await admin.from("payment_submissions").insert({
      group_ref: randomUUID(), due_id: otherDueId, member_id: data!.member_id, amount: 150000,
      transferred_at: new Date().toISOString(), method: "bank", receipt_asset_id: null,
      actor_kind: "admin", request_id: randomUUID(),
    });
    expect(result.error?.code).toBe("23514");
  });

  it("requires the admin, a note and the exact amount for a manual payment", async () => {
    const args = { p_due_id: otherDueId, p_amount: 150000, p_note: "Chủ đội xác nhận đã nhận tiền." };
    expect((await anon.rpc("admin_confirm_due_payment", args)).error).not.toBeNull();
    expect((await outsider.rpc("admin_confirm_due_payment", args)).error?.message).toBe("FORBIDDEN");
    expect((await admin.rpc("admin_confirm_due_payment", { ...args, p_note: "" })).error?.message).toBe("REASON_REQUIRED");
    expect((await admin.rpc("admin_confirm_due_payment", { ...args, p_amount: 149000 })).error?.message).toBe("AMOUNT_MISMATCH");
  });

  it("marks paid and posts one income for simultaneous manual confirmations", async () => {
    const before = (await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance;
    const args = { p_due_id: otherDueId, p_amount: 150000, p_note: "Chủ đội xác nhận đã nhận tiền; không có biên lai." };
    const results = await Promise.all([1, 2].map(() => admin.rpc("admin_confirm_due_payment", args)));
    results.forEach((r) => expect(r.error).toBeNull());
    expect(results[0].data).toBe(results[1].data);
    const id = results[0].data;
    expect((await admin.from("payment_submissions").select("status, receipt_asset_id, transferred_at, method, admin_confirmation_note").eq("id", id).single()).data)
      .toMatchObject({ status: "approved", receipt_asset_id: null, transferred_at: null, method: null, admin_confirmation_note: args.p_note });
    expect((await admin.from("fund_ledger").select("id, amount").eq("source_id", id)).data).toHaveLength(1);
    expect((await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance).toBe(before + 150000);
    expect((await admin.rpc("admin_approve_payment", { p_submission_id: id })).data).toMatchObject({ already: true });
    expect((await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance).toBe(before + 150000);
  });

  it("reverses a manual payment through the existing ledger correction workflow", async () => {
    const { data: submission } = await admin.from("payment_submissions").select("id, member_id").eq("due_id", otherDueId).eq("status", "approved").single();
    const { data: entry } = await admin.from("fund_ledger").select("id").eq("source_id", submission!.id).single();
    const before = (await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance;
    expect((await admin.rpc("admin_reverse_ledger", { p_entry_id: entry!.id, p_reason: "Kiểm thử đảo khoản xác nhận thủ công" })).error).toBeNull();
    expect((await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance).toBe(before - 150000);
    expect((await anon.from("pub_dues").select("status").eq("member_id", submission!.member_id).eq("obligation_month", "2026-07").single()).data!.status).toBe("unpaid");
  });
});

describe("public read model (AT25)", () => {
  it("anon reads projections but not base tables", async () => {
    expect((await anon.from("pub_ledger").select("id").limit(1)).error).toBeNull();
    expect((await anon.from("members").select("id")).error?.message).toMatch(/permission denied/);
    expect((await anon.from("payment_submissions").select("id")).error?.message).toMatch(/permission denied/);
    expect((await anon.from("member_private_details").select("*")).error?.message).toMatch(/permission denied/);
  });
  it("projections never expose private columns", async () => {
    const { data } = await anon.from("pub_members").select("*").limit(1).single();
    expect(Object.keys(data!)).not.toContain("phone");
    const r = await anon.from("pub_matches").select("opponent_contact");
    expect(r.error).not.toBeNull();
  });
  it("anon cannot write through views", async () => {
    const r = await anon.from("pub_periods").update({ status: "open" }).eq("month", "2026-08");
    expect(r.error).not.toBeNull();
  });
});

describe("public member profile (AT01, AT29 + v2 positions/photo)", () => {
  it("anyone edits name + positions without login; stale version is rejected", async () => {
    const { data: m } = await anon.from("pub_members").select("id, version").eq("id", M(2)).single();
    const ok = await anon.rpc("update_public_member_profile", {
      p_member_id: m!.id, p_full_name: "Trần Minh Bảo", p_nickname: "Bảo Thép", p_positions: ["DEF", "MID"], p_primary: "MID",
      p_expected_version: m!.version, p_request_id: randomUUID(),
    });
    expect(ok.error).toBeNull();
    const { data: after } = await anon.from("pub_members").select("nickname, primary_position, positions").eq("id", M(2)).single();
    expect(after).toMatchObject({ nickname: "Bảo Thép", primary_position: "MID" });
    expect(after!.positions.sort()).toEqual(["DEF", "MID"]);
    const stale = await anon.rpc("update_public_member_profile", {
      p_member_id: m!.id, p_full_name: "Ai Đó", p_nickname: null, p_positions: ["FWD"], p_primary: "FWD",
      p_expected_version: m!.version, p_request_id: randomUUID(),
    });
    expect(stale.error?.message).toBe("CONFLICT");
    const bad = await anon.rpc("update_public_member_profile", {
      p_member_id: m!.id, p_full_name: "Trần Minh Bảo", p_nickname: null, p_positions: ["XX"], p_primary: null,
      p_expected_version: ok.data.version, p_request_id: randomUUID(),
    });
    expect(bad.error?.message).toBe("INVALID_POSITION");
  });
  it("anyone can set a member photo, only through a reserved upload", async () => {
    const bytes = Uint8Array.from([...PNG]);
    const { data: up } = await anon.rpc("begin_public_upload", { p_purpose: "avatar", p_mime: "image/png", p_size: bytes.length, p_sha256: createHash("sha256").update(bytes).update("av").digest("hex") });
    expect((await anon.storage.from("avatars").upload(up.path, bytes, { contentType: "image/png" })).error).toBeNull();
    const r = await anon.rpc("set_public_member_avatar", { p_member_id: M(3), p_asset_id: up.asset_id, p_request_id: randomUUID() });
    expect(r.error).toBeNull();
    const rogue = await anon.storage.from("avatars").upload(`x/${randomUUID()}.png`, bytes, { contentType: "image/png" });
    expect(rogue.error).not.toBeNull();
  });
  it("anon cannot touch other member fields", async () => {
    const r = await anon.from("members").update({ shirt_number: 99, status: "archived" }).eq("id", M(2));
    expect(r.error?.message).toMatch(/permission denied/);
  });
});

describe("receipts, multi-month (AT03, AT04, AT05, AT11, AT26)", () => {
  let groupRef = "";
  const pay = async (member: string, months: string[], amount: number, salt: string) => {
    const up = await uploadReceipt(anon, salt);
    return anon.rpc("submit_public_payment", {
      p_member_id: member, p_months: months, p_penalty_ids: [], p_amount: amount, p_transferred_at: new Date().toISOString(),
      p_receipt_asset_id: up.asset_id, p_request_id: randomUUID(),
    });
  };
  it("one transfer pays several months (current + prepay); pending; balance unchanged", async () => {
    const before = (await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance;
    const { data, error } = await pay(M(11), ["2026-10", "2026-11", "2026-12"], 450000, "t1");
    expect(error).toBeNull();
    expect(data.months).toEqual(["2026-10", "2026-11", "2026-12"]);
    groupRef = data.reference;
    const { data: rows } = await admin.from("payment_submissions").select("status, amount").eq("group_ref", groupRef);
    expect(rows).toHaveLength(3);
    expect(rows!.every((r) => r.status === "pending")).toBe(true);
    expect((await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance).toBe(before);
  });
  it("rejects wrong total, duplicate months, too-far months and past months without debt", async () => {
    expect((await pay(M(11), ["2026-10"], 150000, "t2")).error?.message).toBe("ALREADY_SUBMITTED");
    expect((await pay(M(12), ["2026-10", "2026-11"], 50000, "t3")).error?.message).toBe("AMOUNT_MISMATCH"); // HSSV: 2 × 50k
    expect((await pay(M(12), ["2027-09"], 50000, "t4")).error?.message).toBe("MONTH_NOT_ALLOWED");
    expect((await pay(M(12), ["2026-01"], 50000, "t5")).error?.message).toBe("NO_OBLIGATION");
    expect((await pay(M(13), ["2026-12"], 0, "t6")).error?.message).toBe("EXEMPT"); // member type: miễn phí
  });
  it("guests cannot read, list or overwrite receipt files", async () => {
    const { data: obj } = await admin.from("file_assets").select("bucket, object_path").eq("purpose", "receipt").eq("status", "ready").limit(1).single();
    const dl = await anon.storage.from("receipts").download(obj!.object_path);
    expect(dl.error).not.toBeNull();
    const list = await anon.storage.from("receipts").list("");
    expect(list.data ?? []).toHaveLength(0);
    const over = await anon.storage.from("receipts").upload(obj!.object_path, PNG, { contentType: "image/png", upsert: true });
    expect(over.error).not.toBeNull();
    const rogue = await anon.storage.from("receipts").upload(`rogue/${randomUUID()}.png`, PNG, { contentType: "image/png" });
    expect(rogue.error).not.toBeNull();
  });
  it("double/concurrent approval creates exactly one ledger row per month (AT04)", async () => {
    const { data: subs } = await admin.from("payment_submissions").select("id").eq("group_ref", groupRef);
    const before = (await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance;
    for (const sub of subs!) {
      const [a, b] = await Promise.all([
        admin.rpc("admin_approve_payment", { p_submission_id: sub.id }),
        admin.rpc("admin_approve_payment", { p_submission_id: sub.id }),
      ]);
      expect(a.error).toBeNull();
      expect(b.error).toBeNull();
      expect([a.data.already, b.data.already].sort()).toEqual([false, true]);
      const { count } = await admin.from("fund_ledger").select("id", { count: "exact", head: true }).eq("source_id", sub.id);
      expect(count).toBe(1);
    }
    const after = (await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance;
    expect(after - before).toBe(450000);
  });
  it("admin can open a short-lived signed URL for a stored receipt", async () => {
    const { data: s } = await admin.from("payment_submissions").select("file_assets(bucket, object_path)").eq("group_ref", groupRef).limit(1).single();
    const fa = s!.file_assets as unknown as { bucket: string; object_path: string };
    const { data } = await admin.storage.from(fa.bucket).createSignedUrl(fa.object_path, 60);
    const res = await fetch(data!.signedUrl);
    expect(res.status).toBe(200);
  });
});
describe("admin-only commands (AT27)", () => {
  it("anon has no execute right on admin RPCs", async () => {
    const r = await anon.rpc("admin_approve_payment", { p_submission_id: randomUUID() });
    expect(r.error).not.toBeNull();
  });
  it("a signed-in non-admin account is rejected inside the database", async () => {
    const r = await outsider.rpc("admin_create_period", { p_month: "2030-01", p_due_date: "2030-01-05" });
    expect(r.error?.message).toBe("FORBIDDEN");
    const t = await outsider.from("payment_submissions").select("id");
    expect(t.data ?? []).toHaveLength(0); // RLS hides everything
    const u = await outsider.from("matches").update({ status: "cancelled" }).eq("id", UPCOMING).select("id");
    expect(u.data ?? []).toHaveLength(0);
  });
});

describe("RSVP with position & auto lineup (AT13, AT14, AT26 + v2)", () => {
  const rsvp = (member: string, response: string, position: string | null, match = UPCOMING) =>
    anon.rpc("set_public_rsvp", { p_match_id: match, p_member_id: member, p_response: response, p_gathering_response: "no",
      p_position_code: position, p_note: null, p_request_id: randomUUID() });
  const starters = async () => {
    const { data } = await anon.from("pub_lineups").select("status, auto, slots").eq("match_id", UPCOMING).single();
    const s = (data!.slots as { member_id: string; role: string; slot_code?: string }[]);
    return { ...data!, bySlot: Object.fromEntries(s.filter((x) => x.role === "starter").map((x) => [x.slot_code, x.member_id])), slots: s };
  };
  it("position is required when joining; drafts are closed", async () => {
    expect((await rsvp(M(9), "yes", null)).error?.message).toBe("POSITION_REQUIRED");
    expect((await rsvp(M(9), "yes", "MID", DRAFT_MATCH)).error?.message).toBe("MATCH_NOT_OPEN");
    expect((await rsvp(M(9), "maybe", "MID")).error).not.toBeNull(); // only "có" / "không"
  });
  it("seed lineup is auto-arranged: chosen line first, best monthly form wins", async () => {
    const l = await starters();
    expect(l.auto).toBe(true);
    expect(l.status).toBe("published");
    expect(l.bySlot.GK).toBe(M(1));
    expect(l.bySlot.FWD1).toBe(M(11)); // top form striker beats M(12)
  });
  it("a new player for a line only enters if his form is better; withdrawals are refilled automatically", async () => {
    expect((await rsvp(M(9), "yes", "MID")).error).toBeNull();
    let l = await starters();
    expect(Object.values(l.bySlot)).not.toContain(M(9)); // no October form yet → bench
    expect(l.slots.some((s) => s.member_id === M(9) && s.role === "sub")).toBe(true);
    expect((await rsvp(M(11), "no", null)).error).toBeNull();
    l = await starters();
    expect(Object.values(l.bySlot)).not.toContain(M(11));
    expect(Object.keys(l.bySlot)).toHaveLength(7); // FWD refilled from the bench
  });
  it("manual lineup is validated and turns auto mode off", async () => {
    const { data: lv } = await admin.from("lineups").select("version").eq("match_id", UPCOMING).single();
    const noGk = await admin.rpc("admin_save_lineup", {
      p_match_id: UPCOMING, p_formation: "2-3-1", p_expected_version: lv!.version, p_publish: true,
      p_slots: [[M(2), "DEF1"], [M(3), "DEF2"], [M(4), "MID1"], [M(6), "MID2"], [M(8), "MID3"], [M(12), "FWD1"]].map(([id, s]) => ({ member_id: id, role: "starter", slot_code: s })),
    });
    expect(noGk.error?.message).toBe("LINEUP_INCOMPLETE");
    const ineligible = await admin.rpc("admin_save_lineup", {
      p_match_id: UPCOMING, p_formation: "2-3-1", p_expected_version: lv!.version, p_publish: false,
      p_slots: [{ member_id: M(5), role: "starter", slot_code: "GK" }], // member 5 answered "no"
    });
    expect(ineligible.error?.message).toBe("INELIGIBLE_PLAYER");
    const stale = await admin.rpc("admin_save_lineup", { p_match_id: UPCOMING, p_formation: "2-3-1", p_expected_version: lv!.version - 1, p_publish: false, p_slots: [] });
    expect(stale.error?.message).toBe("CONFLICT");
    const draft = await admin.rpc("admin_save_lineup", { p_match_id: UPCOMING, p_formation: "3-2-1", p_expected_version: lv!.version, p_publish: false,
      p_slots: [{ member_id: M(1), role: "starter", slot_code: "GK" }] });
    expect(draft.error).toBeNull();
    const { data: l } = await admin.from("lineups").select("auto").eq("match_id", UPCOMING).single();
    expect(l!.auto).toBe(false);
    expect((await admin.rpc("admin_enable_auto_lineup", { p_match_id: UPCOMING })).error).toBeNull();
    expect((await starters()).auto).toBe(true);
  });
});
describe("fund requests & ledger (AT08, AT09, AT10)", () => {
  it("approval does not reduce balance; payment does exactly once; reversal restores", async () => {
    const bal = async () => (await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance as number;
    const b0 = await bal();
    const { data: id } = await admin.rpc("admin_create_fund_request", { p: { kind: "expense", category: "Nước uống", amount: 90000, public_description: "Nước test" } });
    expect((await admin.rpc("admin_decide_fund_request", { p_id: id, p_decision: "approve", p_reason: null, p_occurred_at: null })).error).toBeNull();
    expect(await bal()).toBe(b0);
    const paid = await admin.rpc("admin_record_expense_paid", { p_id: id, p_occurred_at: new Date().toISOString().slice(0, 10), p_amount: 90000, p_doc_asset_id: null, p_exception_note: "test" });
    expect(paid.error).toBeNull();
    const again = await admin.rpc("admin_record_expense_paid", { p_id: id, p_occurred_at: new Date().toISOString().slice(0, 10), p_amount: 90000, p_doc_asset_id: null, p_exception_note: "test" });
    expect(again.error?.message).toBe("INVALID_STATUS");
    expect(await bal()).toBe(b0 - 90000);
    const { data: row } = await admin.from("fund_ledger").select("id").eq("source_id", id).single();
    expect((await admin.rpc("admin_reverse_ledger", { p_entry_id: row!.id, p_reason: "nhập sai" })).error).toBeNull();
    expect((await admin.rpc("admin_reverse_ledger", { p_entry_id: row!.id, p_reason: "lần 2" })).error?.message).toBe("ALREADY_REVERSED");
    expect(await bal()).toBe(b0);
  });
  it("expense beyond available funds is blocked", async () => {
    const { data: id } = await admin.rpc("admin_create_fund_request", { p: { kind: "expense", category: "Khác", amount: 999000000, public_description: "Quá lớn" } });
    const r = await admin.rpc("admin_decide_fund_request", { p_id: id, p_decision: "approve", p_reason: null, p_occurred_at: null });
    expect(r.error?.message).toBe("INSUFFICIENT_FUNDS");
  });
  it("ledger rows are immutable and closed periods reject back-dated posts (AT12)", async () => {
    const { data: row } = await admin.from("fund_ledger").select("id").limit(1).single();
    const u = await admin.from("fund_ledger").update({ amount: 1 }).eq("id", row!.id);
    expect(u.error).not.toBeNull();
    const { data: id } = await admin.rpc("admin_create_fund_request", { p: { kind: "income", category: "Khác", amount: 10000, public_description: "Thu lùi kỳ" } });
    // occurred in closed August → still posts into the open current period, with a note
    expect((await admin.rpc("admin_decide_fund_request", { p_id: id, p_decision: "approve", p_reason: null, p_occurred_at: "2026-08-15" })).error).toBeNull();
    const { data: l } = await admin.from("fund_ledger").select("posting_month, occurred_at, period_note").eq("source_id", id).single();
    expect(l!.posting_month).not.toBe("2026-08");
    expect(l!.period_note).toMatch(/kỳ đã khóa/);
  });
});

describe("stats count only confirmed facts (AT12, AT16, AT17)", () => {
  it("RSVP yes without playing does not add an appearance", async () => {
    const { data } = await anon.rpc("pub_member_stats", { p_from: "2026-09-01", p_to: "2026-09-30" });
    const huy = (data as { member_id: string; appearances: number; rsvp_yes: number }[]).find((r) => r.member_id === M(5))!;
    // member 5 was absent on 19/09 and did not play 26/09
    expect(Number(huy.appearances)).toBe(0);
  });
});

describe("member types, absence penalties, donations, direct entries (v3)", () => {
  const PEN_MATCH = "20000000-0000-4000-8000-000000000003"; // M(6) confirmed yes, recorded absent in seed
  it("fees follow member type and unpaid list skips exempt members", async () => {
    const { data } = await anon.rpc("pub_unpaid", { p_month: "2026-12" });
    const rows = data as { member_id: string; fee_type: string; amount: number }[];
    expect(rows.find((r) => r.member_id === M(12))).toMatchObject({ fee_type: "student", amount: 50000 });
    expect(rows.find((r) => r.member_id === M(14))).toMatchObject({ fee_type: "maintain", amount: 50000 });
    expect(rows.find((r) => r.member_id === M(13))).toBeUndefined();
  });
  it("RSVP yes + absent creates a penalty that is paid through the fund form", async () => {
    const { data: pens } = await anon.from("pub_penalties").select("*").eq("member_id", M(6)).eq("match_id", PEN_MATCH);
    expect(pens).toHaveLength(1);
    expect(pens![0]).toMatchObject({ amount: 50000, status: "unpaid" });
    const up = await uploadReceipt(anon, "pen");
    const r = await anon.rpc("submit_public_payment", { p_member_id: M(6), p_months: [], p_penalty_ids: [pens![0].id], p_amount: 50000,
      p_transferred_at: new Date().toISOString(), p_receipt_asset_id: up.asset_id, p_request_id: randomUUID() });
    expect(r.error).toBeNull();
    const { data: sub } = await admin.from("payment_submissions").select("id").eq("penalty_id", pens![0].id).single();
    expect((await admin.rpc("admin_approve_payment", { p_submission_id: sub!.id })).error).toBeNull();
    const { data: led } = await admin.from("fund_ledger").select("category, amount").eq("source_id", sub!.id).single();
    expect(led).toMatchObject({ category: "Tiền phạt", amount: 50000 });
    expect((await anon.from("pub_penalties").select("status").eq("id", pens![0].id).single()).data!.status).toBe("paid");
  });
  it("correcting attendance cancels an unpaid penalty; RSVP no + absent is never fined", async () => {
    // Sep 19: M(5) answered "no" and was absent → no penalty
    const { data: none } = await anon.from("pub_penalties").select("id").eq("member_id", M(5));
    expect(none).toHaveLength(0);
    // mark M(3) (yes) absent on Oct 3, then back to played
    const save = (status: string) => admin.rpc("admin_save_participation", {
      p_match_id: PEN_MATCH, p_rows: [{ member_id: M(3), actual_status: status, positions: [], goals: null }], p_score_us: 3, p_score_them: 1,
      p_post_note: null, p_attendance_complete: true, p_complete_match: false, p_reason: "test" });
    expect((await save("absent")).error).toBeNull();
    expect((await anon.from("pub_penalties").select("id").eq("member_id", M(3))).data).toHaveLength(1);
    expect((await save("played")).error).toBeNull();
    expect((await anon.from("pub_penalties").select("id").eq("member_id", M(3))).data).toHaveLength(0);
  });
  it("donations need admin confirmation before reaching the fund and the honour board", async () => {
    const before = (await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance;
    const up = await uploadReceipt(anon, "don");
    const { data, error } = await anon.rpc("submit_public_donation", { p_donor_name: "Fan Test", p_anonymous: false, p_amount: 120000,
      p_message: "Cố lên!", p_transferred_at: new Date().toISOString(), p_receipt_asset_id: up.asset_id, p_request_id: randomUUID() });
    expect(error).toBeNull();
    expect((await anon.from("pub_donations").select("id").eq("donor_name", "Fan Test")).data).toHaveLength(0);
    const { data: d } = await admin.from("donations").select("id").eq("reference", data.reference).single();
    expect((await admin.rpc("admin_review_donation", { p_id: d!.id, p_decision: "approve", p_reason: null })).error).toBeNull();
    expect((await anon.from("pub_donations").select("id").eq("donor_name", "Fan Test")).data).toHaveLength(1);
    expect((await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance - before).toBe(120000);
  });
  it("admin records income/expense in one step; expense needs a document or note", async () => {
    const bal = async () => (await anon.rpc("pub_fund_summary", { p_month: "2026-10" })).data.balance as number;
    const b0 = await bal();
    expect((await admin.rpc("admin_record_direct", { p: { kind: "income", category: "Tài trợ", amount: 200000, public_description: "Tài trợ test" }, p_doc_asset_id: null })).error).toBeNull();
    const noDoc = await admin.rpc("admin_record_direct", { p: { kind: "expense", category: "Nước uống", amount: 50000, public_description: "Nước test" }, p_doc_asset_id: null });
    expect(noDoc.error?.message).toBe("DOC_REQUIRED");
    expect((await admin.rpc("admin_record_direct", { p: { kind: "expense", category: "Nước uống", amount: 50000, public_description: "Nước test", private_note: "mua tại sân" }, p_doc_asset_id: null })).error).toBeNull();
    expect(await bal()).toBe(b0 + 150000);
    expect((await outsider.rpc("admin_record_direct", { p: { kind: "income", category: "Khác", amount: 1000, public_description: "hack" }, p_doc_asset_id: null })).error?.message).toBe("FORBIDDEN");
  });
});
