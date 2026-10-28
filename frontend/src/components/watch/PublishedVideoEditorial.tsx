"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { fetchHomeEditorial } from "@/lib/homeEditorial";
import { validWatchClip } from "@/lib/watchClip";
import { watchHref } from "@/lib/watchEntry";
import { formatTime } from "@/lib/format";
import type { HomeEditorialVideoSlot } from "@/types/homeContent";
import type { VideoDetail } from "@/types";

/** 展开时重新读取公共发布内容，不读取草稿或缓存旧版本。 */
export function PublishedVideoEditorial({ video }: { video: VideoDetail }) {
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [slot, setSlot] = useState<HomeEditorialVideoSlot | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  function focusHref(subtitleId: string, start: number, revision?: string) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of ["clip", "sub", "t", "word", "note"]) params.delete(key);
    params.set("sub", subtitleId);
    params.set("t", String(start));
    params.set("autoplay", "1");
    if (revision) params.set("clip", revision);
    return `${watchHref(video.id)}?${params.toString()}`;
  }
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    []
  );

  async function load() {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState("loading");
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const page = await fetchHomeEditorial(controller.signal);
      if (controller.signal.aborted || controllerRef.current !== controller) return;
      const published = [page?.lead, ...(page?.secondary ?? [])].find(
        (item) => item?.video.id === video.id
      );
      setSlot(published ?? null);
      setState("ready");
    } catch {
      if (controllerRef.current === controller) setState("error");
    } finally {
      window.clearTimeout(timer);
    }
  }

  const expressions =
    slot?.content.expressions.filter((expression) =>
      video.subtitles.some(
        (subtitle) =>
          subtitle.id === expression.sentence.subtitle_id &&
          subtitle.text_en === expression.sentence.text_en
      )
    ) ?? [];
  const clip =
    slot?.content.clip && validWatchClip(slot, video.subtitles, video.duration)
      ? slot.content.clip
      : null;
  if (state === "ready" && !clip && !expressions.length) return null;
  return (
    <details
      className="mt-4 border-t border-hairline py-3"
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
        else {
          controllerRef.current?.abort();
          controllerRef.current = null;
          setState("idle");
          setSlot(null);
        }
      }}
    >
      <summary className="cursor-pointer text-copy font-semibold text-ink">片段与表达</summary>
      {state === "loading" && (
        <p role="status" className="mt-3 text-meta text-muted">
          正在读取已发布内容…
        </p>
      )}
      {state === "error" && (
        <div role="status" className="mt-3 text-meta text-muted">
          内容暂时未能加载
          <Button variant="text" size="compact" onClick={() => void load()}>
            重试
          </Button>
        </div>
      )}
      {state === "ready" && slot && (
        <div className="mt-3 space-y-3">
          {clip && (
            <Link
              className="block text-meta text-brand-700"
              href={focusHref(
                clip.start_subtitle_id,
                clip.start_time,
                slot.content.content_revision_id
              )}
            >
              观看片段 · {formatTime(clip.start_time)}–{formatTime(clip.end_time)}
            </Link>
          )}
          {expressions.map((expression) => (
            <div key={expression.id}>
              <p className="text-copy font-semibold text-ink">{expression.phrase}</p>
              {expression.gloss_zh && <p className="text-meta text-body">{expression.gloss_zh}</p>}
              <Link
                className="block text-meta text-brand-700"
                href={focusHref(expression.sentence.subtitle_id, expression.sentence.start_time)}
              >
                {expression.sentence.text_en}
              </Link>
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
