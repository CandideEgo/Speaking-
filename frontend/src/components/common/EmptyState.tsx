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
      {Icon && <Icon size={48} className="mx-auto text-muted mb-4" />}
      <p className="text-muted">{title}</p>
      {description && <p className="mt-1 text-xs text-muted max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
