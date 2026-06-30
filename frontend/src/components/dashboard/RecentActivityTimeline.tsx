"use client";

import Link from "next/link";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/Card";
import type { LearningRecord } from "@/types";

interface RecentActivityTimelineProps {
  records: LearningRecord[];
}

export default function RecentActivityTimeline({
  records,
}: RecentActivityTimelineProps) {
  if (records.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-sm text-muted-foreground">
          还没有学习记录。去{" "}
          <Link href="/browse" className="text-coral hover:underline">
            浏览视频
          </Link>{" "}
          开始学习吧！
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((record) => (
        <Link
          key={record.id}
          href={`/watch/${record.video_id}`}
          className="flex items-center gap-4 p-3 rounded-lg hover:bg-cream-soft transition-colors group"
        >
          {/* Thumbnail */}
          <div className="h-10 w-14 rounded-md bg-cream-card overflow-hidden flex-shrink-0">
            {record.video?.thumbnail_url ? (
              <img
                src={record.video.thumbnail_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                🎬
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate group-hover:text-coral transition-colors">
              {record.video?.title || "未知视频"}
            </p>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
              <span>{record.speaking_attempts} 次跟读</span>
              {record.quiz_score !== null && (
                <span>测验 {Math.round(record.quiz_score)} 分</span>
              )}
              {record.progress_percentage > 0 && (
                <span>进度 {Math.round(record.progress_percentage)}%</span>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-16 flex-shrink-0">
            <div className="h-1.5 rounded-full bg-cream-card">
              <div
                className="h-full rounded-full bg-coral transition-all"
                style={{
                  width: `${Math.min(record.progress_percentage, 100)}%`,
                }}
              />
            </div>
          </div>

          {/* Time */}
          {record.last_accessed_at && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {timeAgo(record.last_accessed_at)}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} 天前`;
  return date.toLocaleDateString("zh-CN");
}
