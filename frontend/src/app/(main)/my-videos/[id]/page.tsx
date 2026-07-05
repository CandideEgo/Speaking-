"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { toastApiError, apiErrorMessage } from "@/lib/errors";
import {
  ArrowLeft,
  Loader2,
  Send,
  Undo2,
  Pencil,
  Plus,
  Trash2,
  RefreshCw,
  Play,
  X,
} from "lucide-react";

import { api, mediaUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useStickyPip } from "@/hooks/useStickyPip";
import { useVideoStatusPolling } from "@/hooks/useVideoStatusPolling";
import { TARGET_LEVEL_OPTIONS } from "@/lib/examLevels";
import { STEP_LABELS_SHORT } from "@/lib/videoStatus";
import {
  beginEdit,
  editPractice,
  getMyVideoDetail,
  getMyVideoStatus,
  regeneratePractice,
  submitForReview,
  updateSubtitle,
  updateWordLevels,
  withdrawSubmission,
  type PracticeItem,
  type SubtitlePatch,
} from "@/lib/creatorData";
import { SubtitleEditor } from "@/components/video-edit/SubtitleEditor";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { Select } from "@/components/ui/Select";
import { TabPills } from "@/components/ui/TabPills";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import type { Subtitle, Video, VideoWithSubtitles } from "@/types";

export default function MyVideoEditorPage() {
  const params = useParams<{ id: string }>();
  const videoId = params.id;
  const { isAuthenticated, isLoading } = useRequireAuth();

  const [video, setVideo] = useState<VideoWithSubtitles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"subtitles" | "practice">(
    "subtitles",
  );

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const { isPip, dismiss } = useStickyPip(
    slotRef,
    isMobile && !!video?.video_url_720p,
  );

  const load = useCallback(async () => {
    try {
      setVideo(await getMyVideoDetail(videoId));
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err, "加载失败"));
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    load();
  }, [isAuthenticated, isLoading, load]);

  // Unified polling via useVideoStatusPolling. Fixes the bug where
  // video_url_720p was not patched during polling (stale URL after
  // transcoding).
  useVideoStatusPolling(videoId, video?.status ?? "pending_processing", {
    fetchStatus: async (id) => {
      const st = await getMyVideoStatus(id);
      return {
        status: st.status as string,
        processing_step: st.processing_step,
        video_url_720p: st.video_url_720p ?? undefined,
        processing_progress: st.processing_progress,
        error_message: st.error_message,
      };
    },
    onTerminal: () => {
      // Reload full video detail on terminal states to pick up
      // review_status, subtitles, and video URLs.
      load();
    },
    onPatch: (patch) => {
      setVideo((v) =>
        v
          ? {
              ...v,
              status: patch.status as VideoWithSubtitles["status"],
              processing_step: patch.processing_step,
              processing_progress:
                patch.processing_progress ?? v.processing_progress,
              error_message: patch.error_message ?? v.error_message,
              video_url_720p: patch.video_url_720p ?? v.video_url_720p,
            }
          : v,
      );
    },
  });

  const seekTo = useCallback((time: number) => {
    const el = videoElRef.current;
    if (el) {
      el.currentTime = time;
      el.play().catch(() => {});
    }
  }, []);

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  if (loading) {
    return <FullPageSpinner />;
  }

  if (error || !video) {
    return (
      <main className="min-h-full bg-canvas">
        <div className="container-page py-8">
          <LinkButton href="/my-videos" variant="outline" icon={ArrowLeft}>
            返回
          </LinkButton>
          <p className="mt-6 text-muted">{error || "视频不存在或无权访问"}</p>
        </div>
      </main>
    );
  }

  const isProcessing =
    video.status === "processing" || video.status === "ready_subtitles";
  const isPublished = video.review_status === "published";
  const isPending = video.review_status === "pending_review";
  // Editable only in draft / rejected review states (aligns with the list
  // page). Previously `!isPublished` let pending_review show "提交审核" again,
  // which errored on resubmit.
  const editable =
    video.status === "ready" &&
    (video.review_status === "draft" || video.review_status === "rejected");

  const handleSaveSubtitle =
    (subtitleId: string) => async (patch: SubtitlePatch) => {
      try {
        const updated = await updateSubtitle(videoId, subtitleId, patch);
        setVideo((v) =>
          v
            ? {
                ...v,
                subtitles: v.subtitles.map((s) =>
                  s.id === subtitleId ? updated : s,
                ),
              }
            : v,
        );
        return updated;
      } catch (err) {
        toastApiError(err, "保存字幕失败");
        throw err;
      }
    };

  const handleSaveWordLevels =
    (subtitleId: string) =>
    async (wordLevels: Record<string, string[]> | null) => {
      try {
        const updated = await updateWordLevels(videoId, subtitleId, wordLevels);
        setVideo((v) =>
          v
            ? {
                ...v,
                subtitles: v.subtitles.map((s) =>
                  s.id === subtitleId ? updated : s,
                ),
              }
            : v,
        );
        return updated;
      } catch (err) {
        toastApiError(err, "保存词级标注失败");
        throw err;
      }
    };

  const reviewAction = async (
    fn: (id: string) => Promise<Video>,
    label: string,
  ) => {
    try {
      const updated = await fn(videoId);
      setVideo((v) => (v ? { ...v, ...updated } : v));
      toast.success(`${label}成功`);
    } catch (err) {
      toastApiError(err, `${label}失败`);
    }
  };

  return (
    <main className="min-h-full bg-canvas">
      <div className="container-page py-8">
        <LinkButton
          href="/my-videos"
          variant="outline"
          icon={ArrowLeft}
          className="mb-5"
        >
          返回我的视频
        </LinkButton>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="page-title !mb-1">{video.title}</h1>
            <ReviewBadge
              status={video.review_status}
              processing={isProcessing}
              step={video.processing_step}
            />
            {video.review_status === "rejected" && (
              <p className="text-xs text-red mt-2">
                驳回原因：{video.rejection_reason ?? "未提供"}
              </p>
            )}
          </div>

          {/* Review actions */}
          <div className="flex gap-2 flex-wrap">
            {isPublished && (
              <Button
                onClick={() => reviewAction(beginEdit, "开始编辑")}
                variant="outline"
                icon={Pencil}
              >
                编辑已发布视频
              </Button>
            )}
            {editable && (
              <Button
                onClick={() => reviewAction(submitForReview, "提交审核")}
                icon={Send}
              >
                提交审核
              </Button>
            )}
            {isPending && (
              <Button
                onClick={() => reviewAction(withdrawSubmission, "撤回")}
                variant="outline"
                icon={Undo2}
              >
                撤回审核
              </Button>
            )}
          </div>
        </div>

        {isProcessing && (
          <div className="bg-brand-50 text-brand-500 rounded-lg p-4 mb-6 text-sm space-y-2">
            <div className="flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" />
              视频处理中
              {video.processing_step
                ? ` · ${STEP_LABELS_SHORT[video.processing_step] || video.processing_step}`
                : ""}
              {video.processing_progress
                ? `（${video.processing_progress}%）`
                : ""}
              ，完成后即可编辑。
            </div>
            {video.processing_progress != null &&
              video.processing_progress > 0 && (
                <div className="h-1.5 w-full rounded-full bg-brand-500/20">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all duration-500"
                    style={{
                      width: `${Math.min(video.processing_progress, 100)}%`,
                    }}
                  />
                </div>
              )}
          </div>
        )}

        {/* Error state */}
        {video.status === "error" && (
          <div className="bg-red-50 text-red-700 rounded-lg p-4 mb-6 space-y-2">
            <div className="text-sm font-medium">
              视频处理失败
              {video.processing_step
                ? ` · 卡在 ${STEP_LABELS_SHORT[video.processing_step] || video.processing_step}`
                : ""}
            </div>
            {video.error_message && (
              <div className="text-xs break-all">{video.error_message}</div>
            )}
            <div className="text-xs text-red-500">
              请返回创作者中心重新提交该视频链接。
            </div>
          </div>
        )}

        {/* Player + editor side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 items-start">
          {/* Player */}
          <div className="lg:sticky lg:top-6">
            <div
              ref={slotRef}
              className="relative aspect-video bg-ink rounded-lg overflow-hidden"
            >
              {/* Wrapper: in-flow when normal, fixed mini-player when pip. The
                  <video> lives inside and is never re-parented, so playback
                  state survives the switch. */}
              <div
                className={cn(
                  "transition-all duration-300",
                  isPip
                    ? "fixed bottom-4 right-4 z-50 w-[160px] max-w-[40vw] aspect-video rounded-lg shadow-2xl"
                    : "absolute inset-0",
                )}
              >
                {video.video_url_720p ? (
                  <>
                    <video
                      ref={videoElRef}
                      src={mediaUrl(video.video_url_720p ?? "")}
                      controls
                      className="h-full w-full"
                    />
                    {isPip && (
                      <button
                        type="button"
                        onClick={dismiss}
                        className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink text-white shadow hover:bg-ink/80"
                        aria-label="关闭小窗播放"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-on-primary/40">
                    <Play size={40} />
                  </div>
                )}
              </div>
            </div>
            <p className="text-xs text-muted mt-2">
              编辑字幕时可点 ● 按钮取当前播放时间填入时间轴。
            </p>
          </div>

          {/* Editor */}
          <div>
            {/* Tabs */}
            <TabPills
              tabs={[
                { key: "subtitles", label: "字幕" },
                { key: "practice", label: "练习题" },
              ]}
              activeKey={activeTab}
              onChange={setActiveTab}
              className="mb-4"
            />

            {isPublished && (
              <div className="bg-warning-soft text-warning rounded-lg p-3 mb-4 text-xs">
                视频已发布。要修改内容请先点击上方"编辑已发布视频"，修改后会触发重新审核，公开版保留当前版本。
              </div>
            )}

            {activeTab === "subtitles" ? (
              <div className="space-y-3">
                {video.subtitles.length === 0 ? (
                  <p className="text-sm text-muted py-8 text-center">
                    暂无字幕。
                  </p>
                ) : (
                  video.subtitles.map((s: Subtitle) => (
                    <SubtitleEditor
                      key={s.id}
                      subtitle={s}
                      videoRef={videoElRef}
                      onSeekTo={seekTo}
                      onSave={handleSaveSubtitle(s.id)}
                      onSaveWordLevels={handleSaveWordLevels(s.id)}
                    />
                  ))
                )}
              </div>
            ) : (
              <PracticeEditor
                videoId={videoId}
                editable={editable || isPending}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function ReviewBadge({
  status,
  processing,
  step,
}: {
  status: string;
  processing: boolean;
  step: string | null;
}) {
  if (processing) {
    return (
      <span className="text-xs text-brand-500">
        处理中{step ? ` · ${STEP_LABELS_SHORT[step] || step}` : ""}
      </span>
    );
  }
  const map: Record<string, { label: string; tone: BadgeTone }> = {
    draft: { label: "草稿", tone: "neutral" },
    pending_review: { label: "待审核", tone: "amber" },
    published: { label: "已发布", tone: "green" },
    rejected: { label: "已驳回", tone: "red" },
  };
  const m = map[status] ?? map.draft;
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

// ---------------------------------------------------------------------------
// Practice editor
// ---------------------------------------------------------------------------

function PracticeEditor({
  videoId,
  editable,
}: {
  videoId: string;
  editable: boolean;
}) {
  const [level, setLevel] = useState(TARGET_LEVEL_OPTIONS[0]?.key ?? "cet4");
  const [questions, setQuestions] = useState<PracticeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const loadPractice = useCallback(async () => {
    setLoading(true);
    try {
      const set = await api<{ items: PracticeItem[] }>(
        `/api/v1/videos/${videoId}/practice?level=${level}`,
      );
      setQuestions(set.items ?? []);
    } catch (err) {
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [videoId, level]);

  useEffect(() => {
    loadPractice();
  }, [loadPractice]);

  const updateQuestion = (i: number, patch: Partial<PracticeItem>) => {
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)),
    );
  };

  const addQuestion = () => {
    const base: PracticeItem = {
      word: "",
      category: "context",
      type: "context_fill",
      translation: "",
      options: null,
      answer: "",
      sentence_template: null,
    };
    setQuestions((prev) => [...prev, base]);
  };

  const removeQuestion = (i: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const set = await editPractice(videoId, level, questions);
      setQuestions(set.items ?? []);
      toast.success("练习题已保存");
    } catch (err) {
      toastApiError(err, "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const set = await regeneratePractice(videoId, level, 6);
      setQuestions(set.items ?? []);
      toast.success("已重新生成练习题");
    } catch (err) {
      toastApiError(err, "生成失败");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">考级</span>
          <Select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="w-32"
          >
            {TARGET_LEVEL_OPTIONS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          onClick={handleRegenerate}
          disabled={!editable || regenerating}
          variant="outline"
          icon={regenerating ? Loader2 : RefreshCw}
          size="sm"
        >
          AI 重新生成
        </Button>
      </div>

      {loading ? (
        <InlineSpinner className="py-8" size={20} />
      ) : questions.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">
          该考级暂无练习题。点击"AI 重新生成"创建一组。
        </p>
      ) : (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <Card key={i} padding={3} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge tone="brand">语境填空</Badge>
                <span className="text-xs text-muted-foreground ml-auto">
                  第 {i + 1} 题
                </span>
                {editable && (
                  <button
                    onClick={() => removeQuestion(i)}
                    className="text-muted hover:text-red"
                    title="删除"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <Input
                type="text"
                value={q.word}
                onChange={(e) => updateQuestion(i, { word: e.target.value })}
                placeholder="目标单词"
                disabled={!editable}
              />
              <Input
                type="text"
                value={q.sentence_template ?? ""}
                onChange={(e) =>
                  updateQuestion(i, {
                    sentence_template: e.target.value || null,
                  })
                }
                placeholder="句子模板（用 ___ 表示空格）"
                disabled={!editable}
              />
              <Input
                type="text"
                value={q.answer}
                onChange={(e) => updateQuestion(i, { answer: e.target.value })}
                placeholder="答案（填空单词）"
                disabled={!editable}
              />
            </Card>
          ))}
        </div>
      )}

      {editable && (
        <div className="flex gap-2">
          <Button onClick={() => addQuestion()} variant="outline" icon={Plus}>
            添加题目
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            icon={saving ? Loader2 : undefined}
          >
            保存练习题
          </Button>
        </div>
      )}
    </div>
  );
}
