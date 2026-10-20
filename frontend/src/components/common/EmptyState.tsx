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

/**
 * Empty-state placeholder with a staggered children fade-in.
 *
 * Previously animated with GSAP; now uses the CSS `stagger-container`
 * keyframes so the widely-mounted component adds no JS to the bundle.
 */
export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "stagger-container flex flex-col items-center justify-center py-20 text-center",
        className
      )}
    >
      {Icon && (
        <span className="mb-4 inline-grid size-12 place-items-center rounded-full bg-surface-card text-muted">
          <Icon size={24} />
        </span>
      )}
      <p className="text-copy font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-[32rem] text-copy text-muted">{description}</p>}
      {action && (
        <div className="mt-3 flex flex-wrap items-center justify-center gap-3">{action}</div>
      )}
    </div>
  );
}
