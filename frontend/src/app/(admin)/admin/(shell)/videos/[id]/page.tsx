"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, RefreshCw, Save } from "lucide-react";

import {
  getVideoDetail,
  recomputeWordLevels,
  updateSubtitle,
  updateVideo,
  updateWordLevels,
} from "@/lib/adminData";
import { mediaUrl } from "@/lib/api";
import { SubtitleEditor } from "@/components/video-edit/SubtitleEditor";
import { VideoStatusBadge } from "@/components/video/VideoStatus";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Subtitle, VideoWithSubtitles } from "@/types";

const DIFFICULTY_OPTIONS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function VideoEditPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [video, setVideo] = useState<VideoWithSubtitles | null>(null);
  const [loading, setLoading] = useState(true);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await getVideoDetail(params.id);
        if (!cancelled) setVideo(v);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "加载视频失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const handleRecomputeAll = useCallback(async () => {
    try {
      const res = await recomputeWordLevels(params.id);
      toast.success(
        `已重算 ${res.subtitles_updated} 条字幕的高亮（${res.exam_words_found} 个考级词）`,
      );
      const v = await getVideoDetail(params.id);
      setVideo(v);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "重算失败");
    }
  }, [params.id]);

  const seekTo = useCallback((time: number) => {
    const el = videoElRef.current;
    if (el) {
      el.currentTime = time;
      el.play().catch(() => {});
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }
  if (!video) {
    return (
      <div className="py-20 text-center text-muted-foreground">视频未找到</div>
    );
  }

  const hasLocalVideo = Boolean(
    video.video_url_720p || video.video_url_480p || video.video_url_1080p,
  );

  const handleSubtitleSaved = (updated: Subtitle) =>
    setVideo((v) =>
      v
        ? {
            ...v,
            subtitles: v.subtitles.map((s) =>
              s.id === updated.id ? updated : s,
            ),
          }
        : v,
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          onClick={() => router.push("/admin/videos")}
          variant="outline"
          size="compact"
          icon={ArrowLeft}
        >
          返回列表
        </Button>
        <h1 className="text-lg font-semibold truncate">{video.title}</h1>
        <VideoStatusBadge status={video.status} />
      </div>

      <MetadataForm video={video} onChanged={setVideo} />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-6 items-start">
        {/* Player preview (sticky) — solves "timing typed blind": click a
            subtitle's # to jump, or use the ● capture buttons to set start/end
            from the current playback time. */}
        <div className="lg:sticky lg:top-6 space-y-2">
          <div className="aspect-video w-full overflow-hidden rounded-sm bg-ink/5 flex items-center justify-center">
            {hasLocalVideo && video.video_url_720p ? (
              <video
                ref={videoElRef}
                src={mediaUrl(video.video_url_720p)}
                controls
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="text-center p-4 text-xs text-muted-foreground">
                无本地视频文件，无法预览时间轴
              </div>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            点击字幕序号跳转到该句；编辑时间轴时点 ● 取当前播放时间。
          </p>
        </div>

        {/* Subtitle list */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">字幕编辑</h2>
            <Button
              onClick={handleRecomputeAll}
              variant="secondary"
              size="compact"
              icon={RefreshCw}
              title="用 ECDICT 重新计算所有字幕的单词高亮（覆盖手动标注）"
            >
              重算全部高亮
            </Button>
          </div>

          <div className="space-y-3">
            {video.subtitles.length === 0 && (
              <div className="text-center text-muted-foreground py-8 text-sm">
                暂无字幕（视频可能仍在处理中）
              </div>
            )}
            {video.subtitles.map((sub) => (
              <SubtitleEditor
                key={sub.id}
                subtitle={sub}
                videoRef={videoElRef}
                onSeekTo={seekTo}
                onSave={(patch) =>
                  updateSubtitle(video.id, sub.id, patch).then((updated) => {
                    handleSubtitleSaved(updated);
                    return updated;
                  })
                }
                onSaveWordLevels={(wordLevels) =>
                  updateWordLevels(video.id, sub.id, wordLevels).then(
                    (updated) => {
                      handleSubtitleSaved(updated);
                      return updated;
                    },
                  )
                }
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata form — title / difficulty / tags / official / featured / published
// ---------------------------------------------------------------------------

function MetadataForm({
  video,
  onChanged,
}: {
  video: VideoWithSubtitles;
  onChanged: (v: VideoWithSubtitles) => void;
}) {
  const [title, setTitle] = useState(video.title);
  const [difficulty, setDifficulty] = useState(video.difficulty_level || "");
  const [topicTags, setTopicTags] = useState(video.topic_tags || "");
  const [isOfficial, setIsOfficial] = useState(video.is_official);
  const [isFeatured, setIsFeatured] = useState(
    "is_featured" in video ? (video.is_featured as boolean) : false,
  );
  const [isPublished, setIsPublished] = useState(video.is_published);
  const [adminNotes, setAdminNotes] = useState(
    "admin_notes" in video ? ((video.admin_notes as string | null) ?? "") : "",
  );
  const [saving, setSaving] = useState(false);

  const canPublish = video.status === "ready";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateVideo(video.id, {
        title,
        difficulty_level: difficulty || null,
        topic_tags: topicTags || null,
        is_official: isOfficial,
        is_featured: isFeatured,
        is_published: isPublished,
        admin_notes: adminNotes || null,
      });
      onChanged({ ...video, ...updated, subtitles: video.subtitles });
      toast.success("已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card as="form" padding={4} className="space-y-4" onSubmit={handleSave}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            标题
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            难度
          </label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            className="input-field"
          >
            <option value="">未设置</option>
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            标签
          </label>
          <input
            type="text"
            value={topicTags}
            onChange={(e) => setTopicTags(e.target.value)}
            placeholder="逗号分隔"
            className="input-field"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            备注
          </label>
          <input
            type="text"
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            className="input-field"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isOfficial}
            onChange={(e) => setIsOfficial(e.target.checked)}
          />
          官方
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isFeatured}
            onChange={(e) => setIsFeatured(e.target.checked)}
          />
          精选
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={isPublished}
            disabled={!canPublish && !isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
          />
          已发布
          {!canPublish && !isPublished && (
            <span className="text-xs text-muted-foreground">
              （需 status=ready）
            </span>
          )}
        </label>
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saving}
          size="sm"
          icon={saving ? Loader2 : Save}
        >
          保存元数据
        </Button>
      </div>
    </Card>
  );
}
