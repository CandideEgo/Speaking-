import type { ElementType } from "react";
import { cn } from "@/lib/utils";
import { videoTitleEn, videoTitleZh, type VideoTitleLike } from "@/lib/videoDisplay";

/**
 * 中英文双行视频标题：中文为主标题，英文原名作次级信息。
 *
 * `as` 让调用方保留正确的标题层级（页面 h1 / 卡片 h2 / 列表 p），组件只负责
 * 两行文本的截断与颜色。没有中文标题时英文就是主标题，不再重复一行。
 */
export function VideoTitle({
  video,
  as: Tag = "p",
  className,
  zhClassName,
  enClassName,
  clampZh = 2,
  clampEn = true,
}: {
  video: VideoTitleLike;
  as?: ElementType;
  className?: string;
  zhClassName?: string;
  enClassName?: string;
  /** 中文主标题最多显示几行（默认 2；0 = 不截断）。 */
  clampZh?: 0 | 1 | 2 | 3;
  clampEn?: boolean;
}) {
  const zh = videoTitleZh(video);
  const en = videoTitleEn(video);
  return (
    <Tag
      className={cn("block min-w-0", className)}
      title={en ? `${zh} · ${video.title}` : undefined}
    >
      <span
        className={cn(
          "block",
          clampZh === 1 && "line-clamp-1",
          clampZh === 2 && "line-clamp-2",
          clampZh === 3 && "line-clamp-3",
          zhClassName
        )}
      >
        {zh}
      </span>
      {en && (
        <span
          lang="en"
          className={cn(
            "mt-0.5 block text-meta font-normal leading-snug text-muted",
            clampEn && "line-clamp-1",
            enClassName
          )}
        >
          {en}
        </span>
      )}
    </Tag>
  );
}
