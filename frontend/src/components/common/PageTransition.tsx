import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Page enter transition — pure CSS fade-in (previously GSAP).
 *
 * GSAP was removed because this component is mounted on every main-app page,
 * which pulled the whole gsap bundle into the shared JS chunk; the CSS
 * `fade-in` keyframes deliver the same effect for zero JS cost.
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  return <div className={cn("animate-fade-in", className)}>{children}</div>;
}
