export default function RankingsLoading() {
  return (
    <main className="container-page py-6 sm:py-10">
      <div className="mb-6">
        <div className="h-8 w-32 rounded-sm skeleton-shimmer bg-surface-soft" />
        <div className="mt-3 h-4 w-64 rounded-sm skeleton-shimmer bg-surface-soft" />
      </div>
      <div className="h-9 w-80 rounded-pill skeleton-shimmer bg-surface-soft" />
      <div className="mt-6 space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg skeleton-shimmer bg-surface-soft" />
        ))}
      </div>
    </main>
  );
}
