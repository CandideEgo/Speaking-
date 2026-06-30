"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
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
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import { TARGET_LEVEL_OPTIONS } from "@/lib/examLevels";
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
  type PracticeQuestion,
  type SubtitlePatch,
} from "@/lib/creatorData";
import { SubtitleEditor } from "@/components/video-edit/SubtitleEditor";
import type { Subtitle, Video, VideoWithSubtitles } from "@/types";

export default function MyVideoEditorPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const videoId = params.id;
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);

  const [video, setVideo] = useState<VideoWithSubtitles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"subtitles" | "practice">(
    "subtitles",
  );

  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      setVideo(await getMyVideoDetail(videoId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }
    load();
  }, [isAuthenticated, isLoading, router, load]);

  // Poll while processing.
  useEffect(() => {
    if (
      !video ||
      (video.status !== "processing" && video.status !== "ready_subtitles")
    ) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const st = await getMyVideoStatus(videoId);
        if (st.status === "ready" || st.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current);
          await load();
        } else {
          setVideo((v) =>
            v
              ? {
                  ...v,
                  status: st.status as VideoWithSubtitles["status"],
                  processing_step: st.processing_step,
                }
              : v,
          );
        }
      } catch {
        /* swallow */
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [video?.status, videoId, load]);

  const seekTo = useCallback((time: number) => {
    const el = videoElRef.current;
    if (el) {
      el.currentTime = time;
      el.play().catch(() => {});
    }
  }, []);

  if (isLoading || !isAuthenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500" />
      </main>
    );
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 size={24} className="animate-spin text-brand-500" />
      </main>
    );
  }

  if (error || !video) {
    return (
      <main className="min-h-full bg-canvas">
        <div className="container-page py-8">
          <Link
            href="/my-videos"
            className="btn-outline inline-flex items-center gap-1"
          >
            <ArrowLeft size={15} /> 返回
          </Link>
          <p className="mt-6 text-muted">{error || "视频不存在或无权访问"}</p>
        </div>
      </main>
    );
  }

  const isProcessing =
    video.status === "processing" || video.status === "ready_subtitles";
  const isPublished = video.review_status === "published";
  const isPending = video.review_status === "pending_review";
  const editable = video.status === "ready" && !isPublished;

  const handleSaveSubtitle =
    (subtitleId: string) => async (patch: SubtitlePatch) => {
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
    };

  const handleSaveWordLevels =
    (subtitleId: string) =>
    async (wordLevels: Record<string, string[]> | null) => {
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
      toast.error(err instanceof Error ? err.message : `${label}失败`);
    }
  };

  return (
    <main className="min-h-full bg-canvas">
      <div className="container-page py-8">
        <Link
          href="/my-videos"
          className="btn-outline inline-flex items-center gap-1 mb-5"
        >
          <ArrowLeft size={15} /> 返回我的视频
        </Link>

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
              <button
                onClick={() => reviewAction(beginEdit, "开始编辑")}
                className="btn-outline inline-flex items-center gap-1.5"
              >
                <Pencil size={14} /> 编辑已发布视频
              </button>
            )}
            {editable && (
              <button
                onClick={() => reviewAction(submitForReview, "提交审核")}
                className="btn-primary inline-flex items-center gap-1.5"
              >
                <Send size={14} /> 提交审核
              </button>
            )}
            {isPending && (
              <button
                onClick={() => reviewAction(withdrawSubmission, "撤回")}
                className="btn-outline inline-flex items-center gap-1.5"
              >
                <Undo2 size={14} /> 撤回审核
              </button>
            )}
          </div>
        </div>

        {isProcessing && (
          <div className="bg-brand-50 text-brand-500 rounded-lg p-4 mb-6 text-sm flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            视频处理中
            {video.processing_step ? `（${video.processing_step}）` : ""}
            ，完成后即可编辑。
          </div>
        )}

        {/* Player + editor side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 items-start">
          {/* Player */}
          <div className="lg:sticky lg:top-6">
            <div className="aspect-video bg-ink rounded-lg overflow-hidden">
              {video.video_url_720p ? (
                <video
                  ref={videoElRef}
                  src={video.video_url_720p}
                  controls
                  className="w-full h-full"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-on-primary/40">
                  <Play size={40} />
                </div>
              )}
            </div>
            <p className="text-xs text-muted mt-2">
              编辑字幕时可点 ● 按钮取当前播放时间填入时间轴。
            </p>
          </div>

          {/* Editor */}
          <div>
            {/* Tabs */}
            <div className="tab-container mb-4">
              <button
                className={`tab-pill ${activeTab === "subtitles" ? "tab-pill-active" : ""}`}
                onClick={() => setActiveTab("subtitles")}
              >
                字幕
              </button>
              <button
                className={`tab-pill ${activeTab === "practice" ? "tab-pill-active" : ""}`}
                onClick={() => setActiveTab("practice")}
              >
                练习题
              </button>
            </div>

            {isPublished && (
              <div className="bg-warning-soft text-warning rounded-lg p-3 mb-4 text-xs">
                视频已发布。要修改内容请先点击上方“编辑已发布视频”，修改后会触发重新审核，公开版保留当前版本。
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
        处理中{step ? ` · ${step}` : ""}
      </span>
    );
  }
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "草稿", cls: "bg-surface-card text-muted-foreground" },
    pending_review: { label: "待审核", cls: "bg-warning-soft text-warning" },
    published: { label: "已发布", cls: "bg-success-soft text-success" },
    rejected: { label: "已驳回", cls: "bg-red-soft text-red" },
  };
  const m = map[status] ?? map.draft;
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-pill ${m.cls}`}>
      {m.label}
    </span>
  );
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
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const loadPractice = useCallback(async () => {
    setLoading(true);
    try {
      const set = await api<{ questions: PracticeQuestion[] }>(
        `/api/v1/videos/${videoId}/practice?level=${level}`,
      );
      setQuestions(set.questions);
    } catch (err) {
      // 409 = not ready / no snapshot — show empty state, not a toast.
      setQuestions([]);
    } finally {
      setLoading(false);
    }
  }, [videoId, level]);

  useEffect(() => {
    loadPractice();
  }, [loadPractice]);

  const updateQuestion = (i: number, patch: Partial<PracticeQuestion>) => {
    setQuestions((prev) =>
      prev.map((q, idx) => (idx === i ? { ...q, ...patch } : q)),
    );
  };

  const addQuestion = (type?: PracticeQuestion["type"]) => {
    const t = type ?? "qa";
    const base = {
      type: t,
      question: "",
      answer: "",
      options: null,
      cet_words: [],
    } satisfies PracticeQuestion;
    if (t === "reading") {
      setQuestions((prev) => [...prev, { ...base, passage: "" }]);
    } else if (t === "sentence_building") {
      setQuestions((prev) => [...prev, { ...base, tokens: [], answer: "" }]);
    } else {
      setQuestions((prev) => [...prev, base]);
    }
  };

  const removeQuestion = (i: number) => {
    setQuestions((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const set = await editPractice(videoId, level, questions);
      setQuestions(set.questions);
      toast.success("练习题已保存");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const set = await regeneratePractice(videoId, level, 6);
      setQuestions(set.questions);
      toast.success("已重新生成练习题");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">考级</span>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="input-field w-32"
          >
            {TARGET_LEVEL_OPTIONS.map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleRegenerate}
          disabled={!editable || regenerating}
          className="btn-outline inline-flex items-center gap-1 text-xs"
        >
          {regenerating ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          AI 重新生成
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={20} className="animate-spin text-brand-500" />
        </div>
      ) : questions.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">
          该考级暂无练习题。点击“AI 重新生成”创建一组。
        </p>
      ) : (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={i} className="card-outline p-3 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={q.type}
                  onChange={(e) => {
                    const newType = e.target.value as PracticeQuestion["type"];
                    const patch: Partial<PracticeQuestion> = {
                      type: newType,
                    };
                    if (newType === "reading" && !q.passage) patch.passage = "";
                    if (newType === "sentence_building" && !q.tokens)
                      patch.tokens = [];
                    updateQuestion(i, patch);
                  }}
                  className="input-field w-32 text-xs"
                  disabled={!editable}
                >
                  <option value="qa">问答</option>
                  <option value="fill_blank">填空</option>
                  <option value="reading">阅读</option>
                  <option value="sentence_building">组句</option>
                </select>
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
              <input
                type="text"
                value={q.question}
                onChange={(e) =>
                  updateQuestion(i, { question: e.target.value })
                }
                placeholder="题干"
                className="input-field"
                disabled={!editable}
              />
              {q.type === "reading" && (
                <textarea
                  value={q.passage ?? ""}
                  onChange={(e) =>
                    updateQuestion(i, {
                      passage: e.target.value || null,
                    })
                  }
                  placeholder="阅读段落（学生需阅读此段落后回答问题）"
                  className="input-field min-h-[80px]"
                  rows={3}
                  disabled={!editable}
                />
              )}
              {q.type === "sentence_building" ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={q.answer}
                    onChange={(e) => {
                      const sentence = e.target.value;
                      const tokens = sentence
                        .split(/\s+/)
                        .filter((t) => t.length > 0);
                      updateQuestion(i, {
                        answer: sentence,
                        tokens: tokens.length > 0 ? tokens : null,
                      });
                    }}
                    placeholder="输入正确句子（空格分词，系统自动生成乱序词块）"
                    className="input-field"
                    disabled={!editable}
                  />
                  {q.tokens && q.tokens.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-muted-foreground">
                        词块预览：
                      </span>
                      {q.tokens.map((token, ti) => (
                        <span
                          key={ti}
                          className="px-1.5 py-0.5 rounded bg-surface-soft border border-hairline text-xs"
                        >
                          {token}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={q.answer}
                  onChange={(e) =>
                    updateQuestion(i, { answer: e.target.value })
                  }
                  placeholder="答案"
                  className="input-field"
                  disabled={!editable}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <div className="flex gap-2">
          <button
            onClick={() => addQuestion()}
            className="btn-outline inline-flex items-center gap-1 text-sm"
          >
            <Plus size={14} /> 添加题目
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary inline-flex items-center gap-1 text-sm"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            保存练习题
          </button>
        </div>
      )}
    </div>
  );
}
