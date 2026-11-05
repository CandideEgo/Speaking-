import { describe, expect, it, vi } from "vitest";
import { createSseParser, readTeachingEvents } from "@/lib/teachingStream";

const token = `e30.${btoa(JSON.stringify({ exp: 4102444800 }))}.signature`;
const event = {
  schema_version: 1,
  run_id: "run-1",
  sequence: 1,
  session_revision: 2,
  type: "run.progress",
  payload: { message: "正在读取原文🙂" },
};

function streamResponse(text: string, chunkSize = 1) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += chunkSize)
          controller.enqueue(bytes.slice(i, i + chunkSize));
        controller.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } }
  );
}

describe("teaching SSE", () => {
  it("handles split CRLF, comments and multiline data without emitting an incomplete frame", () => {
    const messages: unknown[] = [];
    const parser = createSseParser((message) => messages.push(message));
    for (const char of ': heartbeat\r\nid: 9\r\nevent: card.upsert\r\ndata: {"one":1,\r\ndata: "two":2}\r\n\r\n')
      parser.push(char);
    parser.push("data: partial");
    expect(messages).toEqual([{ id: "9", event: "card.upsert", data: '{"one":1,\n"two":2}' }]);
  });

  it("decodes every UTF-8 byte boundary and only subscribes with the retained cursor", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        streamResponse(`id: 1\nevent: run.progress\ndata: ${JSON.stringify(event)}\n\n`)
      );
    const receive = vi.fn();
    const refresh = vi.fn();
    await readTeachingEvents("run-1", 18, receive, new AbortController().signal, {
      fetch: fetcher,
      auth: { getToken: () => token, refresh, expire: vi.fn() },
    });
    expect(receive).toHaveBeenCalledWith(event);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/v1/teaching/runs/run-1/events?after=18");
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty("method", "POST");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes only once on an initial 401 and sends the refreshed bearer", async () => {
    let current = token;
    const refresh = vi.fn(async () => {
      current = "new-token";
      return "refreshed" as const;
    });
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(streamResponse(": ok\n\n"));
    await readTeachingEvents("run-1", 0, vi.fn(), new AbortController().signal, {
      fetch: fetcher,
      auth: { getToken: () => current, refresh, expire: vi.fn() },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe("Bearer new-token");
  });

  it("keeps the session when refresh is temporarily unavailable", async () => {
    const expire = vi.fn();
    await expect(
      readTeachingEvents("run-1", 0, vi.fn(), new AbortController().signal, {
        fetch: vi.fn().mockResolvedValue(new Response("", { status: 401 })),
        auth: { getToken: () => token, refresh: async () => "unavailable", expire },
      })
    ).rejects.toThrow("暂时不可用");
    expect(expire).not.toHaveBeenCalled();
  });

  it("reports an expired event cursor so the caller can load the safe snapshot", async () => {
    await expect(
      readTeachingEvents("run-1", 88, vi.fn(), new AbortController().signal, {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ code: "EVENT_CURSOR_EXPIRED", message: "事件已清理" }), {
            status: 410,
          })
        ),
        auth: { getToken: () => token, refresh: vi.fn(), expire: vi.fn() },
      })
    ).rejects.toMatchObject({ status: 410, code: "EVENT_CURSOR_EXPIRED" });
  });

  it("rejects another run or an unknown event schema before delivery", async () => {
    const receive = vi.fn();
    for (const invalid of [
      { ...event, run_id: "someone-else" },
      { ...event, schema_version: 99 },
    ]) {
      await expect(
        readTeachingEvents("run-1", 0, receive, new AbortController().signal, {
          fetch: vi.fn().mockResolvedValue(streamResponse(`data: ${JSON.stringify(invalid)}\n\n`)),
          auth: { getToken: () => token, refresh: vi.fn(), expire: vi.fn() },
        })
      ).rejects.toThrow("版本无法识别");
    }
    expect(receive).not.toHaveBeenCalled();
  });

  it("handles a midstream error envelope without advancing the durable event cursor", async () => {
    const receive = vi.fn();
    const expire = vi.fn();
    const refresh = vi.fn();
    const text = `id: 1\ndata: ${JSON.stringify(event)}\n\nevent: error\ndata: ${JSON.stringify({ code: "HTTP_401", message: "登录已过期，请重新连接。" })}\n\n`;
    await expect(
      readTeachingEvents("run-1", 0, receive, new AbortController().signal, {
        fetch: vi.fn().mockResolvedValue(streamResponse(text)),
        auth: { getToken: () => token, refresh, expire },
      })
    ).rejects.toMatchObject({ status: 401, code: "HTTP_401" });
    expect(receive).toHaveBeenCalledTimes(1);
    expect(receive).toHaveBeenCalledWith(event);
    expect(refresh).not.toHaveBeenCalled();
    expect(expire).not.toHaveBeenCalled();
  });

  it("preserves auth on a network disconnect after stream establishment", async () => {
    const expire = vi.fn();
    const refresh = vi.fn();
    const body = new ReadableStream({
      start(controller) {
        controller.error(new TypeError("network disconnected"));
      },
    });
    await expect(
      readTeachingEvents("run-1", 8, vi.fn(), new AbortController().signal, {
        fetch: vi
          .fn()
          .mockResolvedValue(
            new Response(body, { headers: { "Content-Type": "text/event-stream" } })
          ),
        auth: { getToken: () => token, refresh, expire },
      })
    ).rejects.toThrow("network disconnected");
    expect(refresh).not.toHaveBeenCalled();
    expect(expire).not.toHaveBeenCalled();
  });
});
