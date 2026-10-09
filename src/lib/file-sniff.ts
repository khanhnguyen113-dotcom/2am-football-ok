// Upload validation: real MIME by magic bytes, never trust extension. Pure module (client/server/tests).
export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export function sniffMime(buf: Uint8Array): ImageMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => buf[i] === b)) return "image/png";
  if (buf.length >= 12 && String.fromCharCode(...buf.slice(0, 4)) === "RIFF" && String.fromCharCode(...buf.slice(8, 12)) === "WEBP")
    return "image/webp";
  if (buf.length >= 5 && String.fromCharCode(...buf.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}
