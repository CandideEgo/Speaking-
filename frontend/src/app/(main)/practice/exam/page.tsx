"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, AlertCircle } from "lucide-react";
import { PaperRunner, flatten, type Answer, type Qid } from "@/components/practice/PaperRunner";
import { EXAM_LEVELS, levelDotClass } from "@/lib/examLevels";
import { cn } from "@/lib/utils";
import { useExamStore } from "@/stores/examStore";
import {
  drillToPaper,
  submitExam,
  LETTERS,
  type ExamQuestionDTO,
  type ExamReviewItem,
} from "@/lib/examData";
import type { Paper } from "@/data/practicePaper";
import { FullPageSpinner } from "@/components/common/Spinner";

/** 6 个练习层级（与 hub 一致）。 */
const PRACTICE_LEVELS = EXAM_LEVELS.filter((l) =>
  ["zhongkao", "gaoKao", "cet4", "cet6", "ielts", "toefl"].includes(l.key)
);

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Patch the answer-stripped exam paper with server review (for the recap). */
function patchPaperWithReview(
  paper: Paper,
  ordered: ExamQuestionDTO[],
  reviewById: Map<string, ExamReviewItem>
): Paper {
  let idx = 0;
  return paper.map((part) => ({
    ...part,
    items: part.items.map((q) => {
      const dto = ordered[idx++];
      const r = dto ? reviewById.get(dto.id) : undefined;
      if (!r || r.answer == null) return q;
      if (q.type === "choice" && q.choices) {
        const ai = q.choices.indexOf(r.answer);
        if (ai >= 0) return { ...q, answer: ai, ans: LETTERS[ai] ?? r.answer };
      }
      if (q.type === "fill") return { ...q, fill: r.answer, ans: r.answer };
      return q;
    }),
  }));
}

export default function PracticeExamPage() {
  const params = useSearchParams();
  const initialLevel = params.get("level") ?? "cet4";
  const videoId = params.get("videoId");
  const redo = params.get("redo") === "1";

  const [level, setLevel] = useState(
    PRACTICE_LEVELS.some((l) => l.key === initialLevel) ? initialLevel : "cet4"
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [stopped, setStopped] = useState(false);

  const { sessionId, questions, timeLimitSeconds, loading, error, start } = useExamStore();

  const [paper, setPaper] = useState<Paper>([]);
  // DTO order matching flatten(paper) — qid -> exam answer id by index.
  const orderedRef = useRef<ExamQuestionDTO[]>([]);

  const levelMeta = useMemo(
    () => PRACTICE_LEVELS.find((l) => l.key === level) ?? PRACTICE_LEVELS[0],
    [level]
  );

  // ----- Start / restart the exam session -----
  useEffect(() => {
    let cancelled = false;
    const mode = redo ? "wrong_redo" : videoId ? "video_exam" : "daily_check";
    start(mode, { level, videoId: videoId ?? undefined }).then((ok) => {
      if (cancelled) return;
      if (ok) setStopped(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, videoId, redo]);

  // ----- Build the answer-stripped paper from the session questions -----
  useEffect(() => {
    if (!questions.length) {
      setPaper([]);
      orderedRef.current = [];
      return;
    }
    const { paper: p, ordered } = drillToPaper(questions, false);
    setPaper(p);
    orderedRef.current = ordered;
  }, [questions]);

  // ----- Countdown -----
  const [timeLeft, setTimeLeft] = useState(timeLimitSeconds);
  const [autoSubmitSignal, setAutoSubmitSignal] = useState(0);

  useEffect(() => {
    setTimeLeft(timeLimitSeconds);
    setAutoSubmitSignal(0);
  }, [timeLimitSeconds, sessionId]);

  useEffect(() => {
    if (stopped || loading || !sessionId) return;
    const id = setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [stopped, loading, sessionId]);

  useEffect(() => {
    if (timeLeft === 0 && sessionId && !stopped) {
      setAutoSubmitSignal((n) => n + 1);
    }
  }, [timeLeft, sessionId, stopped]);

  // ----- Submit: collect answers, POST, return server results -----
  const handleSubmit = useCallback(
    async (answers: Record<Qid, Answer>) => {
      if (!sessionId) return;
      const flat = flatten(paper);
      const payload = flat.map((q, i) => {
        const dto = orderedRef.current[i];
        const a = answers[q.qid];
        let user_answer: string | null = null;
        if (q.type === "choice" && a?.picked != null && q.choices) {
          user_answer = q.choices[a.picked] ?? null;
        } else if (a?.text) {
          user_answer = a.text;
        } else if (a?.self != null) {
          user_answer = a.self;
        }
        return { id: dto?.id ?? "", user_answer };
      });

      const res = await submitExam(sessionId, payload).catch((e) => {
        toast.error(e instanceof Error ? e.message : "提交失败，请重试");
        throw e;
      });
      const reviewById = new Map(res.answers.map((r) => [r.id, r]));
      setPaper((prev) => patchPaperWithReview(prev, orderedRef.current, reviewById));

      const results: Record<Qid, boolean> = {};
      flat.forEach((q, i) => {
        const dto = orderedRef.current[i];
        const r = dto ? reviewById.get(dto.id) : undefined;
        results[q.qid] = r?.correct ?? false;
      });
      setStopped(true);
      return { results };
    },
    [sessionId, paper]
  );

  // ----- States -----
  if (error) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center px-5">
        <div className="text-center max-w-sm">
          <AlertCircle size={40} className="mx-auto text-muted mb-4" />
          <p className="text-ink font-semibold mb-1.5">暂时无法出卷</p>
          <p className="text-sm text-muted leading-relaxed">{error}</p>
          <Link
            href="/practice"
            className="inline-block mt-5 px-6 py-2.5 rounded-md bg-ink text-canvas text-sm font-semibold hover:bg-brand-500 transition-colors"
          >
            返回练习专题
          </Link>
        </div>
      </main>
    );
  }

  if (loading || !sessionId || !paper.length) {
    return <FullPageSpinner />;
  }

  const warn = timeLeft <= 60;

  return (
    <PaperRunner
      key={sessionId}
      paper={paper}
      mode="submit"
      levelLabel={levelMeta.label}
      onSubmit={handleSubmit}
      autoSubmitSignal={autoSubmitSignal}
      examHeaderExtra={
        <>
          {/* Level selector */}
          {!redo && !videoId && (
            <div className="relative flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpen((o) => !o);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-surface-card text-[13px] font-semibold text-ink"
              >
                <span className={cn("w-2 h-2 rounded-full", levelDotClass(levelMeta.color))} />
                {levelMeta.label}
                <ChevronDown
                  size={13}
                  className={cn("transition-transform", menuOpen && "rotate-180")}
                />
              </button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute left-0 mt-1.5 z-20 min-w-[140px] p-1.5 bg-canvas border border-hairline rounded-lg shadow-lift">
                    {PRACTICE_LEVELS.map((opt) => (
                      <button
                        key={opt.key}
                        onClick={() => {
                          setLevel(opt.key);
                          setMenuOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-[13px] font-medium text-left transition-colors",
                          opt.key === level
                            ? "bg-brand-50 text-brand-600 font-semibold"
                            : "text-body hover:bg-surface-soft"
                        )}
                      >
                        <span className={cn("w-2 h-2 rounded-full", levelDotClass(opt.color))} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <span className="text-sm font-semibold text-ink hidden sm:inline">
            {redo ? "错题重做" : videoId ? "视频试卷考试" : "水平检测"}
          </span>
          {/* Timer */}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill font-mono text-[13px] font-semibold",
              warn ? "bg-warning-soft text-warning" : "bg-surface-card text-ink"
            )}
          >
            {formatTime(timeLeft)}
          </span>
        </>
      }
    />
  );
}
