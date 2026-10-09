export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Đang tải">
      <div className="h-56 animate-pulse rounded-3xl bg-white/5" />
      <div className="h-80 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}
