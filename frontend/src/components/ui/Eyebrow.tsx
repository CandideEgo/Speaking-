import { cn } from "@/lib/utils";

interface EyebrowProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Small brand-colored pill badge with a leading dot.
 * Used as a section/feature label above headings.
 */
export function Eyebrow({ children, className }: EyebrowProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[13px] font-semibold text-brand-500 bg-brand-50 px-3.5 py-1.5 rounded-pill mb-6",
        className,
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
      {children}
    </span>
  );
}
