"use client";

import { useEffect, useRef, useState } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { Mic, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import type { WatchChromeState } from "@/components/watch/WatchChromeProvider";

/**
 * WatchBottomBar — 观看页形态的壳底栏（DEC-069 / #31），**替换 5 Tab**。
 *
 *     ┌──────────────────────────────────────────────┐
 *     │ ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁  11 / 190        │ 2px 进度，44px 透明热区可拖
 *     ├──────────────────────────────────────────────┤
 *     │   ⏮ 上一句     ▶/⏸      ⏭ 下一句    🎙 跟读 │ 56px 四等分，各 ≥44×44
 *     └──────────────────────────────────────────────┘
 *
 * 占的就是 `MobileTabBar` 那个**壳内常规流槽位**（`shrink-0`，不是 `fixed bottom-0`）——
 * 安全区与 `dvh` 的归属因此一个字都不用改（INV-019）。iOS Safari 上 `fixed` 锚的是
 * layout viewport（地址栏收起时的高度），地址栏一出来就比可视区低 40px、压在地址栏上；
 * 常规流收尾行永远贴住可视区底边。e2e / `useSheetGeometry` 都按它定位。
 *
 * **进度条绝不用 React state 驱动**：`currentTime` 每秒跳 4 次，进 state 会让整个壳每秒
 * 重渲染 4 次。这里用 `requestAnimationFrame` 直读 `videoRef`，只写两处 DOM 的 `style`
 * （已播 / 已缓冲），一行 React 状态都不碰。拖动时改成 rAF 里回写 `currentTime`，
 * 于是「拖」与「播」共用同一条渲染路径，也不需要 seek 节流。
 */
export function WatchBottomBar({ chrome = {} }: { chrome?: WatchChromeState }) {
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // 判据用「≤1023px」那一档（计划 §5 说的 pathname + isMobile）。
  // 已知一处**有意保留**的边角：768–1023px（竖屏平板 / 窄桌面窗）`isMobile` 为真，底栏照常
  // 占位；这一段此前就没有实测读数，计划 §12 也明说「不动桌面版式」，所以不在这里加断点 ——
  // 要动先开票，别顺手加 `md:hidden`（那会让「哪个断点说了算」出现两个来源）。
  //
  // ⋯ 面板打开时让位：它是铺到屏底的抽屉，底栏是壳里铺满屏高的 flex 行 —— 两者同屏时
  // 后者会压住抽屉的动作行（实测「加入学习」只剩一个像素在缝里）。与 `MobileTabBar` 在
  // 考试流程里 `return null` 同一个先例。
  if (chrome.moreOpen) return null;
  return isDesktop ? null : <WatchBottomBarMobile chrome={chrome} />;
}

/**
 * 底栏高度（px）—— 实测 101：44px 进度热区 + 56px 按键行 + 1px 上边框。
 * e2e 与 `useSheetGeometry` 的上沿都按实测矩形算，这个常量只给需要在 React 里做布局的
 * 调用方（别把它当 58 —— 计划里首屏预算表写的就是 58，那是漏了进度热区那一档）。
 */
export const WATCH_BOTTOM_BAR_HEIGHT = 101;

function WatchBottomBarMobile({ chrome }: { chrome: WatchChromeState }) {
  const {
    videoRef,
    attachVideo: _attachVideo,
    duration,
    isPlaying,
    onTogglePlay,
    onPrev,
    onNext,
    sentenceNavDisabled,
    onShadowing,
    shadowingActive,
  } = chrome;

  /**
   * 本组件自己的 `<video>` 句柄 —— 页面每次报告的元素换了新对象，这个 state 也换新对象。
   *
   * 为什么需要它（这一条是实测踩出来的）：`<video>` 只在 `playbackMode === "ready"` 时才挂载，
   * 挂在 `videoRef` 上时 `.current` 从 null 变成元素**不会**重跑任何 effect；而 `attachVideo`
   * 本身是 `useCallback([])` 的**稳定引用**，拿它当依赖也不会变 —— 于是 `loadedmetadata`
   * 监听根本没订上（实测渲染日志：`hasRef: true / d: NaN`，而 effect 一次都没在元素存在后跑过），
   * `aria-valuemax` 永远停在兜底的 612。换成一个「元素变则身份变」的值，effect 才有着落。
   */
  const pageEl = videoRef?.current ?? null;
  const [videoHandle, setVideoHandle] = useState<HTMLVideoElement | null>(pageEl);
  if (videoHandle !== pageEl) setVideoHandle(pageEl); // React 官方的「渲染期同步 state」写法：立刻重渲染，不提交半成品

  const railRef = useRef<HTMLDivElement>(null);
  const playedRef = useRef<HTMLDivElement>(null);
  const bufferedRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const draggingRef = useRef(false);
  /** 拖动时若视频在播，松手后要接着播（原生 range 也一样）。 */
  const resumeRef = useRef(false);

  /**
   * 真实媒体时长 —— **只给 `aria-valuemax` 用**（DEC-070 T6）。
   *
   * `aria-valuemax` 没法像进度填充那样由 rAF 直写：aria 是给辅助技术读的属性，改它必须
   * 触发一次重渲染。而 `duration` 只在元数据到达时变一次，所以这里是一条**一次性**的
   * 低频 state，不违背「高频读数不进 React」那条铁律（`currentTime` 仍然一个字节都不进）。
   * 判据：`aria-valuemax` == `Math.round(video.duration)`（本地 fixture 612 → 720）。
   */
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);

  /** 总时长：**优先真实媒体时长**，store 里的 `duration` 只做兜底（DEC-070 T6）。
   *
   * 反过来的顺序踩过一次：DB 行 `duration=612`、媒体实际 `719.98s`，于是进度条在 612s
   * 就 100%、读数 `10:12` 对不上 12:00 的片子，最后 108s 既没有进度也没有字幕。
   * 数据侧的修复属于 ingest（本轮不动那条 fixture 行），UI 这边以媒体为准即可。 */
  function liveTotal(): number {
    const live = (videoHandle ?? videoRef?.current)?.duration;
    if (typeof live === "number" && Number.isFinite(live) && live > 0) return live;
    return duration && duration > 0 ? duration : 0;
  }

  // 元素一出现就订上元数据事件（元素自己可能还没 loadedmetadata —— 实测挂载那一刻
  // `readyState: 0 / duration: NaN`，所以「立刻读一次」不够，监听是必须的）。
  useEffect(() => {
    if (!videoHandle) return;
    const sync = () => {
      const d = videoHandle.duration;
      if (typeof d === "number" && Number.isFinite(d) && d > 0) setMediaDuration(d);
    };
    sync(); // 可能已经 loadedmetadata 过了（热重载 / 切走再切回），补读一次
    videoHandle.addEventListener("loadedmetadata", sync);
    videoHandle.addEventListener("durationchange", sync);
    return () => {
      videoHandle.removeEventListener("loadedmetadata", sync);
      videoHandle.removeEventListener("durationchange", sync);
    };
  }, [videoHandle]);

  /** 进度条的总长基准：真实媒体优先，store 兜底。 */
  const totalForSlider = mediaDuration ?? liveTotal();

  // rAF 直读：已播 / 已缓冲 / 时间读数。**不进 React state**。
  useEffect(() => {
    let raf = 0;
    let shownPct = -1;
    let shownTime = -1;
    let shownBuffered = -1;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const video = videoRef?.current;
      if (!video) return;
      const total = liveTotal();
      const time = video.currentTime;
      if (Number.isFinite(total) && total > 0) {
        const pct = Math.min(100, Math.max(0, (time / total) * 100));
        if (playedRef.current && Math.abs(pct - shownPct) > 0.05) {
          playedRef.current.style.width = `${pct}%`;
          shownPct = pct;
        }
        let buffered = 0;
        try {
          for (let i = 0; i < video.buffered.length; i++) {
            if (video.buffered.start(i) <= time && time <= video.buffered.end(i)) {
              buffered = (video.buffered.end(i) / total) * 100;
              break;
            }
          }
        } catch {
          // buffered 在 readyState 0 下会抛 InvalidStateError；忽略即可
        }
        if (bufferedRef.current && Math.abs(buffered - shownBuffered) > 0.2) {
          bufferedRef.current.style.width = `${Math.min(100, buffered)}%`;
          shownBuffered = buffered;
        }
      }
      const rounded = Math.floor(time);
      if (textRef.current && rounded !== shownTime) {
        textRef.current.textContent = `${formatClock(time)} / ${formatClock(total ?? 0)}`;
        shownTime = rounded;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // `liveTotal` 是每次渲染新建的普通函数，故意不进依赖（它只读 ref 与 `duration`）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, videoRef, videoHandle]);

  /** 指针横向位置 → 秒。热区是 44px 高的整条，不要求点在那 2px 细线上。 */
  function secondsAt(clientX: number): number | null {
    const video = videoRef?.current;
    const rail = railRef.current;
    if (!video || !rail) return null;
    const total = liveTotal();
    if (!Number.isFinite(total) || total <= 0) return null;
    const rect = rail.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return ratio * total;
  }

  function seekFromPointer(clientX: number) {
    const video = videoRef?.current;
    const seconds = secondsAt(clientX);
    if (!video || seconds === null) return;
    video.currentTime = seconds;
    // 立刻回写一次，别等下一帧（拖动时观感才跟手）。
    if (playedRef.current && railRef.current) {
      const rect = railRef.current.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      playedRef.current.style.width = `${ratio * 100}%`;
    }
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const video = videoRef?.current;
    if (!video) return;
    draggingRef.current = true;
    resumeRef.current = !video.paused;
    video.pause();
    e.currentTarget.setPointerCapture(e.pointerId);
    seekFromPointer(e.clientX);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    seekFromPointer(e.clientX);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // pointerId 可能已经释放
    }
    const video = videoRef?.current;
    if (video && resumeRef.current) void video.play().catch(() => {});
    resumeRef.current = false;
  }

  const seekStep = 5;

  return (
    <nav
      data-testid="watch-bottom-bar"
      data-shell-bottom-bar="watch"
      aria-label="播放控制"
      className="z-40 shrink-0 border-t border-hairline bg-canvas md:hidden"
    >
      {/* 进度：2px 细线 + 44px 透明热区（点/拖都在这一条上） */}
      <div
        data-testid="watch-progress"
        role="slider"
        tabIndex={0}
        aria-label="播放进度"
        aria-valuemin={0}
        aria-valuemax={Math.max(0, Math.round(totalForSlider))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          const video = videoRef?.current;
          if (!video) return;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            video.currentTime = Math.min(video.duration || 0, video.currentTime + seekStep);
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - seekStep);
          }
        }}
        className="relative h-11 cursor-pointer touch-none select-none"
      >
        <div ref={railRef} className="absolute inset-x-0 top-0 h-[2px] bg-hairline">
          <div ref={bufferedRef} className="h-full bg-cream-strong" style={{ width: "0%" }} />
          <div
            ref={playedRef}
            data-testid="watch-progress-fill"
            className="absolute inset-y-0 left-0 bg-brand-500"
            style={{ width: "0%" }}
          />
        </div>
      </div>

      {/* 四个键：各占 1/4，各 ≥44×44（触控基线） */}
      <div className="flex h-14 items-stretch">
        <button
          type="button"
          data-testid="watch-prev"
          onClick={onPrev}
          disabled={sentenceNavDisabled}
          aria-label="上一句"
          title={sentenceNavDisabled ? "YouTube 视频暂不支持逐句跳转" : "上一句"}
          className="flex flex-1 items-center justify-center gap-1.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          <SkipBack size={19} />
          上一句
        </button>

        <button
          type="button"
          data-testid="watch-toggle-play"
          onClick={onTogglePlay}
          aria-label={isPlaying ? "暂停" : "播放"}
          className="flex flex-1 items-center justify-center gap-1.5 text-[12px] font-semibold text-ink transition-colors hover:text-brand-500 cursor-pointer"
        >
          {isPlaying ? (
            <Pause size={21} fill="currentColor" />
          ) : (
            <Play size={21} fill="currentColor" />
          )}
          {isPlaying ? "暂停" : "播放"}
        </button>

        <button
          type="button"
          data-testid="watch-next"
          onClick={onNext}
          disabled={sentenceNavDisabled}
          aria-label="下一句"
          title={sentenceNavDisabled ? "YouTube 视频暂不支持逐句跳转" : "下一句"}
          className="flex flex-1 items-center justify-center gap-1.5 text-[12px] font-semibold text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          下一句
          <SkipForward size={19} />
        </button>

        <button
          type="button"
          data-testid="watch-shadowing"
          onClick={onShadowing}
          aria-label={shadowingActive ? "关闭跟读" : "跟读"}
          title={sentenceNavDisabled ? "YouTube 视频暂不支持逐句跟读" : "跟读练习"}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 text-[12px] font-semibold transition-colors cursor-pointer",
            shadowingActive ? "text-brand-500" : "text-muted hover:text-ink"
          )}
        >
          <Mic size={19} />
          跟读
        </button>
      </div>

      {/* 时间读数由 rAF 直写 textContent（不在 React 里） */}
      <span
        ref={textRef}
        data-testid="watch-progress-time"
        className="sr-only"
        aria-hidden="true"
      />
    </nav>
  );
}

/** `m:ss`（总时长可能还没读到，全 0 就显示 `0:00`）。 */
function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
