"use client";
import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/errors";

export function SaveSentenceButton({ subtitleId }: { subtitleId: string }) {
  const [status, setStatus] = useState<{ id: string; saved: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = status?.id === subtitleId && status.saved;
  useEffect(() => {
    const controller = new AbortController();
    api<{ saved: boolean }>(`/api/v1/discovery/sentence-favorites/${subtitleId}`, {
      signal: controller.signal,
    })
      .then((data) => setStatus({ id: subtitleId, saved: data.saved }))
      .catch(() => {});
    return () => controller.abort();
  }, [subtitleId]);
  async function toggle() {
    setBusy(true);
    try {
      const data = await api<{ saved: boolean }>(
        `/api/v1/discovery/sentence-favorites/${subtitleId}`,
        { method: saved ? "DELETE" : "PUT" }
      );
      setStatus({ id: subtitleId, saved: data.saved });
    } catch (err) {
      toastApiError(err, "收藏句子失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="outline" size="sm" disabled={busy} aria-pressed={!!saved} onClick={toggle}>
      <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
      {saved ? "已收藏这句" : "收藏这句"}
    </Button>
  );
}
