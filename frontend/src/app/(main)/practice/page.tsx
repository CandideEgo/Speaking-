"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Layers, BookOpen, FileText, ArrowRight, Sparkles, RotateCcw, Flame } from "lucide-react";
import { api } from "@/lib/api";
import { usePlan } from "@/hooks/usePlan";

/**
 * 练习专题 —— 真题试卷 / 每日水平检测 / 错题本已上线（阅读客观题，服务端自动判分）。
 * 视频试卷仍为占位（视频试卷已砍，聚焦真题实战）。
 */

const LIVE_SECTIONS = [
  {
    key: "real",
    title: "真题试卷",
    icon: FileText,
    desc: "四六级历年真题阅读部分（选词填空 / 段落匹配 / 仔细阅读），交卷自动判分 + 错题解析。",
    href: "/practice/exams",
    cta: "去刷真题",
  },
];

const PLACEHOLDER_SECTIONS = [
  {
    key: "video",
    title: "视频试卷",
    icon: Layers,
    desc: "聚焦真题实战，视频试卷暂停开发。",
    status: "暂停开发",
  },
];

const SECTION_SHORT: Record<string, string> = {
  reading_A: "选词填空",
  reading_B: "段落匹配",
  reading_C: "仔细阅读",
};

interface ExamStats {
  month_completed: number;
  avg_score: number | null;
  last_daily_score: number | null;
  week_daily_count: number;
}

interface WrongItem {
  question_id: string;
  number: number | null;
  section: string | null;
  question: string | null;
  wrong_count: number;
  paper_title: string | null;
  year: number | null;
  month: number | null;
  level: string | null;
}

export default function PracticePage() {
  const { profile } = usePlan();
  const [stats, setStats] = useState<ExamStats | null>(null);
  const [wrongs, setWrongs] = useState<WrongItem[]>([]);
  const [wrongTotal, setWrongTotal] = useState(0);

  useEffect(() => {
    api<ExamStats>("/api/v1/exams/stats")
      .then(setStats)
      .catch(() => {});
    api<{ items: WrongItem[]; total: number }>("/api/v1/exams/wrong?page=1&page_size=5")
      .then((data) => {
        setWrongs(data.items);
        setWrongTotal(data.total);
      })
      .catch(() => {});
  }, []);

  const streak = profile?.current_streak ?? 0;

  return (
    <main className="min-h-full bg-surface-soft">
      <div className="container-page py-8 pb-24">
        {/* 页头 + 学习统计条（原型 08 page-head stats-row） */}
        <div className="mb-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-brand-50 text-brand-600 text-[13px] font-semibold">
            <span className="w-2 h-2 rounded-full bg-brand-500" />
            练习专题
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight mt-3 mb-2">真题实战 + 单词训练</h1>
          <p className="text-sm text-muted leading-relaxed max-w-[60ch]">
            四六级历年真题已上线，交卷自动判分；错题本沉淀薄弱点，词汇本单词训练正常开放。
          </p>
          <div className="flex gap-6 mt-4 flex-wrap">
            <span className="inline-flex items-center gap-2 text-[13px] text-muted">
              <span className="w-2 h-2 rounded-full bg-brand-500" />
              本月完成{" "}
              <strong className="text-base font-bold text-ink font-mono">
                {stats?.month_completed ?? 0}
              </strong>{" "}
              份
            </span>
            <span className="inline-flex items-center gap-2 text-[13px] text-muted">
              <span className="w-2 h-2 rounded-full bg-success" />
              平均正确率{" "}
              <strong className="text-base font-bold text-ink font-mono">
                {stats?.avg_score != null ? `${Math.round(stats.avg_score * 100)}%` : "--"}
              </strong>
            </span>
            <span className="inline-flex items-center gap-2 text-[13px] text-muted">
              <span className="w-2 h-2 rounded-full bg-indigo" />
              连续学习 <strong className="text-base font-bold text-ink font-mono">
                {streak}
              </strong>{" "}
              天
            </span>
          </div>
        </div>

        {/* 每日水平检测特色卡（原型 08 check-card 深色卡） */}
        <Link
          href="/practice/daily"
          className="group grid grid-cols-1 sm:grid-cols-[1.4fr_1fr] rounded-xl overflow-hidden mb-6 bg-ink text-canvas hover:shadow-lift transition-all"
        >
          <div className="p-6 sm:p-7">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-pill bg-brand-500/20 text-brand-400 uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              每日水平检测
            </span>
            <h2 className="text-[22px] font-extrabold tracking-tight mt-3 mb-1.5 text-canvas">
              今天，直接来一套卷子
            </h2>
            <p className="text-[13px] text-on-dark/70 leading-relaxed max-w-[42ch]">
              不看视频，直接做题。系统从真题题库随机抽 10 题，提交后给出对错、解析与得分——每天打开
              App 的第一件事，检验学习成果。
            </p>
            <span className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-md bg-brand-500 text-on-primary text-sm font-semibold shadow-brand group-hover:bg-brand-600 transition-colors">
              开始今日检测
              <ArrowRight size={14} />
            </span>
          </div>
          <div className="flex flex-col justify-center gap-3.5 px-6 py-5 border-t sm:border-t-0 sm:border-l border-white/10 bg-white/[0.03]">
            <div className="flex items-center justify-between text-[13px] text-on-dark/60">
              <span>上次成绩</span>
              <strong className="text-base font-bold text-canvas font-mono">
                {stats?.last_daily_score != null
                  ? `${Math.round(stats.last_daily_score * 100)} / 100`
                  : "--"}
              </strong>
            </div>
            <div className="flex items-center justify-between text-[13px] text-on-dark/60">
              <span>本周检测</span>
              <strong className="text-base font-bold text-canvas font-mono">
                {stats?.week_daily_count ?? 0} 次
              </strong>
            </div>
            <div className="flex items-center justify-between text-[13px] text-on-dark/60">
              <span>连续打卡</span>
              <span className="inline-flex items-center gap-1.5">
                <Flame size={16} className="text-brand-400" />
                <strong className="text-base font-bold text-canvas font-mono">{streak} 天</strong>
              </span>
            </div>
          </div>
        </Link>

        {/* 错题本（原型 08 wrong-block） */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3.5 flex-wrap gap-3">
            <h2 className="text-base font-bold text-ink">
              错题本{" "}
              <span className="text-[13px] font-medium text-muted font-mono">
                {wrongTotal} 题待重做
              </span>
            </h2>
            {wrongTotal > 0 && (
              <Link
                href="/practice/exams/redo"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-ink text-canvas text-[13px] font-semibold hover:bg-brand-500 transition-colors"
              >
                <RotateCcw size={14} />
                重做全部错题
              </Link>
            )}
          </div>
          {wrongTotal === 0 ? (
            <div className="bg-canvas border border-dashed border-hairline-strong rounded-xl p-6 text-center text-[13px] text-muted">
              暂无错题——去刷一套真题，错题会自动沉淀到这里。
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {wrongs.map((w) => (
                <div
                  key={w.question_id}
                  className="flex items-center gap-3.5 bg-canvas border border-hairline rounded-lg px-4 py-3 hover:bg-surface-soft transition-colors"
                >
                  <span className="text-[11px] font-semibold text-error bg-red-soft px-2 py-0.5 rounded-pill flex-shrink-0">
                    {SECTION_SHORT[w.section ?? ""] ?? "错题"}
                  </span>
                  <span className="flex-1 min-w-0 text-[13px] text-ink truncate">
                    {w.question ?? `第 ${w.number} 题`}
                  </span>
                  <span className="text-[11px] text-muted-soft flex-shrink-0 hidden sm:block">
                    {w.paper_title ? `来自《${w.paper_title}》` : ""}
                    {w.wrong_count > 1 ? ` · 错 ${w.wrong_count} 次` : ""}
                  </span>
                  <Link
                    href={`/practice/exams/redo?ids=${w.question_id}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-surface-card text-ink text-xs font-semibold hover:bg-brand-500 hover:text-on-primary transition-colors flex-shrink-0"
                  >
                    重做
                    <ArrowRight size={11} />
                  </Link>
                </div>
              ))}
              {wrongTotal > wrongs.length && (
                <Link
                  href="/practice/exams/redo"
                  className="text-center text-[13px] text-muted hover:text-ink transition-colors py-1"
                >
                  查看全部 {wrongTotal} 道错题
                </Link>
              )}
            </div>
          )}
        </div>

        {/* 已上线区块 */}
        <div className="grid gap-4 sm:grid-cols-2">
          {LIVE_SECTIONS.map((s) => (
            <Link
              key={s.key}
              href={s.href}
              className="group flex flex-col gap-3 bg-canvas border border-hairline rounded-xl p-6 hover:border-brand-400 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-lg bg-brand-500 text-on-primary flex items-center justify-center">
                  <s.icon size={18} />
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-pill bg-brand-50 text-brand-600">
                  <Sparkles size={11} />
                  已上线
                </span>
              </div>
              <div>
                <h2 className="text-base font-bold text-ink group-hover:text-brand-600 transition-colors">
                  {s.title}
                </h2>
                <p className="text-[13px] text-muted leading-relaxed mt-1.5">{s.desc}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-600 group-hover:gap-2.5 transition-all">
                {s.cta}
                <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>

        {/* 占位区块 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
          {PLACEHOLDER_SECTIONS.map((s) => (
            <div
              key={s.key}
              className="flex flex-col gap-3 bg-canvas border border-dashed border-hairline-strong rounded-xl p-6"
            >
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-lg bg-surface-soft flex items-center justify-center text-brand-500">
                  <s.icon size={18} />
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-pill bg-surface-card text-muted">
                  {s.status}
                </span>
              </div>
              <div>
                <h2 className="text-base font-bold text-ink">{s.title}</h2>
                <p className="text-[13px] text-muted leading-relaxed mt-1.5">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* 词汇本入口 */}
        <div className="mt-8 flex items-center justify-between gap-4 bg-canvas border border-hairline rounded-xl p-5">
          <div className="flex items-center gap-3.5 min-w-0">
            <span className="w-10 h-10 rounded-lg bg-ink text-canvas flex items-center justify-center flex-shrink-0">
              <BookOpen size={18} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink">词汇本单词训练</div>
              <div className="text-xs text-muted mt-0.5">SM-2 间隔复习 · 多题型训练，正常开放</div>
            </div>
          </div>
          <Link
            href="/vocabulary"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-ink text-canvas text-[13px] font-semibold hover:bg-brand-500 transition-colors flex-shrink-0"
          >
            去复习
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </main>
  );
}
