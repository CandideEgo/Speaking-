"use client";

import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
}

export function FormField({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
  labelClassName,
}: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className={cn("block text-sm font-medium text-ink", labelClassName)}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-error">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
