import { Loader2 } from "lucide-react";

interface FullPageSpinnerProps {
  /** Spinner size: "sm" (h-6), "md" (h-8), "lg" (h-10) — default "md" */
  size?: "sm" | "md" | "lg";
}

const sizeMap = { sm: 6, md: 8, lg: 10 } as const;

/**
 * Centered spinner that fills the viewport.
 * Use for auth guards, initial page loads, and route transitions.
 */
export function FullPageSpinner({ size = "md" }: FullPageSpinnerProps) {
  const s = sizeMap[size];
  return (
    <div className="flex h-screen items-center justify-center bg-canvas">
      <div
        className={`${s} ${s} animate-spin rounded-full border-2 border-brand-500 border-t-transparent`}
      />
    </div>
  );
}

interface InlineSpinnerProps {
  /** Loader2 icon size in px — default 24 */
  size?: number;
  /** Additional classes on the wrapper div */
  className?: string;
}

/**
 * Inline section spinner (Loader2 icon centered in a padded area).
 * Use for content-area loading states within a page.
 */
export function InlineSpinner({ size = 24, className }: InlineSpinnerProps) {
  return (
    <div className={`flex justify-center py-20 ${className ?? ""}`}>
      <Loader2 size={size} className="animate-spin text-brand-500" />
    </div>
  );
}
