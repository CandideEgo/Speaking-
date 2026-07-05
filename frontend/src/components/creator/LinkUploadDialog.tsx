"use client";

import { useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { Link2, Upload } from "lucide-react";
import { seedFromUrlFull } from "@/lib/creatorData";
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

  async function handleImport(sourceUrl: string) {
    if (!sourceUrl.trim()) return;
    setSeeding(true);
    try {
      await seedFromUrlFull(sourceUrl);
      toast.success("视频已提交，等待管理员启动处理");
      onImported();
      // Close dialog immediately — list-level polling tracks status
      setUrl("");
      setSeeding(false);
      onClose();
    } catch (err) {
      setSeeding(false);
      toastApiError(err, "导入失败，请检查链接");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="导入视频" footer={null}>
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
