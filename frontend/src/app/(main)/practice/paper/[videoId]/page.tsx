"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Clock, ArrowRight, AlertCircle } from "lucide-react";
import { PaperRunner } from "@/components/practice/PaperRunner";
import { api } from "@/lib/api";
import {
  getVideoPaper,
  drillToPaper,
  useInstantPracticeSubmit,
  type ExamQuestionDTO,
} from "@/lib/examData";
import { FullPageSpinner } from "@/components/common/Spinner";
import type { Paper } from "@/data/practicePaper";
import type { Video } from "@/types";

/** Map CEFR difficulty -> practice level label + key for the hero tag / exam link. */
function levelOf(difficulty: string | null | undefined): { label: string; key: string } {
  const dl = (difficulty ?? "").toUpperCase();
  if (dl.startsWith("A")) return { label: "高考", key: "gaoKao" };
  if (dl.startsWith("B1")) return { label: "四级", key: "cet4" };
  if (dl.startsWith("B2")) return { label: "六级", key: "cet6" };
  if (dl.startsWith("C")) return { label: "雅思", key: "ielts" };
  return { label: "四级", key: "cet4" };
}

export default function PaperColumnPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const [video, setVideo] = useState<Video | null>(null);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [ordered, setOrdered] = useState<ExamQuestionDTO[]>([]);
  const [paperLevel, setPaperLevel] = useState<string>("cet4");
  const [loadError, setLoadError] = useState<string | null>(null);

  // Video meta (title/difficulty for the hero).
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    api<Video>(`/api/v1/videos/${videoId}`)
      .then((v) => {
        if (!cancelled) setVideo(v);
      })
      .catch(() => {
        if (!cancelled) setLoadError("加载视频信息失败");
      });
    return () => {
      cancelled = true;
    };
  }, [videoId]);

  // Real paper from the backend (instant mode: answers included, client-graded).
  useEffect(() => {
    if (!videoId || !video) return;
    let cancelled = false;
    const { key } = levelOf(video.difficulty_level);
    getVideoPaper(videoId, key)
      .then((res) => {
        if (cancelled) return;
        const { paper: p, ordered: o } = drillToPaper(res.items, true);
        setPaper(p);
        setOrdered(o);
        setPaperLevel(res.exam_level);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "试卷加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [videoId, video]);

  const level = levelOf(video?.difficulty_level);
  const title = video?.title ?? "加载中…";

  // Instant-mode judgements write back SM-2 mastery (debounced batch).
  const onInstantJudged = useInstantPracticeSubmit(
    videoId ?? "",
    ordered,
    `${videoId}-${paperLevel}`
  );

  // Paper stats from the real question set.
  const qCount = paper?.reduce((s, p) => s + p.items.length, 0) ?? 0;
  const fullScore = paper?.reduce((s, p) => s + p.items.reduce((ss, q) => ss + q.pts, 0), 0) ?? 0;
  const partCount = paper?.length ?? 0;

  return (
    <>
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#161616] to-[#0a0a0a] text-[#fafafa]">
        <div className="max-w-[880px] mx-auto px-5 py-8 sm:py-9">
          <Link
            href="/practice"
            className="inline-flex items-center gap-1.5 text-[13px] text-[rgba(250,250,250,0.7)] hover:text-white mb-3.5 transition-colors"
          >
            <ChevronLeft size={14} />
            返回练习专题
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-pill bg-[rgba(255,122,69,0.15)] text-[#ff7a45] uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
            {level.label}{" "}
            {level.key === "cet4"
              ? "CET-4"
              : level.key === "cet6"
                ? "CET-6"
                : level.key === "ielts"
                  ? "IELTS"
                  : level.key === "gaoKao"
                    ? "高考"
                    : level.key === "toefl"
                      ? "TOEFL"
                      : level.key === "zhongkao"
                        ? "中考"
                        : ""}
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight mt-3 mb-1.5">{title} · 试卷</h1>
          <p className="text-[13px] text-[rgba(250,250,250,0.65)] leading-relaxed max-w-[60ch]">
            基于本视频字幕与考点词汇生成 · 按{level.label}
            层级自适应出题。点选项即时给出对错与解析，适合学习巩固；想模拟考试请进入考试模式。
          </p>
          <div className="flex gap-5 mt-4 flex-wrap">
            <div className="text-xs text-[rgba(250,250,250,0.6)]">
              <strong className="block text-lg font-bold font-mono text-white mb-0.5">
                {qCount || "–"}
              </strong>
              题量
            </div>
            <div className="text-xs text-[rgba(250,250,250,0.6)]">
              <strong className="block text-lg font-bold font-mono text-white mb-0.5">
                {fullScore || "–"}
              </strong>
              满分
            </div>
            <div className="text-xs text-[rgba(250,250,250,0.6)]">
              <strong className="block text-lg font-bold font-mono text-white mb-0.5">
                {partCount || "–"}
              </strong>
              部分
            </div>
          </div>
          <div className="flex gap-2.5 mt-5 flex-wrap">
            <Link
              href={`/practice/exam?videoId=${videoId}&level=${paperLevel}`}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md bg-brand-500 text-on-primary text-sm font-semibold shadow-brand hover:bg-brand-600 transition-colors"
            >
              <Clock size={14} />
              考试模式（提交判分）
            </Link>
            <Link
              href={`/watch/${videoId}`}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md bg-white/10 text-white text-sm font-semibold hover:bg-white/20 transition-colors"
            >
              回到视频
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </div>

      {loadError && (
        <div className="max-w-[880px] mx-auto px-5 py-10">
          <div className="flex items-start gap-2.5 p-4 bg-red-soft border border-error/20 rounded-lg text-sm text-error">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>{loadError}</span>
          </div>
        </div>
      )}

      {!loadError && !paper && <FullPageSpinner />}
      {paper && (
        <PaperRunner
          key={paperLevel}
          paper={paper}
          mode="instant"
          onInstantJudged={onInstantJudged}
        />
      )}
    </>
  );
}
