"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { Megaphone, Send, Loader2 } from "lucide-react";
import {
  listAdminFeedback,
  updateAdminFeedback,
  broadcastAnnouncement,
  type AdminFeedback,
} from "@/lib/adminData";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { relativeTime } from "@/lib/date";

const STATUS_TABS = [
  { key: "", label: "全部" },
  { key: "open", label: "待处理" },
  { key: "in_progress", label: "处理中" },
  { key: "resolved", label: "已解决" },
] as const;

const STATUS_BADGE: Record<string, { tone: string; text: string }> = {
  open: { tone: "brand", text: "待处理" },
  in_progress: { tone: "warning", text: "处理中" },
  resolved: { tone: "success", text: "已解决" },
};

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<AdminFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Announcement form state.
  const [annTitle, setAnnTitle] = useState("");
  const [annMessage, setAnnMessage] = useState("");
  const [sending, setSending] = useState(false);

  // Reply state per feedback row.
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await listAdminFeedback(statusFilter || undefined);
        if (!cancelled) setFeedback(res.items);
      } catch (e) {
        toastApiError(e, "加载反馈失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  async function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!annTitle.trim() || !annMessage.trim()) {
      toast.error("标题和内容不能为空");
      return;
    }
    setSending(true);
    try {
      const res = await broadcastAnnouncement({
        title: annTitle.trim(),
        message: annMessage.trim(),
      });
      toast.success(`公告已发送给 ${res.notified_count} 位用户`);
      setAnnTitle("");
      setAnnMessage("");
    } catch (e) {
      toastApiError(e, "发送失败");
    } finally {
      setSending(false);
    }
  }

  async function handleReply(fb: AdminFeedback) {
    const reply = (replyDraft[fb.id] ?? "").trim();
    if (!reply) {
      toast.error("请输入回复内容");
      return;
    }
    setSavingId(fb.id);
    try {
      const updated = await updateAdminFeedback(fb.id, {
        admin_reply: reply,
        status: fb.status === "open" ? "in_progress" : fb.status,
      });
      setFeedback((prev) => prev.map((f) => (f.id === fb.id ? updated : f)));
      setReplyDraft((prev) => {
        const next = { ...prev };
        delete next[fb.id];
        return next;
      });
      toast.success("已回复");
    } catch (e) {
      toastApiError(e, "回复失败");
    } finally {
      setSavingId(null);
    }
  }

  async function handleStatusChange(fb: AdminFeedback, status: string) {
    setSavingId(fb.id);
    try {
      const updated = await updateAdminFeedback(fb.id, { status });
      setFeedback((prev) => prev.map((f) => (f.id === fb.id ? updated : f)));
      toast.success("状态已更新");
    } catch (e) {
      toastApiError(e, "更新失败");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">反馈与公告</h1>
        <p className="text-sm text-muted mt-1">查看用户反馈、回复、向全体用户发送公告</p>
      </div>

      {/* Broadcast announcement */}
      <Card as="form" padding={5} className="space-y-3" onSubmit={handleBroadcast}>
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Megaphone size={16} className="text-brand-500" />
          发送公告
        </h2>
        <Input
          type="text"
          value={annTitle}
          onChange={(e) => setAnnTitle(e.target.value)}
          placeholder="公告标题"
          maxLength={200}
          required
        />
        <Textarea
          value={annMessage}
          onChange={(e) => setAnnMessage(e.target.value)}
          placeholder="公告内容（将通知所有用户）"
          rows={3}
          maxLength={2000}
          required
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={sending} icon={sending ? Loader2 : Send}>
            {sending ? "发送中..." : "发送公告"}
          </Button>
        </div>
      </Card>

      {/* Feedback list */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold">用户反馈</h2>
          <div className="flex gap-1 ml-auto">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatusFilter(t.key)}
                className={
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer " +
                  (statusFilter === t.key
                    ? "bg-brand-500 text-white"
                    : "bg-surface-soft text-muted hover:text-ink")
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="animate-spin text-muted" size={20} />
          </div>
        ) : feedback.length === 0 ? (
          <EmptyState icon={Megaphone} title="暂无反馈" />
        ) : (
          <div className="space-y-2">
            {feedback.map((fb) => {
              const st = STATUS_BADGE[fb.status] ?? STATUS_BADGE.open;
              return (
                <Card key={fb.id} padding={4} className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge tone={st.tone as never}>{st.text}</Badge>
                      <span className="text-xs text-muted">{fb.user_name ?? "匿名用户"}</span>
                      <span className="text-[11px] text-muted-soft">
                        {relativeTime(fb.created_at)}
                      </span>
                    </div>
                    <select
                      value={fb.status}
                      onChange={(e) => handleStatusChange(fb, e.target.value)}
                      disabled={savingId === fb.id}
                      className="text-xs rounded-md border border-hairline bg-canvas px-2 py-1 text-ink"
                    >
                      <option value="open">待处理</option>
                      <option value="in_progress">处理中</option>
                      <option value="resolved">已解决</option>
                    </select>
                  </div>
                  <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
                    {fb.content}
                  </p>
                  {fb.contact && <p className="text-xs text-muted">联系方式：{fb.contact}</p>}
                  {fb.admin_reply && (
                    <div className="pt-2 border-t border-hairline">
                      <p className="text-[11px] text-muted mb-0.5">已回复</p>
                      <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">
                        {fb.admin_reply}
                      </p>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={replyDraft[fb.id] ?? ""}
                      onChange={(e) =>
                        setReplyDraft((prev) => ({ ...prev, [fb.id]: e.target.value }))
                      }
                      placeholder="回复内容..."
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleReply(fb)}
                      disabled={savingId === fb.id}
                    >
                      回复
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
