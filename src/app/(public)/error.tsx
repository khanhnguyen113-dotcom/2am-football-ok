"use client";

export default function PublicError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="panel mx-auto max-w-md p-6 text-center">
      <h2 className="section-title justify-center">Không tải được dữ liệu</h2>
      <p className="mt-2 text-sm text-muted">Có lỗi kết nối tới máy chủ. Dữ liệu chưa thay đổi — vui lòng thử lại.</p>
      <button onClick={reset} className="btn btn-primary mt-4">Thử lại</button>
    </div>
  );
}
