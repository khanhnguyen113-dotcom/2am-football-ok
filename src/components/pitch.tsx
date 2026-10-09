import type { ReactNode } from "react";
import { formationSlots, POSITION_LINE, slotLine, displayName, type PubMember } from "@/lib/domain";

/** Vertical sân-7 pitch; forwards on top, GK at the bottom. `render` lets admin screens put pickers in slots. */
export function Pitch({
  formation, slots, members, render,
}: {
  formation: string;
  slots: Record<string, string | null | undefined>;
  members: Map<string, PubMember>;
  render?: (slot: string) => ReactNode;
}) {
  const all = formationSlots(formation);
  const rows: string[][] = [
    all.filter((s) => s.startsWith("FWD")),
    all.filter((s) => s.startsWith("MID")),
    all.filter((s) => s.startsWith("DEF")),
    ["GK"],
  ];
  return (
    <div
      className="relative mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-white/10"
      style={{
        aspectRatio: "0.78",
        background:
          "repeating-linear-gradient(180deg, rgb(255 255 255 / 0.035) 0 9%, transparent 9% 18%), radial-gradient(120% 80% at 50% 0%, #1f7a4d 0%, #0f4a30 55%, #0a2f20 100%)",
      }}
    >
      {/* markings */}
      <div className="pointer-events-none absolute inset-[4%] rounded-md border-2 border-white/25" />
      <div className="pointer-events-none absolute inset-x-[4%] top-1/2 h-0 border-t-2 border-white/25" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[22%] w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/25" />
      <div className="pointer-events-none absolute bottom-[4%] left-1/2 h-[14%] w-[44%] -translate-x-1/2 border-2 border-b-0 border-white/25" />
      <div className="pointer-events-none absolute top-[4%] left-1/2 h-[14%] w-[44%] -translate-x-1/2 border-2 border-t-0 border-white/25" />

      <div className="absolute inset-0 grid grid-rows-4 py-[6%]">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center justify-evenly px-[4%]">
            {row.map((slot) => (
              <div key={slot} className="flex w-[30%] max-w-[120px] justify-center">
                {render ? render(slot) : <PitchToken slot={slot} member={slots[slot] ? members.get(slots[slot]!) : undefined} />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PitchToken({ slot, member }: { slot: string; member?: PubMember }) {
  const line = slotLine(slot);
  const off = member && member.positions.length > 0 && !member.positions.some((p) => POSITION_LINE[p] === line);
  return (
    <div className="flex flex-col items-center text-center">
      <div
        className={`relative grid h-12 w-12 place-items-center rounded-full font-display text-xl font-black sm:h-14 sm:w-14 ${
          member ? "text-[#2b1d03]" : "border-2 border-dashed border-white/40 text-white/60"
        }`}
        style={member ? { background: "linear-gradient(155deg,#fbe7a1,#e0b84f 50%,#a87a1e)", boxShadow: "0 4px 14px rgb(0 0 0 / .45)" } : undefined}
      >
        {member ? member.shirt_number ?? "•" : slot === "GK" ? "GK" : "+"}
        {off ? <span title="Xếp trái sở trường" className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-warn text-[11px] font-bold text-black">!</span> : null}
      </div>
      <div className="mt-1 w-full truncate rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
        {member ? displayName(member) : slotLabel(slot)}
      </div>
    </div>
  );
}

export function slotLabel(slot: string) {
  return { GK: "Thủ môn", DEF: "Hậu vệ", MID: "Tiền vệ", FWD: "Tiền đạo" }[slotLine(slot)];
}
