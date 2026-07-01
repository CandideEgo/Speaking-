"use client";

import { useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { Loader2, Share2 } from "lucide-react";

import { api } from "@/lib/api";
import { Modal } from "@/components/common/Modal";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

/**
 * Share-to-community dialog. POSTs a community post with the right post_type
 * + linked id (the backend derives the author from the JWT).
 *
 * Supported shares:
 * - video_share:        { videoId }              → a watched/UGC video
 * - speaking_share:     { speakingAttemptId }    → a speaking attempt
 * - progress_share:     (no linked id)           → free-form progress note
 *
 * The caller controls visibility via `open`/`onClose`.
 */
export function ShareToCommunityDialog({
  open,
  onClose,
  videoId,
  videoTitle,
  speakingAttemptId,
}: {
  open: boolean;
  onClose: () => void;
  videoId?: string | null;
  videoTitle?: string | null;
  speakingAttemptId?: string | null;
}) {
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const postType = speakingAttemptId
    ? "speaking_share"
    : videoId
      ? "video_share"
      : "progress_share";

  const subject = videoTitle
    ? `视频「${videoTitle}」`
    : speakingAttemptId
      ? "我的口语练习"
      : "学习进展";

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await api("/api/v1/community/posts", {
        method: "POST",
        body: JSON.stringify({
          content: content.trim() || `分享了${subject}`,
          post_type: postType,
          video_id: videoId ?? null,
          speaking_attempt_id: speakingAttemptId ?? null,
        }),
      });
      toast.success("已分享到社区");
      setContent("");
      onClose();
    } catch (err) {
      toastApiError(err, "分享失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!submitting}
      title={
        <>
          <Share2 size={15} /> 分享到社区
        </>
      }
      footer={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting && <Loader2 size={13} className="animate-spin" />}
            发布
          </Button>
        </>
      }
    >
      <p className="text-xs text-muted-foreground">
        将{subject}分享到社区，让同学看到你的学习。
      </p>

      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        autoFocus
        placeholder={`说点什么（可留空，将默认填入"分享了${subject}"）`}
        className="resize-none"
      />
    </Modal>
  );
}
