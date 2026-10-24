"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  SECTION_LABELS,
  buildGroups,
  formatNumberRanges,
  normalizePassageSpacing,
  stripWordBank,
} from "@/lib/examPresentation";
import { SCROLL_CONTAINER_ID } from "@/lib/scrollMemory";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/common/Modal";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
export interface ExamQuestionPublic {
  id: string;
  number: number;
  section: string;
  question_type: string;
  passage: string | null;
  question: string | null;
  options: Record<string, string> | null;
}

export interface ExamSubmitResultItem {
  question_id: string;
  number: number;
  section: string;
  question_type: string;
  question: string | null;
  options: Record<string, string> | null;
  passage: string | null;
  user_answer: string | null;
  correct: boolean | null;
  correct_answer: string | null;
  explanation: string | null;
}

export interface ExamSubmitResponse {
  session_id: string;
  mode: string;
  score: number;
  correct_count: number;
  total: number;
  part_scores: Record<string, { correct: number; total: number }>;
  results: ExamSubmitResultItem[];
}

export default function ExamRunner({
  questions,
  submitPath,
  onSubmitted,
  accent,
  suggestedMinutes = null,
  onQuit,
}: {
  questions: ExamQuestionPublic[];
  submitPath: string;
  onSubmitted: (result: ExamSubmitResponse) => void;
  accent: string;
  suggestedMinutes?: number | null;
  onQuit?: () => void;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [activeId, setActiveId] = useState(questions[0]?.id ?? "");
  const [panel, setPanel] = useState<"passage" | "questions">("passage");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [layout, setLayout] = useState({ dual: false, height: 560 });
  const workspace = useRef<HTMLDivElement>(null);
  const answerCardTrigger = useRef<HTMLButtonElement>(null);
  const passagePane = useRef<HTMLDivElement>(null);
  const questionPane = useRef<HTMLDivElement>(null);
  const positions = useRef(
    new Map<
      string,
      { passage: number; questions: number; outerPassage: number; outerQuestions: number }
    >()
  );
  const targetQuestion = useRef<string | null>(null);
  const groups = useMemo(() => buildGroups(questions), [questions]);
  const group = groups.find((g) => g.questions.some((q) => q.id === activeId)) ?? groups[0];
  const sections = [...new Set(groups.map((g) => g.section))];
  const answered = Object.keys(answers).length;
  const total = questions.length;
  const index = questions.findIndex((q) => q.id === activeId);

  function remember() {
    if (!group) return;
    // Resize can reset a hidden pane before ResizeObserver switches layouts (Firefox).
    if (layout.dual && (workspace.current?.clientWidth ?? 0) < 900) return;
    const old = positions.current.get(group.key);
    const outer = document.getElementById(SCROLL_CONTAINER_ID)?.scrollTop ?? 0;
    positions.current.set(group.key, {
      passage:
        layout.dual && passagePane.current?.getClientRects().length
          ? passagePane.current.scrollTop
          : (old?.passage ?? 0),
      questions:
        layout.dual && questionPane.current?.getClientRects().length
          ? questionPane.current.scrollTop
          : (old?.questions ?? 0),
      outerPassage: panel === "passage" && !layout.dual ? outer : (old?.outerPassage ?? 0),
      outerQuestions: panel === "questions" && !layout.dual ? outer : (old?.outerQuestions ?? 0),
    });
  }

  useEffect(() => {
    const element = workspace.current;
    const main = document.getElementById(SCROLL_CONTAINER_ID);
    if (!element || !main) return;
    const measure = () => {
      // Budget comes from the app's actual scroll surface, including its navigation.
      const top = Math.max(main.getBoundingClientRect().top, element.getBoundingClientRect().top);
      const height = Math.floor(main.getBoundingClientRect().bottom - top - 76);
      const dual = element.clientWidth >= 900 && height >= 560;
      setLayout((prev) => (prev.dual === dual && prev.height === height ? prev : { dual, height }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!group) return;
    const saved = positions.current.get(group.key);
    if (layout.dual) {
      if (passagePane.current) passagePane.current.scrollTop = saved?.passage ?? 0;
      if (questionPane.current) questionPane.current.scrollTop = saved?.questions ?? 0;
    } else {
      const main = document.getElementById(SCROLL_CONTAINER_ID);
      if (main)
        main.scrollTop =
          panel === "passage" ? (saved?.outerPassage ?? 0) : (saved?.outerQuestions ?? 0);
    }
    if (targetQuestion.current && (layout.dual || panel === "questions" || !group.passage)) {
      const id = targetQuestion.current;
      targetQuestion.current = null;
      document.getElementById(`exam-question-${id}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [group, panel, layout.dual, activeId]);

  // Store scroll offsets as they change so resizing never loses the last position.
  useEffect(() => {
    const main = document.getElementById(SCROLL_CONTAINER_ID);
    const save = () => remember();
    main?.addEventListener("scroll", save, { passive: true });
    return () => main?.removeEventListener("scroll", save);
  });

  function jumpTo(id: string) {
    remember();
    targetQuestion.current = id;
    setActiveId(id);
    setPanel("questions");
    setSheetOpen(false);
    if (id === activeId)
      requestAnimationFrame(() =>
        document.getElementById(`exam-question-${id}`)?.scrollIntoView({ block: "nearest" })
      );
  }
  function chooseGroup(id: string) {
    remember();
    setActiveId(id);
    setPanel("passage");
  }
  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api<ExamSubmitResponse>(submitPath, {
        method: "POST",
        body: JSON.stringify({
          answers: Object.entries(answers).map(([question_id, answer]) => ({
            question_id,
            answer,
          })),
        }),
      });
      onSubmitted(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败，请重试");
      setSubmitting(false);
      setConfirming(false);
    }
  }
  if (!group) return <p className="py-8 text-muted">本次没有可作答的题目。</p>;
  return (
    <div className="space-y-4" style={{ overflowAnchor: "none" }} aria-label="阅读作答工作区">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-canvas py-3 sm:justify-start">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (onQuit ? onQuit() : router.back())}
          disabled={submitting}
        >
          退出
        </Button>
        {/* 手机端标题落到第二行：和「退出 / 已答 / 交卷」挤一行会把卷名压成两行。 */}
        <span className="order-last w-full min-w-0 text-meta font-semibold text-ink sm:order-none sm:w-auto sm:flex-1">
          {accent}
        </span>
        <span className="text-meta text-muted" data-testid="exam-progress">
          已答 {answered}/{total}
        </span>
        <Button
          size="sm"
          onClick={() => setConfirming(true)}
          disabled={answered === 0 || submitting}
        >
          {submitting ? "提交中…" : "交卷"}
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-meta text-muted">
          题型
          <select
            aria-label="题型"
            className="ml-2 max-w-[15rem] rounded-sm border border-hairline bg-canvas p-2 text-ink"
            value={group.section}
            onChange={(e) => {
              const next = groups.find((g) => g.section === e.target.value);
              if (next) chooseGroup(next.questions[0].id);
            }}
          >
            {sections.map((section) => (
              <option key={section} value={section}>
                {SECTION_LABELS[section] ?? section}
              </option>
            ))}
          </select>
        </label>
        <label className="text-meta text-muted">
          题组
          <select
            aria-label="题组"
            className="ml-2 max-w-[15rem] rounded-sm border border-hairline bg-canvas p-2 text-ink"
            value={group.key}
            onChange={(e) => {
              const next = groups.find((g) => g.key === e.target.value);
              if (next) chooseGroup(next.questions[0].id);
            }}
          >
            {groups
              .filter((g) => g.section === group.section)
              .map((g, i) => (
                <option key={g.key} value={g.key}>
                  第 {i + 1} 组 · {formatNumberRanges(g.questions.map((q) => q.number))} 题
                </option>
              ))}
          </select>
        </label>
        <Button
          ref={answerCardTrigger}
          variant="outline"
          size="sm"
          onClick={() => setSheetOpen(true)}
        >
          答题卡
        </Button>
        {suggestedMinutes != null && (
          <span className="text-meta text-muted">建议约 {suggestedMinutes} 分钟</span>
        )}
      </div>
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-sm border border-error p-3 text-copy text-error-text"
        >
          {error}
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            重新交卷
          </Button>
        </div>
      )}
      {!layout.dual && group.passage && (
        <div role="group" aria-label="阅读视图" className="flex gap-2">
          <Button
            size="sm"
            variant={panel === "passage" ? "primary" : "outline"}
            aria-pressed={panel === "passage"}
            onClick={() => {
              remember();
              setPanel("passage");
            }}
          >
            原文
          </Button>
          <Button
            size="sm"
            variant={panel === "questions" ? "primary" : "outline"}
            aria-pressed={panel === "questions"}
            onClick={() => {
              remember();
              setPanel("questions");
            }}
          >
            题目
          </Button>
        </div>
      )}
      {/* [contain:paint]：左右两栏各自滚动时，Chromium 会把栏内的长内容算进
          文档滚动高度（整页截图能拉到 7000px、窗口也能滚进空白）。裁剪到本盒
          之内，文档高度才等于视口。 */}
      <div
        ref={workspace}
        data-testid="exam-workspace"
        data-layout={layout.dual ? "dual" : "switch"}
        className={
          layout.dual
            ? "grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6 [contain:paint]"
            : "min-w-0 [contain:paint]"
        }
      >
        {group.passage && (
          <div
            ref={passagePane}
            role="region"
            aria-label="原文"
            tabIndex={0}
            hidden={!layout.dual && panel !== "passage"}
            onScroll={remember}
            style={layout.dual ? { height: layout.height, overflowY: "auto" } : undefined}
            className="min-w-0 rounded-sm border border-hairline bg-surface-soft p-4"
          >
            <p className="whitespace-pre-wrap text-copy leading-loose text-body">
              {normalizePassageSpacing(stripWordBank(group.passage))}
            </p>
            {group.derived?.kind === "bank" && (
              <section aria-label="词库" className="mt-5 border-t border-hairline pt-3">
                <h3 className="text-copy font-semibold text-ink">词库</h3>
                <ul className="mt-2 grid grid-cols-2 gap-2 text-copy text-body">
                  {Object.entries(group.derived.options).map(([key, word]) => (
                    <li key={key}>
                      {key}) {word}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
        <div
          ref={questionPane}
          role="region"
          aria-label="当前题组"
          tabIndex={0}
          hidden={!layout.dual && panel !== "questions" && !!group.passage}
          onScroll={remember}
          style={
            layout.dual
              ? {
                  height: layout.height,
                  overflowY: "auto",
                  gridColumn: group.passage ? undefined : "1 / -1",
                }
              : undefined
          }
          className="min-w-0 space-y-5"
        >
          {group.questions.map((q) => (
            <section
              key={q.id}
              id={`exam-question-${q.id}`}
              data-testid="exam-question"
              aria-label={`第 ${q.number} 题`}
              className="scroll-mt-24 rounded-sm border border-hairline p-4"
            >
              <h3 className="text-copy font-semibold leading-relaxed text-ink">
                {q.number}. {q.question ?? "请选择答案"}
              </h3>
              <div className="mt-3 space-y-2" role="group" aria-label={`第 ${q.number} 题选项`}>
                {Object.entries(q.options ?? group.derived?.options ?? {}).map(([key, text]) => (
                  <button
                    type="button"
                    key={key}
                    data-testid="exam-option"
                    aria-pressed={answers[q.id] === key}
                    disabled={submitting}
                    onClick={() => {
                      setAnswers((prev) => ({ ...prev, [q.id]: key }));
                      setActiveId(q.id);
                    }}
                    className={`flex w-full items-start gap-3 rounded-sm border p-3 text-left text-copy leading-relaxed text-ink ${answers[q.id] === key ? "border-brand-500 bg-brand-50" : "border-hairline bg-canvas hover:border-hairline-strong"}`}
                  >
                    <span className="font-semibold">{key}</span>
                    <span>{text}</span>
                    <span className="sr-only">{answers[q.id] === key ? "已选择" : "未选择"}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
      <div
        className="sticky bottom-0 z-20 flex items-center justify-between gap-2 border-t border-hairline bg-canvas py-3"
        aria-label="题目导航"
      >
        <Button
          size="sm"
          variant="outline"
          disabled={index <= 0 || submitting}
          onClick={() => jumpTo(questions[index - 1].id)}
        >
          上一题
        </Button>
        {!layout.dual && group.passage ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              remember();
              setPanel(panel === "passage" ? "questions" : "passage");
            }}
          >
            {panel === "passage" ? "查看题目" : "查看原文"}
          </Button>
        ) : (
          <span className="text-meta text-muted">第 {questions[index]?.number} 题</span>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={index < 0 || index >= total - 1 || submitting}
          onClick={() => jumpTo(questions[index + 1].id)}
        >
          下一题
        </Button>
      </div>
      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="答题卡"
        returnFocusRef={answerCardTrigger}
      >
        <div
          className="grid max-h-[60dvh] grid-cols-5 gap-2 overflow-y-auto"
          role="group"
          aria-label="题号"
        >
          {questions.map((q) => (
            <button
              key={q.id}
              type="button"
              aria-current={activeId === q.id ? "step" : undefined}
              aria-label={`第 ${q.number} 题，${activeId === q.id ? "当前，" : ""}${answers[q.id] ? "已答" : "未答"}`}
              onClick={() => jumpTo(q.id)}
              className={`rounded-sm border p-2 text-meta ${activeId === q.id ? "border-brand-500 text-brand-700" : "border-hairline text-ink"}`}
            >
              <span className="block font-semibold">{q.number}</span>
              <span className="text-caption">{answers[q.id] ? "已答" : "未答"}</span>
            </button>
          ))}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirming}
        onClose={() => {
          if (!submitting) setConfirming(false);
        }}
        title="确认交卷？"
        message={`已答 ${answered}/${total} 题，未答 ${total - answered} 题。未答题计为错误，交卷后不可修改。`}
        confirmLabel="确认交卷"
        cancelLabel="再检查一下"
        busy={submitting}
        onConfirm={() => void submit()}
      />
    </div>
  );
}
