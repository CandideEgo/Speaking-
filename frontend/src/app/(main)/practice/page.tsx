"use client";

import Link from "next/link";
import { Layers, Clock, BookOpen, FileText, ArrowRight } from "lucide-react";

/**
 * 练习专题 —— 占位页。
 * 试题功能（视频试卷 / 真题试卷 / 每日水平检测）暂不开放，代码已下线，
 * 保留入口与页面区域，后续重写后再开发。词汇本单词训练不受影响。
 */
const PLACEHOLDER_SECTIONS = [
  {
    key: "video",
    title: "视频试卷",
    icon: Layers,
    desc: "由视频字幕与考点词汇自动生成，按目标考试层级出题。",
    status: "即将上线",
  },
  {
    key: "real",
    title: "真题试卷",
    icon: FileText,
    desc: "四六级 / 雅思 / 托福历年原题，系统整理后开放。",
    status: "即将上线",
  },
  {
    key: "daily",
    title: "每日水平检测",
    icon: Clock,
    desc: "每天一张跨视频综合卷，检验学习成果。",
    status: "即将上线",
  },
];

export default function PracticePage() {
  return (
    <main className="min-h-full bg-surface-soft">
      <div className="container-page py-8 pb-24">
        {/* 页头 */}
        <div className="mb-8">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-brand-50 text-brand-600 text-[13px] font-semibold">
            <span className="w-2 h-2 rounded-full bg-brand-500" />
            练习专题
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight mt-3 mb-2">练习功能正在重做</h1>
          <p className="text-sm text-muted leading-relaxed max-w-[60ch]">
            试题练习（视频试卷、真题试卷、每日检测）暂时下线，我们将重新设计后开放。
            词汇本的单词训练不受影响，可以先去复习。
          </p>
        </div>

        {/* 占位区块 */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse" />
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
            <span className="w-10 h-10 rounded-lg bg-brand-500 text-on-primary flex items-center justify-center flex-shrink-0">
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
