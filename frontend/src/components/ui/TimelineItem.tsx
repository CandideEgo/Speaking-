import { cn } from "@/lib/utils";

interface TimelineItemProps {
  /** Content in the dot circle (usually an icon element) */
  dot: React.ReactNode;
  /** Color class applied to the dot (e.g. "bg-brand-50 text-brand-500") */
  dotColor?: string;
  /** Title — rendered as text by default; pass a ReactNode for links */
  title: React.ReactNode;
  /** Description below the title */
  description?: React.ReactNode;
  /** Timestamp text */
  time?: string;
  /** Whether this is the last item (hides the connecting line) */
  isLast?: boolean;
  className?: string;
}

/**
 * Vertical timeline item with dot, connecting line, and content.
 * Replaces the tl-* CSS pattern from globals.css.
 */
export function TimelineItem({
  dot,
  dotColor,
  title,
  description,
  time,
  isLast = false,
  className,
}: TimelineItemProps) {
  return (
    <div className={cn("flex gap-3.5 items-start", className)}>
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-[13px]", dotColor)}>
          {dot}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-hairline min-h-6 my-1" />}
      </div>
      <div className="flex-1 pb-1">
        {typeof title === "string" ? (
          <div className="text-sm font-semibold">{title}</div>
        ) : (
          title
        )}
        {description && (
          <div className="text-[13px] text-muted mt-0.5">{description}</div>
        )}
        {time && <div className="text-xs text-muted-soft mt-1">{time}</div>}
      </div>
    </div>
  );
}
