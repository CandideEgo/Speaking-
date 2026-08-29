"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "seeword_boost_unlocked";

/**
 * useBoostUnlocked — 首页"已解锁优先"开关。
 *
 * 用户偏好：开启后首页视频流把已解锁视频排在前面，未解锁视频排在
 * 后面（保持各自内部相对顺序，避免打乱分类/难度/推荐逻辑）。
 *
 * 状态：localStorage 持久化，per-device。不污染后端 UserPreferences，
 * 因为这是 UI 偏好而非学习偏好。
 */
export function useBoostUnlocked(): {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  ready: boolean;
} {
  const [enabled, setEnabledState] = useState(false);
  const [ready, setReady] = useState(false);

  // Read on mount (avoid SSR/CSR mismatch by waiting for client).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      setEnabledState(raw === "1");
    } catch {
      // localStorage may be blocked (private mode etc.) — default to off.
    } finally {
      setReady(true);
    }
  }, []);

  // Sync to other tabs.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      setEnabledState(e.newValue === "1");
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      // Ignore write failures — toggle still works in-memory for the session.
    }
  }, []);

  return { enabled, setEnabled, ready };
}
