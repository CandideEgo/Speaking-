import { cn } from "@/lib/utils";

/**
 * 原平台简介常把推广链接与 `*** 大写喊话 ***` 直接塞进正文。
 * 预览卡只有两行：链接点不动，星号是上游的排版残留，都挤掉真正的介绍，
 * 所以展示前统一去掉。
 */
function cleanForPreview(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/www\.\S+/gi, "")
    .replace(/\*{2,}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

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
  const raw = dek?.trim() || description?.trim();
  const text = raw ? cleanForPreview(raw) : "";
  if (!text) return null;
  return (
    <p className={cn("line-clamp-2 break-words text-meta leading-relaxed text-body", className)}>
      {text}
    </p>
  );
}
