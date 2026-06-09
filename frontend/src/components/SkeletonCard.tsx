'use client';

import { cn } from '@/lib/utils';

interface SkeletonCardProps {
  className?: string;
}

export function SkeletonCard({ className }: SkeletonCardProps) {
  return (
    <div className={cn('rounded-lg border border-hairline-cream bg-parchment overflow-hidden', className)}>
      <div className="relative aspect-video">
        <div className="absolute inset-0 skeleton-shimmer bg-cream-soft" />
      </div>
      <div className="p-3.5 space-y-2.5">
        <div className="h-4 skeleton-shimmer bg-cream-soft rounded-sm w-[92%]" />
        <div className="h-4 skeleton-shimmer bg-cream-soft rounded-sm w-[70%]" />
        <div className="flex items-center gap-2 pt-1">
          <div className="h-5 skeleton-shimmer bg-cream-soft rounded-sm w-16" />
          <div className="h-5 skeleton-shimmer bg-cream-soft rounded-sm w-12" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonCardGrid({ count = 8, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
