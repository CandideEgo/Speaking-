import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_LISTENING_MODE,
  LISTENING_MODE_STORAGE_KEY,
  listeningModeMeta,
  loadListeningMode,
  normalizeListeningMode,
  saveListeningMode,
} from "./listeningMode";

function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listening practice mode", () => {
  it("未知值与缺失值都回落成听音默写", () => {
    expect(DEFAULT_LISTENING_MODE).toBe("dictation");
    expect(normalizeListeningMode(null)).toBe("dictation");
    expect(normalizeListeningMode("bogus")).toBe("dictation");
    expect(normalizeListeningMode("")).toBe("dictation");
  });

  it("合法模式原样保留", () => {
    expect(normalizeListeningMode("follow")).toBe("follow");
    expect(normalizeListeningMode("dictation")).toBe("dictation");
  });

  it("没有 window 时读默认值（服务端渲染 / node 环境）", () => {
    expect(loadListeningMode()).toBe("dictation");
  });

  it("模式在本机往返保存", () => {
    const store = stubStorage();
    saveListeningMode("follow");
    expect(store.get(LISTENING_MODE_STORAGE_KEY)).toBe("follow");
    expect(loadListeningMode()).toBe("follow");
  });

  it("存储里的脏值读出来是默认模式", () => {
    stubStorage({ [LISTENING_MODE_STORAGE_KEY]: "spell" });
    expect(loadListeningMode()).toBe("dictation");
  });

  it("两种模式的文案与提示不同，且都非空", () => {
    const dictation = listeningModeMeta("dictation");
    const follow = listeningModeMeta("follow");
    expect(dictation.label).toBe("听音默写");
    expect(follow.label).toBe("看原文跟打");
    expect(dictation.hint).not.toBe(follow.hint);
  });
});
