import { ApiError, getApiUrl, getToken } from "@/lib/api";
import { isTokenExpired } from "@/lib/jwt";
import type { RefreshOutcome } from "@/lib/sessionRefresh";
import type { TeachingRunEvent } from "@/types/teaching";

export interface SseMessage {
  id: string;
  event: string;
  data: string;
}

/** Incremental SSE parser, including CR/LF split across network chunks. */
export function createSseParser(onMessage: (message: SseMessage) => void) {
  let line = "";
  let skipLf = false;
  let id = "";
  let event = "";
  let data: string[] = [];
  let size = 0;
  const consumeLine = () => {
    if (!line) {
      if (data.length) onMessage({ id, event: event || "message", data: data.join("\n") });
      event = "";
      data = [];
      size = 0;
    } else if (!line.startsWith(":")) {
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "data") data.push(value);
      else if (field === "event") event = value;
      else if (field === "id" && !value.includes("\0")) id = value;
    }
    line = "";
  };
  return {
    push(chunk: string) {
      for (const char of chunk) {
        if (skipLf) {
          skipLf = false;
          if (char === "\n") continue;
        }
        if (char === "\r" || char === "\n") {
          consumeLine();
          skipLf = char === "\r";
        } else {
          line += char;
          size += 1;
          if (size > 256 * 1024) throw new Error("教学事件过大，请重新读取会话。");
        }
      }
    },
  };
}

interface StreamAuth {
  getToken: () => string | null;
  refresh: () => Promise<RefreshOutcome>;
  expire: () => void;
}

const defaultAuth: StreamAuth = {
  getToken,
  async refresh() {
    const { useAuthStore } = await import("@/stores/authStore");
    return useAuthStore.getState().refreshAccessToken();
  },
  async expire() {
    const { useAuthStore } = await import("@/stores/authStore");
    useAuthStore.getState().logout();
  },
};

/** GET subscribes only. Callers reconnect with after; this function never POSTs. */
export async function readTeachingEvents(
  runId: string,
  after: number,
  onEvent: (event: TeachingRunEvent) => void,
  signal: AbortSignal,
  dependencies: { auth?: StreamAuth; fetch?: typeof fetch } = {}
) {
  const auth = dependencies.auth ?? defaultAuth;
  const fetcher = dependencies.fetch ?? fetch;
  let refreshed = false;
  const refresh = async () => {
    refreshed = true;
    const outcome = await auth.refresh();
    if (outcome === "expired") {
      auth.expire();
      throw new ApiError("登录已过期，请重新登录。", 401);
    }
    if (outcome === "unavailable") throw new ApiError("连接暂时不可用，请稍后重试。");
  };
  const initialToken = auth.getToken();
  if (initialToken && isTokenExpired(initialToken)) await refresh();
  while (!signal.aborted) {
    const token = auth.getToken();
    if (!token) throw new ApiError("请先登录。", 401);
    const response = await fetcher(
      `${getApiUrl()}/api/v1/teaching/runs/${encodeURIComponent(runId)}/events?after=${Math.max(0, after)}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
        signal,
        cache: "no-store",
      }
    );
    if (response.status === 401 && !refreshed) {
      await refresh();
      continue;
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ApiError(body?.message ?? "讲解连接失败。", response.status, body?.code ?? null);
    }
    if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream"))
      throw new ApiError("讲解返回了无法识别的内容，请重新读取会话。");
    const decoder = new TextDecoder("utf-8", { fatal: true });
    const parser = createSseParser((message) => {
      const value: unknown = JSON.parse(message.data);
      if (typeof value !== "object" || value === null) throw new Error("讲解事件格式无效。");
      if (message.event === "error") {
        const body = value as { code?: unknown; message?: unknown };
        const code = typeof body.code === "string" ? body.code : null;
        const status = ["HTTP_401", "EXTERNAL_TOKEN_INVALID", "UNAUTHORIZED"].includes(code ?? "")
          ? 401
          : ["HTTP_403", "INSUFFICIENT_SCOPE", "FORBIDDEN"].includes(code ?? "")
            ? 403
            : code === "EVENT_CURSOR_EXPIRED"
              ? 410
              : code === "SERVICE_UNAVAILABLE"
                ? 503
                : 0;
        throw new ApiError(
          typeof body.message === "string" ? body.message : "讲解连接已中断。",
          status,
          code
        );
      }
      const event = value as TeachingRunEvent;
      if (
        event.schema_version !== 1 ||
        event.run_id !== runId ||
        !Number.isSafeInteger(event.sequence) ||
        event.sequence < 1 ||
        !Number.isSafeInteger(event.session_revision) ||
        typeof event.type !== "string" ||
        typeof event.payload !== "object" ||
        event.payload === null ||
        (message.id !== "" && message.id !== String(event.sequence))
      )
        throw new Error("讲解事件版本无法识别，请重新读取会话。");
      onEvent(event);
    });
    const reader = response.body.getReader();
    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) {
          parser.push(decoder.decode());
          return;
        }
        parser.push(decoder.decode(value, { stream: true }));
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    return;
  }
}
