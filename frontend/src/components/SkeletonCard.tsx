'use client';

import { cn } from '@/lib/utils';

interface SkeletonCardProps {
  className?: string;
  variant?: 'default' | 'douyin';
}

export function SkeletonCard({ className, variant = 'default' }: SkeletonCardProps) {
  const isDouyin = variant === 'douyin';

  return (
    <div className={cn(
      'rounded-lg border overflow-hidden',
      isDouyin ? 'border-gray-200 bg-white' : 'border-hairline-cream bg-parchment',
      className
    )}>
      <div className={cn('relative', isDouyin ? 'aspect-[9/16]' : 'aspect-video')}>
        <div className={cn(
          'absolute inset-0 skeleton-shimmer',
          isDouyin ? 'bg-gray-100' : 'bg-cream-soft'
        )} />
      </div>
      <div className={cn('space-y-2.5', isDouyin ? 'p-3' : 'p-3.5')}>
        <div className={cn(
          'h-4 skeleton-shimmer rounded-sm w-[92%]',
          isDouyin ? 'bg-gray-100' : 'bg-cream-soft'
        )} />
        <div className={cn(
          'h-4 skeleton-shimmer rounded-sm w-[70%]',
          isDouyin ? 'bg-gray-100' : 'bg-cream-soft'
        )} />
        <div className="flex items-center gap-2 pt-1">
          <div className={cn(
            'h-5 skeleton-shimmer rounded-sm w-16',
            isDouyin ? 'bg-gray-100' : 'bg-cream-soft'
          )} />
          <div className={cn(
            'h-5 skeleton-shimmer rounded-sm w-12',
            isDouyin ? 'bg-gray-100' : 'bg-cream-soft'
          )} />
        </div>
      </div>
    </div>
  );
}

interface SkeletonCardGridProps {
  count?: number;
  className?: string;
  variant?: 'default' | 'douyin';
  columns?: string;
}

export function SkeletonCardGrid({
  count = 8,
  className,
  variant = 'default',
  columns,
}: SkeletonCardGridProps) {
  const isDouyin = variant === 'douyin';
  const gridCols = columns || (isDouyin
    ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4');

  return (
    <div className={cn('grid gap-4', gridCols, className)}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} variant={variant} />
      ))}
    </div>
  );
}
