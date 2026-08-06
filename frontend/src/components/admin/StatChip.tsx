import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * StatChip — compact KPI tile for admin stat strips (prototypes 28/29/30).
 *
 * Either pass an `icon` (lucide) or `children` for a custom icon node.
 * Numbers render with thousands separators; strings render as-is.
 */
export function StatChip({
  icon: Icon,
  value,
  label,
  iconClass,
  children,
}: {
  icon?: LucideIcon;
  value: string | number;
  label: string;
  iconClass: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-hairline bg-canvas px-3.5 py-2.5 text-xs">
      <div className={`flex h-[30px] w-[30px] items-center justify-center rounded ${iconClass}`}>
        {Icon ? <Icon size={16} /> : children}
      </div>
      <div>
        <div className="font-mono text-[17px] font-extrabold leading-tight text-ink">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        <div className="text-muted">{label}</div>
      </div>
    </div>
  );
}
