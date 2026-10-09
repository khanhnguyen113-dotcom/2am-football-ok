"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; label: string; full?: string; icon: keyof typeof ICONS };

const MAIN: Item[] = [
  { href: "/", label: "Trang chủ", icon: "home" },
  { href: "/matches", label: "Trận đấu", icon: "ball" },
  { href: "/funds", label: "Quỹ đội", icon: "wallet" },
  { href: "/stats", label: "BXH", full: "Bảng xếp hạng", icon: "chart" },
];
const MORE: Item[] = [
  { href: "/members", label: "Thành viên", icon: "users" },
  { href: "/events", label: "Thưởng", icon: "trophy" },
  { href: "/funds/pay", label: "Đóng quỹ", icon: "upload" },
  { href: "/funds/penalty", label: "Nộp phạt", icon: "shield" },
  { href: "/donate", label: "Ủng hộ", icon: "heart" },
];

const ICONS = {
  home: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  ball: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4 3.5 2.5-1.3 4h-4.4l-1.3-4Z",
  wallet: "M3 7a2 2 0 0 1 2-2h13v4H5a2 2 0 0 1-2-2Zm0 0v11a2 2 0 0 0 2 2h15V9H5m11 5h2",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9c0-3.3 3.1-6 7-6s7 2.7 7 6M17 11a3 3 0 1 0 0-6m2 15c0-2.5-1.4-4.6-3.5-5.6",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0Zm0 1H4v2a3 3 0 0 0 4 3m8-5h4v2a3 3 0 0 1-4 3m-4 3v4m-4 3h8",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  upload: "M12 16V4m-5 5 5-5 5 5M4 20h16",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
  shield: "M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6Z",
};

function Icon({ name, className }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

function isActive(path: string, href: string) {
  if (href === "/") return path === "/";
  if (href === "/funds") return path === "/funds";
  return path === href || path.startsWith(`${href}/`);
}

export function Sidebar() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1" aria-label="Điều hướng chính">
      {[...MAIN, ...MORE].map((it) => {
        const active = isActive(path, it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 font-display text-[1.05rem] font-bold uppercase tracking-wider transition-colors ${
              active ? "bg-neon/10 text-neon" : "text-muted hover:bg-white/5 hover:text-fg"
            }`}
          >
            {active ? <span className="absolute left-0 top-2 bottom-2 w-[3px] -skew-x-12 rounded bg-neon" /> : null}
            <Icon name={it.icon} />
            {it.full ?? it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const moreActive = MORE.some((it) => isActive(path, it.href));
  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <div className="panel absolute inset-x-3 bottom-20 p-2" onClick={(e) => e.stopPropagation()}>
            {MORE.map((it) => (
              <Link key={it.href} href={it.href} onClick={() => setOpen(false)}
                className="flex min-h-12 items-center gap-3 rounded-lg px-3 font-display text-lg font-bold uppercase tracking-wider text-fg hover:bg-white/5">
                <Icon name={it.icon} /> {it.label}
              </Link>
            ))}
            <Link href="/admin" onClick={() => setOpen(false)}
              className="flex min-h-12 items-center gap-3 rounded-lg px-3 font-display text-lg font-bold uppercase tracking-wider text-muted hover:bg-white/5">
              <Icon name="shield" /> Quản trị
            </Link>
          </div>
        </div>
      ) : null}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-ink-950/90 backdrop-blur-md lg:hidden" aria-label="Điều hướng">
        <div className="mx-auto grid max-w-lg grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {MAIN.map((it) => {
            const active = isActive(path, it.href);
            return (
              <Link key={it.href} href={it.href} className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.68rem] font-semibold ${active ? "text-neon" : "text-muted"}`}>
                <Icon name={it.icon} className={`h-6 w-6 ${active ? "drop-shadow-[0_0_8px_rgb(200_255_60/0.6)]" : ""}`} />
                {it.label}
              </Link>
            );
          })}
          <button type="button" onClick={() => setOpen((v) => !v)} className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.68rem] font-semibold ${moreActive || open ? "text-neon" : "text-muted"}`}>
            <Icon name="more" className="h-6 w-6" />
            Thêm
          </button>
        </div>
      </nav>
    </>
  );
}
