'use client';

import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { DURATIONS, EASES, MEDIA, motionDuration } from '@/lib/animations';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MEDIA.reduceMotion, (context) => {
      const reduceMotion = context.conditions?.reduceMotion as boolean;
      const duration = motionDuration(0.5, reduceMotion);
      const stagger = reduceMotion ? 0 : 0.06;

      gsap.from(ref.current!.children, {
        y: 12,
        autoAlpha: 0,
        duration,
        stagger,
        ease: EASES.smooth,
      });
    });
    return () => mm.revert();
  }, { scope: ref });

  return (
    <div ref={ref} className={cn('flex flex-col items-center justify-center py-16 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-soft text-olive">
        <Icon size={24} strokeWidth={1.5} />
      </div>
      <p className="mt-4 text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 text-xs text-olive max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
