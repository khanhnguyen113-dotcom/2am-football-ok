import { describe, expect, it } from "vitest";
import { isoToLocalInput, localInputToIso, money, shiftMonth } from "@/lib/format";
import { formationSlots, slotLine } from "@/lib/domain";
import { sniffMime } from "@/lib/file-sniff";

describe("money & time", () => {
  it("formats VND without decimals", () => {
    expect(money(150000)).toBe("150.000 ₫");
    expect(money(0)).toBe("0 ₫");
  });
  it("round-trips datetime-local in Asia/Ho_Chi_Minh", () => {
    const iso = localInputToIso("2026-10-11T20:00");
    expect(iso).toBe("2026-10-11T13:00:00.000Z");
    expect(isoToLocalInput(iso)).toBe("2026-10-11T20:00");
  });
  it("shifts months across years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("sân 7 formations", () => {
  it("always has 1 GK + 6 outfield slots", () => {
    for (const f of ["2-3-1", "3-2-1", "2-2-2"]) {
      const s = formationSlots(f);
      expect(s).toHaveLength(7);
      expect(s.filter((x) => x === "GK")).toHaveLength(1);
    }
    expect(slotLine("DEF2")).toBe("DEF");
  });
});

describe("upload sniffing (never trust extension)", () => {
  it("detects real image types and rejects others", () => {
    expect(sniffMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
  });
});
