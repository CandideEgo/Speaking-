"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Input primitive — thin wrapper over the `.input-field` focus-ring styling,
 * exposing it as a composable React component (with ref forwarding) so call
 * sites can drop the `className="input-field"` boilerplate. textarea variant
 * for multi-line.
 */
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      className={cn(
        "w-full rounded-sm border border-hairline bg-surface-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:bg-canvas focus:outline-none focus:ring-[3px] focus:ring-[rgba(10,10,10,0.06)] transition-colors duration-150",
        className,
      )}
      {...props}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "w-full rounded-sm border border-hairline bg-surface-card px-3.5 py-2.5 text-sm text-ink placeholder:text-muted-soft focus:border-ink focus:bg-canvas focus:outline-none focus:ring-[3px] focus:ring-[rgba(10,10,10,0.06)] transition-colors duration-150",
        className,
      )}
      {...props}
    />
  );
});
