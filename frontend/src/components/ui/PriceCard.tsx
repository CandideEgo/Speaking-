import { cn } from "@/lib/utils";

interface PriceCardProps {
  /** Whether this is the highlighted/popular plan */
  popular?: boolean;
  /** Ribbon text shown when popular (default "最受欢迎") */
  ribbonText?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Pricing plan card with optional popular highlight and ribbon.
 * Replaces the price-card/price-pop/price-ribbon CSS pattern.
 */
export function PriceCard({
  popular,
  ribbonText = "最受欢迎",
  children,
  className,
}: PriceCardProps) {
  return (
    <div
      className={cn(
        "bg-canvas border border-hairline rounded-lg p-[30px] flex flex-col",
        popular && "border-ink border-2 relative",
        className,
      )}
    >
      {popular && (
        <div className="absolute -top-[13px] left-1/2 -translate-x-1/2 bg-ink text-on-primary text-[11px] font-bold px-3 py-1 rounded-pill tracking-caption-wide">
          {ribbonText}
        </div>
      )}
      {children}
    </div>
  );
}
