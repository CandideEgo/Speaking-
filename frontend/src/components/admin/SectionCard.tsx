"use client";

import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("card-outline", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            {title && (
              <h2 className="font-display text-2xl text-ink">{title}</h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions}
        </div>
      )}
      <div className={title ? "mt-4" : undefined}>{children}</div>
    </section>
  );
}
