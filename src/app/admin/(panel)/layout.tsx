import Link from "next/link";
import type { Metadata } from "next";
import { Crest } from "@/components/brand";
import { requireAdminPage } from "@/server/admin";
import { logoutAction } from "@/server/actions/admin";

export const metadata: Metadata = { title: { default: "Quản trị", template: "%s · Quản trị 2AM FC" }, robots: { index: false } };

const NAV = [
  { href: "/admin", label: "Tổng quan" },
  { href: "/admin/funds", label: "Quỹ" },
  { href: "/admin/members", label: "Thành viên" },
  { href: "/admin/matches", label: "Trận & đội hình" },
  { href: "/admin/events", label: "Thưởng" },
  { href: "/admin/settings", label: "Cài đặt & audit" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdminPage();
  return (
    <div className="relative z-10 min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-white/8 bg-ink-950/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <Link href="/admin" className="flex items-center gap-2">
            <Crest size={40} />
            <span className="font-display text-xl font-black uppercase italic">Admin <span className="text-neon">2AM</span></span>
          </Link>
          <nav className="scrollbar-none ml-2 flex flex-1 gap-1 overflow-x-auto">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="shrink-0 rounded-lg px-3 py-2 font-display text-sm font-bold uppercase tracking-wider text-muted hover:bg-white/5 hover:text-fg">
                {n.label}
              </Link>
            ))}
          </nav>
          <Link href="/" className="hidden text-xs text-teal hover:underline sm:block">Xem trang công khai</Link>
          <form action={logoutAction}>
            <button className="btn btn-ghost btn-sm" title={user.email ?? undefined}>Đăng xuất</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
