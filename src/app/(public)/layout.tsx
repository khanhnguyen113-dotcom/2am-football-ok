import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { BottomNav, Sidebar } from "@/components/nav";
import { getTeam } from "@/server/public-data";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const team = await getTeam();
  return (
    <div className="relative z-10 mx-auto flex min-h-dvh max-w-[1400px]">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-white/5 px-4 py-6 lg:flex">
        <Wordmark name={team.team_name} />
        <div className="mt-8 flex-1">
          <Sidebar />
        </div>
        <Link href="/admin" className="rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-dim hover:text-muted">
          Quản trị
        </Link>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/5 bg-ink-950/70 px-4 py-2.5 backdrop-blur-md lg:hidden">
          <Wordmark name={team.team_name} />
          <div className="flex gap-1.5">
            <Link href="/donate" className="btn btn-ghost btn-sm">♥ Ủng hộ</Link>
            <Link href="/funds/pay" className="btn btn-primary btn-sm">Đóng quỹ</Link>
          </div>
        </header>
        <main className="px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
