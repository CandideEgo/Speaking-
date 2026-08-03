"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useVocabularyPractice } from "@/hooks/usePractice";
import { UnifiedPracticePanel } from "@/components/practice/PracticePanels";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { FullPageSpinner } from "@/components/common/Spinner";

/**
 * 全屏单词训练（原型 10-vocab-drill）。
 * 复用 useVocabularyPractice + UnifiedPracticePanel（6 题型轮换 + 结果汇总），
 * 套全屏 shell：drill-header(退出/进度/计数) + 居中题区。
 * 与 vocabulary 页的「快速复习」modal 区别：本页全屏沉浸、dueOnly 默认 true。
 */
export default function VocabDrillPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const session = useVocabularyPractice({
    count: 10,
    dueOnly: true,
    enabled: isAuthenticated && !isLoading,
  });

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  const total = session.items.length;
  const answered = Object.keys(session.graded).length;
  const pct = total ? Math.round((answered / total) * 100) : 0;

  return (
    <main className="min-h-full bg-surface-soft">
      {/* Drill header */}
      <div className="sticky top-0 z-30 bg-canvas/92 backdrop-blur border-b border-hairline">
        <div className="max-w-[880px] mx-auto flex items-center gap-3.5 px-4 py-3">
          <Link
            href="/vocabulary"
            aria-label="退出训练"
            className="w-[34px] h-[34px] rounded-md text-muted flex items-center justify-center hover:text-ink hover:bg-surface-card transition-colors flex-shrink-0"
          >
            <X size={20} />
          </Link>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-pill bg-surface-card text-[13px] font-semibold text-ink flex-shrink-0">
            <span className="w-2 h-2 rounded-full bg-brand-500" />
            词汇本 · 待复习
          </span>
          <div className="flex-1 h-1.5 rounded-full bg-surface-card overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-muted font-mono flex-shrink-0">
            {answered}/{total}
          </span>
        </div>
      </div>

      {/* Question area */}
      <div className="max-w-[880px] mx-auto px-4 py-8 pb-24">
        <UnifiedPracticePanel session={session} levelLabel="单词训练" />
      </div>
    </main>
  );
}
