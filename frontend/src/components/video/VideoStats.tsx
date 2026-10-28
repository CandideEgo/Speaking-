import { Bookmark, Play, ThumbsUp } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";

/**
 * 站内互动数：点赞 / 播放 / 收藏。
 *
 * 0 是合法数据，必须显示（站内刚起步时几乎全是 0，隐藏会让卡片看起来没有
 * 任何可比较信息）；只有字段为 `null`（平台条目没有站内计数）才不渲染。
 * 三个都为 null 时整行不出现。
 */
export function VideoStats({
  likeCount,
  viewCount,
  favoriteCount,
  className,
  size = "md",
}: {
  likeCount?: number | null;
  viewCount?: number | null;
  favoriteCount?: number | null;
  className?: string;
  size?: "sm" | "md";
}) {
  const items = [
    { key: "like", value: likeCount, label: "点赞数", Icon: ThumbsUp },
    { key: "view", value: viewCount, label: "本站播放量", Icon: Play },
    { key: "favorite", value: favoriteCount, label: "收藏数", Icon: Bookmark },
  ].filter((item): item is typeof item & { value: number } => item.value != null);

  if (!items.length) return null;
  const iconSize = size === "sm" ? 12 : 13;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-muted",
        size === "sm" ? "text-caption" : "text-meta",
        className
      )}
    >
      {items.map(({ key, value, label, Icon }) => (
        <span
          key={key}
          className="inline-flex items-center gap-1"
          title={label}
          aria-label={`${label} ${formatCount(Number(value))}`}
        >
          <Icon size={iconSize} className="text-muted-soft" aria-hidden />
          {formatCount(Number(value))}
        </span>
      ))}
    </div>
  );
}
