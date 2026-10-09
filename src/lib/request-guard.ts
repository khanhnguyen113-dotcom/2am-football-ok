import "server-only";
import { headers } from "next/headers";
import { createHash } from "node:crypto";
import { sniffMime, type ImageMime } from "@/lib/file-sniff";

export { sniffMime };

// Best-effort in-memory limiter for public forms (anti-spam only; DB has its own caps).
const buckets = new Map<string, number[]>();

export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

export async function rateLimit(scope: string, limit: number, windowMs: number): Promise<boolean> {
  const key = `${scope}:${await clientKey()}`;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 5000) buckets.clear();
  return true;
}

export async function readUpload(
  file: FormDataEntryValue | null,
  opts: { maxBytes: number; allowPdf?: boolean; required?: boolean },
): Promise<{ ok: true; bytes: Uint8Array; mime: ImageMime; sha256: string; size: number } | { ok: false; error: string } | null> {
  if (!(file instanceof File) || file.size === 0) {
    return opts.required ? { ok: false, error: "Vui lòng chọn ảnh." } : null;
  }
  if (file.size > opts.maxBytes) return { ok: false, error: `File quá lớn (tối đa ${Math.round(opts.maxBytes / 1048576)} MB).` };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime || (mime === "application/pdf" && !opts.allowPdf)) {
    return { ok: false, error: opts.allowPdf ? "Chỉ chấp nhận JPG, PNG, WebP hoặc PDF." : "Chỉ chấp nhận ảnh JPG, PNG hoặc WebP." };
  }
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return { ok: true, bytes, mime, sha256, size: bytes.length };
}
