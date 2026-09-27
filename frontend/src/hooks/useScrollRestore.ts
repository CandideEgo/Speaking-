"use client";

import { useEffect } from "react";
import { SCROLL_CONTAINER_ID, loadScroll, saveScroll } from "@/lib/scrollMemory";

/** 恢复循环的上限：连续 3 帧命中目标（±1px）即停，否则最多跑这么久。 */
const RESTORE_HITS = 3;
const RESTORE_TIMEOUT_MS = 1200;
/** 滚动写入节流：滚动事件每帧都发，存档没必要跟着。 */
const SAVE_THROTTLE_MS = 200;

/**
 * Restore and then remember the app shell's scroll offset for `key`.
 *
 * `ready` = the list has its data; restoring before that is pointless (the
 * container is not tall enough yet) and would burn the whole timeout budget.
 * Pages render without the shell for anonymous users, where the container is
 * absent — that case silently does nothing.
 */
export function useScrollRestore(key: string, ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    const container = document.getElementById(SCROLL_CONTAINER_ID);
    if (!container) return;
    return watchContainer(container, () => key);
  }, [ready, key]);
}

/** Attach the restore-then-remember pair to the shell scroller. */
function watchContainer(container: HTMLElement, currentKey: () => string): () => void {
  let restoring = false;
  let frame = 0;

  function abortRestore() {
    if (!restoring) return;
    restoring = false;
    cancelAnimationFrame(frame);
    container.removeEventListener("wheel", abortRestore);
    container.removeEventListener("touchstart", abortRestore);
    container.removeEventListener("keydown", abortRestore);
  }

  const stored = loadScroll(currentKey());
  // 0 表示用户当时就在顶部 —— 没有要恢复的位置，也就没有理由动滚动条。
  if (stored !== null && stored > 0) {
    const target: number = stored;
    restoring = true;
    const startedAt = Date.now();
    let hits = 0;
    function tick() {
      if (!restoring) return;
      container.scrollTop = target;
      hits = Math.abs(container.scrollTop - target) <= 1 ? hits + 1 : 0;
      // 内容还没长够高时 scrollTop 会被夹住，命中不了 —— 超时兜底退出。
      if (hits >= RESTORE_HITS || Date.now() - startedAt > RESTORE_TIMEOUT_MS) {
        abortRestore();
        return;
      }
      frame = requestAnimationFrame(tick);
    }
    // 用户一动滚轮就放弃：他已经在看别处了，再把画面拽回去才是 bug。
    container.addEventListener("wheel", abortRestore, { passive: true });
    container.addEventListener("touchstart", abortRestore, { passive: true });
    container.addEventListener("keydown", abortRestore);
    frame = requestAnimationFrame(tick);
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  // 待写入的偏移连同它属于哪个 key 一起记下：清理时 key 可能已经换成新 URL 了。
  let pending: { key: string; top: number } | null = null;

  function flush() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending !== null) {
      saveScroll(pending.key, pending.top);
      pending = null;
    }
  }

  function onScroll() {
    // 恢复期间的中间位置不能写：会把存档覆盖成一个没人想回去的偏移。
    if (restoring) return;
    pending = { key: currentKey(), top: container.scrollTop };
    if (timer === null) timer = setTimeout(flush, SAVE_THROTTLE_MS);
  }
  container.addEventListener("scroll", onScroll, { passive: true });

  return () => {
    abortRestore();
    // 滚完立刻点卡片离开时，待写的偏移还没到点 —— 这里补写，否则最后一段位置丢失。
    flush();
    container.removeEventListener("scroll", onScroll);
  };
}
