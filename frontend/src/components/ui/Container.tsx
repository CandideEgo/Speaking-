import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Container — the `.container-page` CSS class as a component: caps content at
 * `max-w-page` (1320px) and pads the gutters `px-4 sm:px-7`. Mobile-first:
 * narrow gutters on phones, wider on `sm+`. Polymorphic via `as`.
 */
export function Container({
  as: Tag = "div",
  className,
  children,
  ...props
}: {
  as?: ElementType;
  className?: string;
  children?: ReactNode;
} & Omit<
  React.ComponentPropsWithoutRef<ElementType>,
  "className" | "children"
>) {
  return (
    <Tag
      className={cn("max-w-page mx-auto px-4 sm:px-7", className)}
      {...props}
    >
      {children}
    </Tag>
  );
}
