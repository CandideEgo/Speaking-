export default function VocabSetLoading() {
  return (
    <main className="container-page py-6 sm:py-12">
      {/* Header skeleton */}
      <div className="flex items-center gap-3.5 mb-6">
        <div className="w-28 aspect-video rounded-lg skeleton-shimmer bg-surface-soft flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-1/2 skeleton-shimmer rounded-sm bg-surface-soft" />
          <div className="h-3 w-1/3 skeleton-shimmer rounded-sm bg-surface-soft" />
        </div>
        <div className="h-9 w-28 skeleton-shimmer rounded-sm bg-surface-soft flex-shrink-0" />
      </div>
      {/* Tabs skeleton */}
      <div className="h-8 w-56 skeleton-shimmer rounded-sm bg-surface-soft mb-5" />
      {/* Word rows skeleton */}
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg skeleton-shimmer bg-surface-soft" />
        ))}
      </div>
      {/* CTA skeleton */}
      <div className="mt-8 h-12 rounded-sm skeleton-shimmer bg-surface-soft" />
    </main>
  );
}
