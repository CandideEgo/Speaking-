/**
 * 逐句听写的练习模式（B01：跟打 vs 默写）。
 *
 * 两种模式的**题面、判分与草稿完全相同**——差别只在输入时原句是否可见：
 *
 * - `dictation`（听音默写，默认）：只放原声，原句提交后才揭晓；
 * - `follow`（看原文跟打）：输入框上方常驻原句，用于「先熟悉句子再默写」。
 *
 * 模式是纯展示层的选择，不进会话冻结、不影响判分，也不改服务端契约；因此
 * 只存在本机，跨设备不共享。取值校验放在这里，是为了让脏值（旧版本、手改
 * localStorage）一律回落到默认模式，而不是把界面顶到空状态。
 */

export type ListeningMode = "dictation" | "follow";

export const DEFAULT_LISTENING_MODE: ListeningMode = "dictation";
export const LISTENING_MODE_STORAGE_KEY = "seeword_listening_mode";

export const LISTENING_MODES: readonly ListeningMode[] = ["dictation", "follow"];

/** 把任意存储值/旧值收敛成合法模式；未知值一律回落默认。 */
export function normalizeListeningMode(value: unknown): ListeningMode {
  return value === "follow" || value === "dictation" ? value : DEFAULT_LISTENING_MODE;
}

/** 模式按钮的文案与提示（同一处定义，列表与按钮不各写一遍）。 */
export function listeningModeMeta(mode: ListeningMode): {
  label: string;
  hint: string;
} {
  return mode === "follow"
    ? { label: "看原文跟打", hint: "原句显示在输入框上方，对照着打一遍。" }
    : { label: "听音默写", hint: "只放原声；提交后才能看到原句与逐词对照。" };
}

export function loadListeningMode(): ListeningMode {
  if (typeof window === "undefined") return DEFAULT_LISTENING_MODE;
  try {
    return normalizeListeningMode(window.localStorage.getItem(LISTENING_MODE_STORAGE_KEY));
  } catch {
    // 隐私模式等场景下 localStorage 可能不可用：模式退回默认，不影响作答。
    return DEFAULT_LISTENING_MODE;
  }
}

export function saveListeningMode(mode: ListeningMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LISTENING_MODE_STORAGE_KEY, normalizeListeningMode(mode));
  } catch {
    // 存不下不影响本轮作答。
  }
}
