"use client";

import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { Loader2, Link2, Upload } from "lucide-react";
import { seedFromUrlFull, getMyVideoStatus } from "@/lib/creatorData";
import { PROCESSING_STATUS_CONFIG, STEP_LABELS_SHORT } from "@/lib/videoStatus";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/common/Modal";

/** Curated list of recommended videos for the link-import dialog. */
const RECOMMENDED_VIDEOS = [
  {
    title: "TED-Ed: How do vaccines work?",
    url: "https://www.youtube.com/watch?v=3NAlLZnO6Lk",
  },
  {
    title: "BBC Learning English: The English We Speak",
    url: "https://www.youtube.com/watch?v=ZM9F9h3tDaE",
  },
  {
    title: "Kurzgesagt: The Immune System Explained",
    url: "https://www.youtube.com/watch?v=zQGOcOUBi6s",
  },
  {
    title: "Crash Course: History of the World",
    url: "https://www.youtube.com/watch?v=Yocja_N5s1I",
  },
];

interface LinkUploadDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function LinkUploadDialog({
  open,
  onClose,
  onImported,
}: LinkUploadDialogProps) {
  const [url, setUrl] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [progressText, setProgressText] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up polling on unmount or close
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function handleImport(sourceUrl: string) {
    if (!sourceUrl.trim()) return;
    setSeeding(true);
    setProgressText("正在导入...");
    try {
      const video = await seedFromUrlFull(sourceUrl);
      setProgressText("处理中...");
      onImported();

      // Poll until ready or error
      pollRef.current = setInterval(async () => {
        try {
          const st = await getMyVideoStatus(video.id);
          setProgressText(
            st.processing_step
              ? `${STEP_LABELS_SHORT[st.processing_step] ?? st.processing_step}（${st.processing_progress ?? 0}%）`
              : (PROCESSING_STATUS_CONFIG[st.status]?.label ?? st.status),
          );
          if (st.status === "ready") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setSeeding(false);
            setProgressText("");
            setUrl("");
            toast.success("视频处理完成");
            onImported();
          } else if (st.status === "error") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setSeeding(false);
            setProgressText("");
            toast.error("视频处理失败，请检查链接或重试");
          } else if (st.status === "pending_processing") {
            setProgressText("等待管理员启动处理...");
          }
        } catch {
          // transient poll error — keep polling
        }
      }, 3000);
    } catch (err) {
      setSeeding(false);
      setProgressText("");
      toastApiError(err, "导入失败，请检查链接");
    }
  }

  function handleClose() {
    if (seeding) return; // Don't close while processing
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setUrl("");
    setProgressText("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      closeOnBackdrop={!seeding}
      title="导入视频"
      footer={null}
    >
      <div className="space-y-5">
        {/* URL input */}
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            粘贴视频链接
          </label>
          <p className="text-xs text-muted mb-2">
            支持 YouTube、Bilibili 等平台链接
          </p>
          <div className="flex gap-2">
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="flex-1"
              disabled={seeding}
            />
            <Button
              onClick={() => handleImport(url)}
              disabled={seeding || !url.trim()}
              className="whitespace-nowrap"
              icon={Link2}
            >
              {seeding ? "导入中..." : "一键导入"}
            </Button>
          </div>
          {progressText && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" />
              {progressText}
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-hairline" />

        {/* Recommended videos */}
        <div>
          <label className="block text-sm font-medium text-ink mb-2">
            推荐视频
          </label>
          <p className="text-xs text-muted mb-3">
            精选英语学习视频，点击导入到你的创作空间
          </p>
          <div className="flex flex-col gap-2">
            {RECOMMENDED_VIDEOS.map((video) => (
              <div
                key={video.url}
                className="flex items-center gap-3 p-2.5 rounded-lg border border-hairline hover:border-ink/30 hover:bg-surface-soft transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink truncate">{video.title}</p>
                  <p className="text-[11px] text-muted truncate">{video.url}</p>
                </div>
                <Button
                  variant="secondary"
                  size="compact"
                  onClick={() => handleImport(video.url)}
                  disabled={seeding}
                  icon={Upload}
                >
                  导入
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
