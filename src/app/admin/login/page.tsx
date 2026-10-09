import type { Metadata } from "next";
import Link from "next/link";
import { Crest } from "@/components/brand";
import { AdminForm } from "@/components/admin-form";
import { loginAction, resetPasswordAction } from "@/server/actions/admin";
import { Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Đăng nhập quản trị", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <div className="relative z-10 grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Crest size={120} />
          <h1 className="mt-3 font-display text-3xl font-black uppercase italic">Quản trị 2AM <span className="text-neon">FC</span></h1>
          <p className="text-sm text-muted">Chỉ dành cho chủ website. Mọi người khác dùng dashboard không cần đăng nhập.</p>
        </div>
        <div className="panel panel-cut space-y-5 p-5">
          {e === "not_admin" ? <Notice tone="danger">Tài khoản không phải quản trị website.</Notice> : null}
          <AdminForm action={loginAction} submit="Đăng nhập">
            <label className="block"><span className="label">Email</span><input name="email" type="email" autoComplete="username" required className="field" /></label>
            <label className="block"><span className="label">Mật khẩu</span><input name="password" type="password" autoComplete="current-password" required className="field" /></label>
          </AdminForm>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Quên mật khẩu?</summary>
            <AdminForm action={resetPasswordAction} submit="Gửi email đặt lại" className="mt-3 space-y-3">
              <input name="email" type="email" required placeholder="Email quản trị" className="field" />
            </AdminForm>
          </details>
        </div>
        <Link href="/" className="mt-4 block text-center text-sm text-teal hover:underline">← Về dashboard công khai</Link>
      </div>
    </div>
  );
}
