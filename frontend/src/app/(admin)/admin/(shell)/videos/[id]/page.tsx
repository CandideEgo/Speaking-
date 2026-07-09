"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { ArrowLeft, Loader2, RefreshCw, Save } from "lucide-react";

import {
  getVideoDetail,
  listSubtitleRevisions,
  mergeSubtitle,
  recomputeWordLevels,
  resegmentSubtitles,
  rollbackResegment,
  rollbackSubtitle,
  splitSubtitle,
  updateSubtitle,
  updateVideo,
  updateWordLevels,
  type SubtitlePatch,
  type SubtitleSplitPayload,
} from "@/lib/adminData";
import { VideoSubtitleEditorPanel } from "@/components/video-edit/VideoSubtitleEditorPanel";
import { VideoStatusBadge } from "@/components/video/VideoStatus";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { Subtitle, VideoWithSubtitles } from "@/types";

const DIFFICULTY_OPTIONS = ["A1", "A2", "B1", "B2", "C1", "C2"];

export default function VideoEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [video, setVideo] = useState<VideoWithSubtitles | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await getVideoDetail(params.id);
        if (!cancelled) setVideo(v);
      } catch (err) {
        toastApiError(err, "加载视频失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  const doRecomputeAll = useCallback(async () => {
    try {
      const res = await recomputeWordLevels(params.id);
      toast.success(
        `已重算 ${res.subtitles_updated} 条字幕的高亮（${res.exam_words_found} 个考级词）`,
      );
      setVideo(await getVideoDetail(params.id));
    } catch (err) {
      toastApiError(err, "重算失败");
    }
  }, [params.id]);

  const handleRecomputeAll = useCallback(() => {
    setConfirmState({
      title: "重算全部高亮",
      message: "用 ECDICT 重新计算所有字幕的单词高亮，将覆盖手动标注。继续？",
      onConfirm: doRecomputeAll,
    });
  }, [doRecomputeAll]);

  // Split/merge/rollback change the subtitle LIST structure (row count), so
  // re-fetch the whole video rather than patching in place.
  const refreshVideo = useCallback(async () => {
    setVideo(await getVideoDetail(params.id));
  }, [params.id]);

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

  // --- Subtitle edit callbacks (admin API). Errors propagate to
  // SubtitleEditor/SubtitleHistory, which render the toast. ---
  const handleSaveSubtitle = async (subId: string, patch: SubtitlePatch) => {
    const updated = await updateSubtitle(video!.id, subId, patch);
    handleSubtitleSaved(updated);
    return updated;
  };
  const handleSplit = useCallback(
    async (subId: string, payload: SubtitleSplitPayload) => {
      await splitSubtitle(params.id, subId, payload);
      await refreshVideo();
    },
    [params.id, refreshVideo],
  );
  const handleMerge = useCallback(
    async (subId: string) => {
      await mergeSubtitle(params.id, subId);
      await refreshVideo();
    },
    [params.id, refreshVideo],
  );
  const handleSaveWordLevels = async (
    subId: string,
    levels: Record<string, string[]> | null,
  ) => {
    const updated = await updateWordLevels(video!.id, subId, levels);
    handleSubtitleSaved(updated);
    return updated;
  };
  const handleListRevisions = (subId: string) =>
    listSubtitleRevisions(video!.id, subId);
  const handleRollback = async (subId: string, revisionId: string) => {
    await rollbackSubtitle(video!.id, subId, revisionId);
    await refreshVideo();
  };

  const doResegment = useCallback(async () => {
    try {
      const res = await resegmentSubtitles(params.id);
      toast.success(
        `已重断句：${res.before_count} → ${res.after_count} 句（翻译已清空，请重译）`,
      );
      await refreshVideo();
    } catch (err) {
      toastApiError(err, "重断句失败");
    }
  }, [params.id, refreshVideo]);

  const handleResegment = useCallback(() => {
    setConfirmState({
      title: "重新断句",
      message:
        "重新断句会把所有字幕按句末标点重新切分，并清空中文翻译（断句变了需重译）。可在管理员审核后用「回滚重断句」恢复。继续？",
      onConfirm: doResegment,
    });
  }, [doResegment]);

  const doRollbackResegment = useCallback(async () => {
    try {
      const res = await rollbackResegment(params.id);
      toast.success(`已回滚（恢复 ${res.restored_count} 句）`);
      await refreshVideo();
    } catch (err) {
      toastApiError(err, "回滚失败");
    }
  }, [params.id, refreshVideo]);

  const handleRollbackResegment = useCallback(() => {
    setConfirmState({
      title: "回滚重断句",
      message: "回滚到上次重断句前的字幕状态？",
      onConfirm: doRollbackResegment,
    });
  }, [doRollbackResegment]);

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

  const headerExtra = (
    <>
      <Button
        onClick={handleResegment}
        variant="secondary"
        size="compact"
        title="按句末标点重新切分所有字幕（会清空翻译，可回滚）"
      >
        重新断句
      </Button>
      <Button
        onClick={handleRollbackResegment}
        variant="outline"
        size="compact"
        title="回滚到上次重断句前"
      >
        回滚重断句
      </Button>
      <Button
        onClick={handleRecomputeAll}
        variant="secondary"
        size="compact"
        icon={RefreshCw}
        title="用 ECDICT 重新计算所有字幕的单词高亮（覆盖手动标注）"
      >
        重算全部高亮
      </Button>
    </>
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

      <VideoSubtitleEditorPanel
        video={video}
        canEdit
        onSaveSubtitle={handleSaveSubtitle}
        onSplit={handleSplit}
        onMerge={handleMerge}
        onSaveWordLevels={handleSaveWordLevels}
        onListRevisions={handleListRevisions}
        onRollback={handleRollback}
        headerExtra={headerExtra}
      />

      <ConfirmDialog
        open={!!confirmState}
        tone="danger"
        title={confirmState?.title}
        message={confirmState?.message ?? ""}
        confirmLabel="确认"
        onClose={() => setConfirmState(null)}
        onConfirm={() => {
          const s = confirmState;
          setConfirmState(null);
          s?.onConfirm();
        }}
      />
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
  const [showOnHomepage, setShowOnHomepage] = useState(
    "show_on_homepage" in video ? (video.show_on_homepage as boolean) : false,
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
        show_on_homepage: showOnHomepage,
        is_published: isPublished,
        admin_notes: adminNotes || null,
      });
      onChanged({ ...video, ...updated, subtitles: video.subtitles });
      toast.success("已保存");
    } catch (err) {
      toastApiError(err, "保存失败");
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
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            难度
          </label>
          <Select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">未设置</option>
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            标签
          </label>
          <Input
            type="text"
            value={topicTags}
            onChange={(e) => setTopicTags(e.target.value)}
            placeholder="逗号分隔"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            备注
          </label>
          <Input
            type="text"
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
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
            checked={showOnHomepage}
            onChange={(e) => setShowOnHomepage(e.target.checked)}
          />
          首页展示
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
