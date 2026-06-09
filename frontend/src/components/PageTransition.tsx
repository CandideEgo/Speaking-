'use client';

import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { DURATIONS, EASES, MEDIA, motionDuration } from '@/lib/animations';
import { cn } from '@/lib/utils';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export function PageTransition({ children, className }: PageTransitionProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add(MEDIA.reduceMotion, (context) => {
      const reduceMotion = context.conditions?.reduceMotion as boolean;
      gsap.fromTo(ref.current,
        { autoAlpha: 0, y: 8 },
        {
          autoAlpha: 1,
          y: 0,
          duration: motionDuration(DURATIONS.pageEnter, reduceMotion),
          ease: EASES.smooth,
        }
      );
    });
    return () => mm.revert();
  }, { scope: ref });

  return (
    <div ref={ref} className={cn('', className)}>
      {children}
    </div>
  );
}
