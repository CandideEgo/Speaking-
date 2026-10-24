"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/errors";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { ClipPlayer } from "@/components/listening/ClipPlayer";
import { ErrorState } from "@/components/common/ErrorState";
import { Skeleton } from "@/components/common/SkeletonCard";
import type { ListeningSession } from "@/types/listening";

export default function ListeningAttempt() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<ListeningSession | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const values = useRef({ answers: {} as Record<string, string>, index: 0 });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataRef = useRef<ListeningSession | null>(null);
  const key = `seeword-listening-draft:${id}`;
  const saveDraft = useCallback(async () => {
    if (!dataRef.current || dataRef.current.submitted_at) return;
    const snapshot = { ...values.current };
    setSaveState("saving");
    const task = queue.current
      .catch(() => {})
      .then(() =>
        api(`/api/v1/listening/sessions/${id}`, {
          method: "PUT",
          body: JSON.stringify({ answers: snapshot.answers, current_index: snapshot.index }),
        })
      );
    queue.current = task;
    try {
      await task;
      if (JSON.stringify(values.current) === JSON.stringify(snapshot)) {
        setSaveState("saved");
        try {
          localStorage.removeItem(`seeword-listening-draft:${id}`);
        } catch {
          /* Server copy is already saved. */
        }
      }
    } catch (e) {
      setSaveState("error");
      throw e;
    }
  }, [id]);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setSession(null);
    dataRef.current = null;
    api<ListeningSession>(`/api/v1/listening/sessions/${id}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return;
        let local: { answers: Record<string, string>; index: number } | null = null;
        try {
          local = JSON.parse(localStorage.getItem(key) || "null");
        } catch {
          /* Browser storage may be unavailable; server drafts remain available. */
        }
        if (
          local &&
          (!local.answers ||
            typeof local.answers !== "object" ||
            Array.isArray(local.answers) ||
            !Number.isFinite(local.index) ||
            Object.entries(local.answers).some(
              ([qid, value]) =>
                !data.questions.some((q) => q.id === qid) ||
                typeof value !== "string" ||
                value.length > 2000
            ))
        )
          local = null;
        const state =
          !data.submitted_at && local
            ? local
            : { answers: data.answers, index: data.current_index };
        values.current = {
          answers: state.answers,
          index: Math.max(0, Math.min(data.total - 1, state.index)),
        };
        dataRef.current = data;
        setSession(data);
        setAnswers(state.answers);
        setIndex(values.current.index);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [id, key, retry]);
  useEffect(() => {
    if (!session || session.submitted_at) return;
    try {
      localStorage.setItem(key, JSON.stringify({ answers, index }));
    } catch {
      /* Browser storage may be unavailable; server drafts remain available. */
    }
    const timer = setTimeout(() => {
      void saveDraft().catch(() => {});
    }, 650);
    autosaveTimer.current = timer;
    return () => clearTimeout(timer);
  }, [answers, index, key, session, saveDraft]);
  useEffect(
    () => () => {
      if (dataRef.current && !dataRef.current.submitted_at) void saveDraft().catch(() => {});
    },
    [saveDraft]
  );
  function changeAnswer(value: string) {
    const next = { ...values.current.answers, [question!.id]: value };
    values.current = { ...values.current, answers: next };
    setAnswers(next);
    try {
      localStorage.setItem(key, JSON.stringify(values.current));
    } catch {
      /* Server autosave remains available. */
    }
    setSaveState("saving");
  }
  function go(next: number) {
    values.current = { ...values.current, index: next };
    setIndex(next);
    try {
      localStorage.setItem(key, JSON.stringify(values.current));
    } catch {
      /* Server autosave remains available. */
    }
  }
  async function submit() {
    if (busy) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    setBusy(true);
    try {
      await saveDraft();
      const result = await api<ListeningSession>(`/api/v1/listening/sessions/${id}/submit`, {
        method: "POST",
      });
      dataRef.current = result;
      setSession(result);
      try {
        localStorage.removeItem(key);
      } catch {
        /* Browser storage may be unavailable; server drafts remain available. */
      }
    } catch (e) {
      toastApiError(e, "提交失败，答案已保留，请重试");
    } finally {
      setBusy(false);
    }
  }
  async function restart() {
    if (!session?.video_id || busy) return;
    setBusy(true);
    try {
      const next = await api<ListeningSession>("/api/v1/listening/sessions", {
        method: "POST",
        body: JSON.stringify({ video_id: session.video_id, count: session.total, restart: true }),
      });
      router.replace(`/practice/listening/${next.id}`);
    } catch (e) {
      toastApiError(e, "新练习创建失败");
      setBusy(false);
    }
  }
  const question = session?.questions[index];
  const submitted = !!session?.submitted_at;
  const result = session?.results?.find((r) => r.id === question?.id);
  const source =
    session?.video?.video_url_720p ||
    session?.video?.video_url_480p ||
    session?.video?.video_url_1080p;
  const answered = session?.questions.filter((q) => answers[q.id]?.trim()).length ?? 0;
  return (
    <div className="user-page">
      <PageHeader
        crumb={<Link href="/practice/listening">← 听力素材</Link>}
        title={submitted ? "本次听力结果" : "逐句听写"}
        description={session?.title}
      />
      {error ? (
        <ErrorState title={error} onRetry={() => setRetry((n) => n + 1)} />
      ) : !session ? (
        <div aria-busy="true" className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-44 w-full" />
        </div>
      ) : !question ? (
        <ErrorState
          title="这次练习没有可用题目"
          onRetry={() => router.push("/practice/listening")}
        />
      ) : (
        <>
          {submitted && (
            <section
              aria-label="结果统计"
              className="mb-5 grid grid-cols-3 gap-3 rounded-lg border border-hairline bg-surface-soft p-5"
            >
              <div>
                <strong className="text-title text-ink">
                  {session.correct_count}/{session.total}
                </strong>
                <p className="mt-1 text-caption text-muted">整句答对</p>
              </div>
              <div>
                <strong className="text-title text-ink">
                  {Math.round(
                    (session.results ?? []).reduce((n, r) => n + r.accuracy, 0) / session.total
                  )}
                  %
                </strong>
                <p className="mt-1 text-caption text-muted">逐词准确率</p>
              </div>
              <div>
                <strong className="text-title text-ink">已记录</strong>
                <p className="mt-1 text-caption text-muted">可随时回看</p>
              </div>
            </section>
          )}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-meta text-muted">
              第 <strong className="text-ink">{index + 1}</strong> / {session.total} 句 ·{" "}
              {submitted ? "查看答案与解析" : `已答 ${answered} 句`}
            </p>
            <span role="status" className="text-caption text-muted">
              {submitted
                ? "结果已保存"
                : saveState === "saved"
                  ? "草稿已保存"
                  : saveState === "saving"
                    ? "正在保存…"
                    : "同步失败，本机草稿已保留"}
            </span>
          </div>
          <nav aria-label="题目导航" className="mb-5 flex flex-wrap gap-2">
            {session.questions.map((q, i) => (
              <Button
                key={q.id}
                variant={i === index ? "primary" : "outline"}
                size="sm"
                onClick={() => go(i)}
                aria-label={`第 ${i + 1} 句${answers[q.id]?.trim() ? "，已作答" : ""}`}
                aria-current={i === index ? "step" : undefined}
              >
                {i + 1}
                {answers[q.id]?.trim() && <Check size={12} aria-hidden />}
              </Button>
            ))}
          </nav>
          {source ? (
            <ClipPlayer key={question.id} src={source} start={question.start} end={question.end} />
          ) : (
            <div
              role="alert"
              className="rounded-md border border-hairline bg-surface-soft p-4 text-copy text-body"
            >
              原声暂不可播放，视频可能已下架。你的答案和结果仍会保留。
              <Link href="/practice/listening" className="ml-2 text-brand-700">
                换一段素材
              </Link>
            </div>
          )}
          <div className="mt-5">
            <label htmlFor="listening-answer" className="block text-copy font-semibold text-ink">
              {submitted ? "你的答案" : "写下听到的完整句子"}
            </label>
            <p className="mt-1 text-caption text-muted">
              忽略大小写与标点；没听清的部分可以先留空，再重播。
            </p>
            <textarea
              id="listening-answer"
              value={answers[question.id] || ""}
              onChange={(e) => changeAnswer(e.target.value)}
              maxLength={2000}
              disabled={submitted || busy}
              placeholder="Type what you hear…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="mt-3 min-h-32 w-full resize-y rounded-md border border-hairline bg-canvas p-4 text-copy-lg leading-relaxed text-ink focus-visible:outline-2 focus-visible:outline-brand-500 disabled:bg-surface-soft"
            />
          </div>
          {submitted && result && (
            <section
              aria-label="答案解析"
              className="mt-4 space-y-3 rounded-lg border border-hairline p-4 sm:p-5"
            >
              <p
                className={
                  result.correct
                    ? "text-meta font-semibold text-success-text"
                    : "text-meta font-semibold text-body"
                }
              >
                {result.correct
                  ? "✓ 这句答对了"
                  : `这句准确率 ${result.accuracy}% · 对照原句再听一次`}
              </p>
              <div>
                <p className="mb-1 text-caption font-semibold text-muted">正确原句</p>
                <p lang="en" className="text-copy-lg leading-relaxed text-ink">
                  {question.text_en}
                </p>
              </div>
              {question.text_zh && (
                <p className="text-copy leading-relaxed text-body">{question.text_zh}</p>
              )}
              <div className="flex flex-wrap gap-1.5" aria-label="逐词对照">
                {result.diff.map((part, i) => (
                  <span
                    key={i}
                    className={
                      part.kind === "equal"
                        ? "text-meta text-muted"
                        : "rounded-sm bg-brand-50 px-2 py-1 text-meta text-brand-700"
                    }
                  >
                    {part.kind === "equal"
                      ? part.expected
                      : part.kind === "insert"
                        ? `多写：${part.actual}`
                        : part.kind === "delete"
                          ? `漏听：${part.expected}`
                          : `听成 ${part.actual} → 原句 ${part.expected}`}
                  </span>
                ))}
              </div>
              {question.grammar_note && (
                <p className="border-t border-hairline pt-3 text-meta leading-relaxed text-body">
                  {question.grammar_note}
                </p>
              )}
            </section>
          )}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
            <Button
              variant="outline"
              icon={ChevronLeft}
              disabled={index === 0}
              onClick={() => go(index - 1)}
            >
              上一句
            </Button>
            {index < session.total - 1 ? (
              <Button icon={ChevronRight} onClick={() => go(index + 1)}>
                下一句
              </Button>
            ) : !submitted ? (
              <Button loading={busy} onClick={submit}>
                提交并查看结果
                {answered < session.total ? `（${session.total - answered} 句未答）` : ""}
              </Button>
            ) : (
              <Button onClick={restart} loading={busy} disabled={!source}>
                再练一组
              </Button>
            )}
          </div>
          {!submitted && saveState === "error" && (
            <Button
              className="mt-3"
              variant="text"
              size="sm"
              onClick={() => void saveDraft().catch((e) => toastApiError(e, "保存失败"))}
            >
              重试同步草稿
            </Button>
          )}
          <Link
            href="/practice/listening"
            onClick={() => void saveDraft().catch(() => {})}
            className="mt-5 inline-block min-h-10 text-meta text-brand-700"
          >
            {submitted ? "返回听力素材" : "保存并返回素材"} →
          </Link>
        </>
      )}
    </div>
  );
}
