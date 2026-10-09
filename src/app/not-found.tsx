import Link from "next/link";
import { Crest } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="relative z-10 grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <Crest size={110} />
        <h1 className="mt-4 font-display text-6xl font-black italic text-neon">404</h1>
        <p className="text-muted">Không tìm thấy trang — có lẽ bóng đã ra biên.</p>
        <Link href="/" className="btn btn-primary mt-5">Về trang chủ</Link>
      </div>
    </div>
  );
}
