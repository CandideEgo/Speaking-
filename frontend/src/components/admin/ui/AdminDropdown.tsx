"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminDropdownItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export interface AdminDropdownProps {
  items: AdminDropdownItem[];
  trigger?: ReactNode;
  align?: "left" | "right";
  className?: string;
}

export function AdminDropdown({ items, trigger, align = "right", className }: AdminDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className={cn("relative inline-block", className)}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors",
          "hover:bg-surface-soft hover:text-ink",
          open && "bg-surface-soft text-ink"
        )}
      >
        {trigger ?? <MoreHorizontal size={16} />}
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 mt-1 min-w-40 rounded-lg border border-hairline bg-canvas py-1 shadow-lg",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {items.map((item) => (
            <button
              key={item.key}
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                item.onClick();
              }}
              className={cn(
                "flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors",
                item.disabled
                  ? "cursor-not-allowed text-muted-soft"
                  : item.danger
                    ? "text-error hover:bg-error/10"
                    : "text-body hover:bg-surface-soft"
              )}
            >
              {item.icon && <item.icon size={15} />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
