"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, Loader2, RotateCcw, X } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/**
 * 真题客观题答题器 —— 试卷 / 每日小测 / 错题重做共用。
 *
 * stage-3 保真版（F 组修复）：
 * - 顶部吸顶栏：退出 / 试卷标识 / 已答计数 / 建议用时（不是倒计时）/ 交卷；
 * - 桌面右栏答题卡（题号 + 已答态 + 点击跳题）与建议用时、分区说明；
 * - 套卷模式有「阅读 / 写作 / 听力 / 翻译」分区切换，未接入分区给说明；
 * - 同一篇文章只在题组开头渲染一次，不再逐题重复（长卷信息密度）；
 * - 移动端保留试卷标识与答题卡入口。
 *
 * props:
 *  - questions: 不含答案的题目列表（GET /exams/{id} 或 /exams/daily/start 返回）
 *  - submitPath: 提交端点路径（如 /exams/attempts/{sid}/submit）
 *  - onSubmitted: 交卷成功后回调（成绩页跳转 / 内联展示）
 *  - accent: 顶部徽标文案（试卷来源）
 *  - suggestedMinutes: 建议用时（分钟）；null = 不计时（每日一组 / 错题重做）
 *  - showZones: 是否显示分区切换（仅套卷作答）
 *  - onQuit: 退出按钮回调（默认 router.back()）
 */
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

const SECTION_LABELS: Record<string, string> = {
  use_of_english: "Use of English · 完形填空",
  reading_A: "Section A · 选词填空",
  reading_B: "Section B · 段落匹配",
  reading_C: "Section C · 仔细阅读",
  new_type: "Part B · 新题型",
};

const WORD_BANK_MARKER = "[word bank]";

interface DerivedOptions {
  /** bank = 选词填空词库；matching = 段落匹配段落字母。 */
  kind: "bank" | "matching";
  options: Record<string, string>;
}

/**
 * 选词填空 / 段落匹配题的 options 不落库（词库在 passage 末尾的
 * [word bank] 附录里，恒为 A-O；段落匹配的可选答案就是文章里的段落字母，可到 R），
 * 前端从 passage 现场推导，否则这两节完全没有可点元素。
 */
function deriveOptions(q: ExamQuestionPublic): DerivedOptions | null {
  if (q.options || !q.passage) return null;
  const idx = q.passage.toLowerCase().indexOf(WORD_BANK_MARKER);
  if (idx !== -1) {
    const raw = q.passage.slice(idx + WORD_BANK_MARKER.length);
    const marks = [...raw.matchAll(/([A-O])\)/g)];
    const options: Record<string, string> = {};
    for (let i = 0; i < marks.length; i++) {
      const start = (marks[i].index ?? 0) + marks[i][0].length;
      const end = i + 1 < marks.length ? marks[i + 1].index : raw.length;
      const word = raw
        .slice(start, end)
        .split(/\s+\d+\)/)[0]
        .trim();
      if (word) options[marks[i][1]] = word;
    }
    return Object.keys(options).length ? { kind: "bank", options } : null;
  }
  if (q.question_type === "matching") {
    const letters = [...new Set([...q.passage.matchAll(/^([A-Z])\)/gm)].map((m) => m[1]))];
    if (letters.length < 2) return null;
    return {
      kind: "matching",
      options: Object.fromEntries(letters.map((l) => [l, `段落 ${l}`])),
    };
  }
  return null;
}

/** 选词填空渲染正文时去掉末尾的词库附录（词库以选项形式单独展示）。 */
function stripWordBank(passage: string): string {
  const idx = passage.toLowerCase().indexOf(WORD_BANK_MARKER);
  return idx === -1 ? passage : passage.slice(0, idx).trim();
}

const ZONES = [
  { key: "reading", label: "阅读", ready: true },
  { key: "writing", label: "写作", ready: false },
  { key: "listening", label: "听力", ready: false },
  { key: "translation", label: "翻译", ready: false },
] as const;

type ZoneKey = (typeof ZONES)[number]["key"];

interface QuestionGroup {
  key: string;
  section: string;
  passage: string | null;
  questions: ExamQuestionPublic[];
  derived: DerivedOptions | null;
}

/** 同一 section + 同一篇文章的题归为一组，文章只渲染一次。 */
function buildGroups(questions: ExamQuestionPublic[]): QuestionGroup[] {
  const groups: QuestionGroup[] = [];
  const byKey = new Map<string, QuestionGroup>();
  for (const q of questions) {
    const key = `${q.section}\u0000${q.passage ?? ""}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        section: q.section,
        passage: q.passage,
        questions: [],
        derived: q.passage ? deriveOptions(q) : null,
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.questions.push(q);
  }
  return groups;
}

export default function ExamRunner({
  questions,
  submitPath,
  onSubmitted,
  accent,
  suggestedMinutes = null,
  showZones = false,
  onQuit,
}: {
  questions: ExamQuestionPublic[];
  submitPath: string;
  onSubmitted: (result: ExamSubmitResponse) => void;
  accent: string;
  /** 建议用时（分钟）；null = 不计时。 */
  suggestedMinutes?: number | null;
  /** 是否显示分区切换（只有套卷作答需要）。 */
  showZones?: boolean;
  /** 退出回调；缺省 router.back()。 */
  onQuit?: () => void;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [zone, setZone] = useState<ZoneKey>("reading");
  const [activeId, setActiveId] = useState<string | null>(null);

  const answered = Object.keys(answers).length;
  const total = questions.length;
  const groups = useMemo(() => buildGroups(questions), [questions]);
  const sectionGroups = useMemo(() => {
    const map = new Map<string, QuestionGroup[]>();
    for (const g of groups) {
      const list = map.get(g.section) ?? [];
      list.push(g);
      map.set(g.section, list);
    }
    return [...map.entries()];
  }, [groups]);

  const sectionMinutes = (count: number) =>
    suggestedMinutes == null || !total
      ? null
      : Math.max(1, Math.round((suggestedMinutes * count) / total));

  const jumpTo = (id: string) => {
    setSheetOpen(false);
    setActiveId(id);
    document
      .getElementById(`exam-question-${id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        answers: Object.entries(answers).map(([question_id, answer]) => ({ question_id, answer })),
      };
      const result = await api<ExamSubmitResponse>(submitPath, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onSubmitted(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "提交失败，请重试");
      setSubmitting(false);
      setConfirming(false);
    }
  };

  const quit = () => {
    if (onQuit) onQuit();
    else router.back();
  };

  return (
    <div className="flex min-h-full flex-col">
      {/* 吸顶栏：退出 / 试卷标识 / 已答 / 建议用时 / 交卷 */}
      <div className="sticky top-0 z-30 border-b border-hairline bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-2 px-4 py-3 sm:gap-3">
          <Button
            variant="ghost"
            size="sm"
            icon={X}
            onClick={quit}
            disabled={submitting}
            aria-label="退出"
            title="退出"
            className="h-[34px] w-[34px] flex-shrink-0 px-0"
          />
          <span className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-meta font-semibold text-ink sm:flex-none sm:rounded-pill sm:bg-surface-card sm:px-3 sm:py-1">
            <span className="h-2 w-2 flex-shrink-0 rounded-full bg-brand-500" />
            <span className="truncate">{accent}</span>
          </span>
          <div className="hidden h-1.5 flex-1 overflow-hidden rounded-full bg-surface-card md:flex">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-300"
              style={{ width: total ? `${Math.round((answered / total) * 100)}%` : "0%" }}
            />
          </div>
          <span className="font-mono text-meta text-muted">
            {answered}/{total}
          </span>
          <span className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-pill bg-surface-card px-2.5 py-1 text-meta font-semibold text-ink">
            <Clock size={13} />
            {suggestedMinutes == null ? "不计时" : `${suggestedMinutes} 分钟`}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={answered === 0 || submitting}
            className="hidden flex-shrink-0 md:inline-flex"
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            交卷
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSheetOpen(true)}
            className="flex-shrink-0 lg:hidden"
            aria-label={`答题卡，已答 ${answered}/${total}`}
          >
            答题卡
          </Button>
        </div>
        <div className="px-4 pb-2 md:hidden">
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-card">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-300"
              style={{ width: total ? `${Math.round((answered / total) * 100)}%` : "0%" }}
            />
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[1200px] flex-1 items-start gap-8 px-4 py-6">
        <div className="min-w-0 flex-1 space-y-6">
          {showZones && (
            <div className="custom-scrollbar w-full overflow-x-auto border-b border-hairline pb-3">
              <div
                className="flex flex-nowrap items-center gap-1"
                role="tablist"
                aria-label="套卷分区"
              >
                {ZONES.map((z) => (
                  <button
                    key={z.key}
                    type="button"
                    role="tab"
                    aria-selected={zone === z.key}
                    onClick={() => setZone(z.key)}
                    className={`inline-flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-pill px-3 text-meta font-medium transition-colors ${
                      zone === z.key
                        ? "bg-ink text-canvas"
                        : "text-muted hover:bg-surface-soft hover:text-ink"
                    }`}
                  >
                    {z.label}
                    {!z.ready && <span className="text-caption">未接入</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showZones && zone !== "reading" ? (
            <Card padding={5} className="space-y-3">
              <h2 className="text-copy-lg font-bold text-ink">
                {ZONES.find((z) => z.key === zone)?.label} · 本轮未接入
              </h2>
              <p className="text-copy leading-relaxed text-body">
                套卷作答这一版只做阅读部分：选词填空、长篇阅读、仔细阅读。写作、听力、翻译需要主观题评分或音频播放器，暂未接入；
                已经选好的答案不会丢，切回阅读就能继续。
              </p>
              <Button variant="outline" size="sm" onClick={() => setZone("reading")}>
                回到阅读
              </Button>
            </Card>
          ) : (
            <>
              {showZones && (
                <p className="user-notice">
                  <span>
                    本页只做阅读客观题（选词填空 / 长篇匹配 /
                    仔细阅读）。写作、听力、翻译本轮未接入。答题卡可跳题；
                    <strong className="text-ink">不倒计时，只给建议用时</strong>
                    ，时间到了也不会自动交卷。
                  </span>
                </p>
              )}

              {error && (
                <div className="rounded-md border border-error bg-red-soft px-4 py-3 text-copy text-error-text">
                  {error}
                </div>
              )}

              {sectionGroups.map(([section, sectionGroupList]) => (
                <section key={section} className="space-y-4">
                  <h2 className="text-copy font-bold text-ink">
                    {SECTION_LABELS[section] ?? section}
                  </h2>
                  {sectionGroupList.map((group) => (
                    <div key={group.key} className="space-y-4">
                      {group.passage && (
                        <div
                          className={
                            group.derived?.kind === "matching"
                              ? "custom-scrollbar rounded-md border border-hairline-soft bg-surface-soft px-4 py-3 md:max-h-72 md:overflow-y-auto"
                              : "rounded-md border border-hairline bg-canvas px-4 py-3"
                          }
                        >
                          <p className="whitespace-pre-wrap text-copy leading-relaxed text-body">
                            {group.derived?.kind === "bank"
                              ? stripWordBank(group.passage)
                              : group.passage}
                          </p>
                        </div>
                      )}
                      {group.questions.map((q) => {
                        const options = q.options ?? group.derived?.options ?? null;
                        return (
                          <Card
                            key={q.id}
                            id={`exam-question-${q.id}`}
                            padding={5}
                            className={
                              activeId === q.id
                                ? "scroll-mt-24 border-hairline-strong"
                                : "scroll-mt-24"
                            }
                          >
                            {q.question ? (
                              <p className="mb-3 text-copy font-semibold leading-relaxed text-ink">
                                {q.number}. {q.question}
                              </p>
                            ) : (
                              <p className="mb-3 text-copy font-semibold text-ink">
                                第 {q.number} 题
                              </p>
                            )}
                            {options ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {Object.entries(options).map(([key, text]) => {
                                  const active = answers[q.id] === key;
                                  return (
                                    <button
                                      key={key}
                                      type="button"
                                      data-testid="exam-option"
                                      onClick={() => {
                                        setAnswers((prev) => ({ ...prev, [q.id]: key }));
                                        setActiveId(q.id);
                                      }}
                                      className={`flex items-start gap-3 rounded-sm border px-4 py-2.5 text-left transition-colors ${
                                        active
                                          ? "border-brand-500 bg-brand-50 text-ink"
                                          : "border-hairline bg-canvas text-ink hover:border-hairline-strong"
                                      }`}
                                    >
                                      <span
                                        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-caption font-bold ${
                                          active
                                            ? "border-brand-500 text-brand-600"
                                            : "border-hairline-strong text-muted"
                                        }`}
                                      >
                                        {active ? <CheckCircle2 size={14} /> : key}
                                      </span>
                                      <span className="text-copy leading-relaxed">{text}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-meta text-muted">（本题暂无可选项）</p>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  ))}
                </section>
              ))}
            </>
          )}
        </div>

        {/* 桌面右栏：答题卡 / 建议用时 / 分区 */}
        <aside
          className="sticky top-24 hidden w-72 flex-none flex-col gap-6 lg:flex"
          aria-label="答题卡与进度"
        >
          <section className="border-t border-hairline-strong pt-4">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="text-copy font-bold text-ink">答题卡</h2>
              <span className="text-caption text-muted">
                已答 {answered} / {total}
              </span>
            </div>
            <div className="grid grid-cols-6 gap-2" role="group" aria-label="题号">
              {questions.map((q) => {
                const done = answers[q.id] != null;
                const current = activeId === q.id;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => jumpTo(q.id)}
                    aria-label={`第 ${q.number} 题${done ? "，已作答" : "，未作答"}`}
                    className={`grid h-9 place-items-center rounded-sm border text-meta font-semibold transition-colors ${
                      current
                        ? "border-brand-500 text-ink shadow-[inset_0_0_0_1px_var(--color-brand-500)]"
                        : done
                          ? "border-hairline-strong bg-surface-soft text-ink"
                          : "border-hairline text-muted hover:border-ink hover:text-ink"
                    }`}
                  >
                    {q.number}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-caption leading-relaxed text-muted">
              深色题号表示已作答；点题号可直接跳过去。
            </p>
          </section>

          <section className="border-t border-hairline-strong pt-4">
            <h2 className="mb-2 text-copy font-bold text-ink">建议用时</h2>
            <ul className="flex flex-col gap-1.5 text-meta text-body">
              <li className="flex items-baseline justify-between gap-3">
                <span>本次作答</span>
                <span className="font-mono text-body">
                  {suggestedMinutes == null ? "不计时" : `${suggestedMinutes} 分钟`}
                </span>
              </li>
              {sectionGroups.map(([section, list]) => {
                const count = list.reduce((sum, g) => sum + g.questions.length, 0);
                return (
                  <li key={section} className="flex items-baseline justify-between gap-3">
                    <span>{SECTION_LABELS[section]?.split(" · ")[1] ?? section}</span>
                    <span className="font-mono text-body">{sectionMinutes(count) ?? 0} 分钟</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-caption leading-relaxed text-muted">
              不倒计时：这里只写建议用时，时间到了也不会自动交卷，也不会打断你。
            </p>
          </section>

          {showZones && (
            <section className="border-t border-hairline-strong pt-4">
              <h2 className="mb-2 text-copy font-bold text-ink">分区</h2>
              <ul className="flex flex-col gap-1.5 text-meta text-body">
                <li className="flex items-baseline justify-between gap-3">
                  <span>阅读（Section A–C）</span>
                  <span className="font-mono text-body">{total} 题 · 可作答</span>
                </li>
                <li className="flex items-baseline justify-between gap-3">
                  <span>写作 / 听力 / 翻译</span>
                  <span className="text-muted">未接入</span>
                </li>
              </ul>
            </section>
          )}

          <div className="mt-auto flex flex-col gap-2 border-t border-hairline-strong pt-4">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                fullWidth
                disabled={!activeId}
                onClick={() => {
                  const idx = questions.findIndex((q) => q.id === activeId);
                  if (idx > 0) jumpTo(questions[idx - 1].id);
                }}
              >
                上一题
              </Button>
              <Button
                variant="outline"
                size="sm"
                fullWidth
                disabled={!activeId}
                onClick={() => {
                  const idx = questions.findIndex((q) => q.id === activeId);
                  if (idx >= 0 && idx < questions.length - 1) jumpTo(questions[idx + 1].id);
                }}
              >
                下一题
              </Button>
            </div>
            <Button variant="outline" size="sm" fullWidth onClick={quit} disabled={submitting}>
              退出并放弃本次作答
            </Button>
          </div>
        </aside>
      </div>

      {/* 移动端底部提交栏 */}
      <div className="sticky bottom-0 z-40 border-t border-hairline bg-canvas/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3">
          <span className="flex-1 text-meta text-muted">
            已答 <strong className="text-ink">{answered}</strong>/{total}
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={answered === 0 || submitting}
            className="flex-shrink-0"
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            交卷
          </Button>
        </div>
      </div>

      {/* 答题卡抽屉（窄屏） */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="答题卡"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-canvas p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-copy-lg font-bold text-ink">答题卡</h2>
                <p className="mt-1 text-meta text-muted">{accent}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={X}
                aria-label="关闭答题卡"
                onClick={() => setSheetOpen(false)}
                className="h-8 w-8 px-0"
              />
            </div>
            <div className="grid grid-cols-6 gap-2" role="group" aria-label="题号">
              {questions.map((q) => {
                const done = answers[q.id] != null;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => jumpTo(q.id)}
                    aria-label={`第 ${q.number} 题${done ? "，已作答" : "，未作答"}`}
                    className={`grid h-10 place-items-center rounded-sm border text-meta font-semibold ${
                      done
                        ? "border-hairline-strong bg-surface-soft text-ink"
                        : "border-hairline text-muted"
                    }`}
                  >
                    {q.number}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-caption leading-relaxed text-muted">
              深色题号表示已作答；点题号可直接跳过去。
            </p>
            <Button fullWidth className="mt-4" onClick={() => setSheetOpen(false)}>
              回到题目
            </Button>
          </div>
        </div>
      )}

      {/* 交卷二次确认 */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exam-confirm-title"
          onClick={() => !submitting && setConfirming(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-canvas p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 id="exam-confirm-title" className="text-copy-lg font-bold text-ink">
                确认交卷？
              </h3>
              <Button
                variant="ghost"
                size="sm"
                icon={X}
                aria-label="关闭"
                onClick={() => setConfirming(false)}
                disabled={submitting}
                className="h-8 w-8 px-0"
              />
            </div>
            <p className="mb-2 text-copy leading-relaxed text-muted">
              已作答 {answered}/{total} 题{answered < total ? "，未作答的题目将计为错误" : ""}
              。交卷后不可修改。
            </p>
            <p className="mb-5 text-caption leading-relaxed text-muted">
              交卷后只显示本次答对多少题与分项对错，不预测考试分数、不换算等级。
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                fullWidth
                onClick={() => setConfirming(false)}
                disabled={submitting}
              >
                再检查一下
              </Button>
              <Button variant="primary" fullWidth onClick={submit} disabled={submitting}>
                {submitting ? "提交中…" : "确认交卷"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {submitting && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-canvas/60">
          <span className="inline-flex items-center gap-2 text-copy text-muted">
            <Loader2 size={16} className="animate-spin" />
            正在交卷…
          </span>
        </div>
      )}

      {/* 提交失败：保留底部重试入口（错误横幅只出现在第一次失败时） */}
      {error && !confirming && !submitting && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-md border border-hairline bg-canvas px-3 py-2 text-meta text-ink shadow-soft">
          <RotateCcw size={13} />
          提交失败，请重试
          <Button
            variant="text"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={submitting}
          >
            重新交卷
          </Button>
        </div>
      )}
    </div>
  );
}
