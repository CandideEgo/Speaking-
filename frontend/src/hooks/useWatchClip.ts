"use client";
import { useEffect, useState } from "react";
import { fetchHomeEditorial } from "@/lib/homeEditorial";
import type { HomeEditorialVideoSlot } from "@/types/homeContent";

export function useWatchClip(videoId: string, revision: string | null) {
  const [result, setResult] = useState<{
    key: string;
    slot: HomeEditorialVideoSlot | null;
    error: string | null;
  } | null>(null);
  const key = `${videoId}|${revision}`;
  useEffect(() => {
    if (!revision) {
      setResult(null);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    const timer = window.setTimeout(() => controller.abort(), 8000);
    fetchHomeEditorial(controller.signal)
      .then((page) => {
        if (cancelled) return;
        const slot = [page?.lead, ...(page?.secondary ?? [])].find(
          (s) =>
            s?.video.id === videoId && s.content.content_revision_id === revision && s.content.clip
        );
        setResult({
          key,
          slot: slot ?? null,
          error: slot
            ? null
            : "片段已更新或字幕已变化，请打开完整视频，或展开“片段与表达”查看当前内容。",
        });
      })
      .catch(() => {
        if (!cancelled)
          setResult({
            key,
            slot: null,
            error: "片段信息暂不可用，可以打开完整视频，或稍后重新展开“片段与表达”。",
          });
      })
      .finally(() => window.clearTimeout(timer));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, videoId, revision]);
  return result?.key === key ? result : null;
}
