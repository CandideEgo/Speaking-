"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { DURATIONS, EASES, MEDIA, motionDuration } from "@/lib/animations";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** Override padding — default "py-20" */
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
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
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className={cn(
        "flex flex-col items-center justify-center py-20 text-center animate-fade-in",
        className,
      )}
    >
      {Icon && <Icon size={48} className="mx-auto text-muted mb-4" />}
      <p className="text-muted">{title}</p>
      {description && (
        <p className="mt-1 text-xs text-muted max-w-xs">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
