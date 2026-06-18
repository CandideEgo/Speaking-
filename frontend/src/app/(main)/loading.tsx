import { SkeletonCardGrid } from '@/components/SkeletonCard';

export default function MainLoading() {
  return (
    <main className="container-page py-16 sm:py-24">
      <div className="mb-8">
        <div className="h-8 w-48 skeleton-shimmer rounded-sm bg-cream-soft" />
        <div className="mt-3 h-4 w-72 skeleton-shimmer rounded-sm bg-cream-soft" />
      </div>
      <SkeletonCardGrid count={8} className="mt-8" />
    </main>
  );
}
