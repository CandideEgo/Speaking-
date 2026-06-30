"use client";

import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Select primitive — same focus-ring styling as Input/Textarea, exposing
 * it as a composable React component with ref forwarding so call sites can
 * drop the `className="input-field"` boilerplate.
 */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        "w-full rounded-sm border border-hairline bg-surface-card px-3.5 py-2.5 text-sm text-ink focus:border-ink focus:bg-canvas focus:outline-none focus:ring-[3px] focus:ring-[rgba(10,10,10,0.06)] transition-colors duration-150",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
