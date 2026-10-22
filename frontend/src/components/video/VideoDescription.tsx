import { cn } from "@/lib/utils";

/** 选片时的内容介绍：仅使用现有导语或原平台简介，缺失时不占位。 */
export function VideoDescription({
  description,
  dek,
  className,
}: {
  description?: string | null;
  dek?: string | null;
  className?: string;
}) {
  const text = dek?.trim() || description?.trim();
  if (!text) return null;
  return (
    <p className={cn("line-clamp-2 break-words text-meta leading-relaxed text-body", className)}>
      {text}
    </p>
  );
}
