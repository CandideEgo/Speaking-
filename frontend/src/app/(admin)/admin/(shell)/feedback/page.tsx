"use client";

import { useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { Megaphone, RefreshCw, Send } from "lucide-react";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import {
  listAdminFeedback,
  updateAdminFeedback,
  broadcastAnnouncement,
  type AdminFeedback,
} from "@/lib/adminData";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Pagination } from "@/components/admin/Pagination";
import { AdminPageHeader } from "@/components/admin/ui/AdminPageHeader";
import { relativeTime } from "@/lib/date";

const PAGE_SIZE = 20;

const STATUS_TABS = [
  { key: "", label: "全部" },
  { key: "open", label: "待处理" },
  { key: "in_progress", label: "处理中" },
  { key: "resolved", label: "已解决" },
] as const;

const STATUS_BADGE: Record<string, { tone: BadgeTone; text: string }> = {
  open: { tone: "brand", text: "待处理" },
  in_progress: { tone: "amber", text: "处理中" },
  resolved: { tone: "green", text: "已解决" },
};

export default function AdminFeedbackPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");

  // Announcement form state.
  const [annTitle, setAnnTitle] = useState("");
  const [annMessage, setAnnMessage] = useState("");
  const [sending, setSending] = useState(false);
  // 二次确认（A-35）：未确认前不发送；确认框展示发送对象与内容预览。
  const [pendingBroadcast, setPendingBroadcast] = useState<{
    title: string;
    message: string;
  } | null>(null);

  // Reply state per feedback row.
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const {
    items: feedback,
    setItems: setFeedback,
    page,
    setPage,
    hasMore,
    total,
    loading,
    error,
    reload,
  } = usePaginatedList<AdminFeedback>({
    fetcher: (pg) => listAdminFeedback(statusFilter || undefined, pg, PAGE_SIZE),
    mode: "replace",
    filters: [statusFilter],
  });

  function handleBroadcast(e: React.FormEvent) {
    e.preventDefault();
    if (!annTitle.trim() || !annMessage.trim()) {
      toast.error("标题和内容不能为空");
      return;
    }
    setPendingBroadcast({ title: annTitle.trim(), message: annMessage.trim() });
  }

  async function doBroadcast() {
    if (!pendingBroadcast || sending) return;
    setSending(true);
    try {
      const res = await broadcastAnnouncement({
        title: pendingBroadcast.title,
        message: pendingBroadcast.message,
      });
      // 后端已改为「异步入队」：notified_count 是入队人数，不代表已逐条写入。
      toast.success(`已加入发送队列（约 ${res.notified_count} 位用户）`);
      setPendingBroadcast(null);
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
      <AdminPageHeader title="反馈与公告" description="查看用户反馈、回复、向全体用户发送公告" />

      {/* Broadcast announcement */}
      <Card as="form" padding={5} className="space-y-3" onSubmit={handleBroadcast}>
        <h2 className="flex items-center gap-2 text-copy font-semibold">
          <Megaphone size={16} className="text-brand-500" />
          发送公告
        </h2>
        <Input
          type="text"
          value={annTitle}
          onChange={(e) => setAnnTitle(e.target.value)}
          placeholder="公告标题"
          aria-label="公告标题"
          maxLength={200}
          required
        />
        <Textarea
          value={annMessage}
          onChange={(e) => setAnnMessage(e.target.value)}
          placeholder="公告内容（将通知所有用户）"
          aria-label="公告内容"
          rows={3}
          maxLength={2000}
          required
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={sending} icon={Send}>
            发送公告
          </Button>
        </div>
      </Card>

      {/* Feedback list */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="text-copy font-semibold">用户反馈</h2>
          <span className="text-meta text-muted">
            {loading && total === 0 ? "加载中…" : `共 ${total} 条`}
          </span>
          <div className="flex gap-1 ml-auto">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatusFilter(t.key)}
                aria-pressed={statusFilter === t.key}
                className={
                  "px-2.5 py-1 rounded-md text-meta font-medium transition-colors cursor-pointer " +
                  (statusFilter === t.key
                    ? "bg-action-primary text-on-primary"
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
            <span role="status" className="text-muted">
              <RefreshCw className="animate-spin" size={20} aria-hidden />
              <span className="sr-only">加载反馈中…</span>
            </span>
          </div>
        ) : error ? (
          <EmptyState
            icon={Megaphone}
            title="加载反馈失败"
            description={error}
            action={
              <Button onClick={reload} variant="secondary" size="sm" icon={RefreshCw}>
                重试
              </Button>
            }
          />
        ) : feedback.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={statusFilter ? "当前筛选下没有反馈" : "暂无反馈"}
            description={statusFilter ? "换一个状态筛选，或清除筛选查看全部反馈。" : undefined}
            action={
              statusFilter ? (
                <Button onClick={() => setStatusFilter("")} variant="secondary" size="sm">
                  清除筛选
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-2">
            {feedback.map((fb) => {
              const st = STATUS_BADGE[fb.status] ?? STATUS_BADGE.open;
              return (
                <Card key={fb.id} padding={4} className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge tone={st.tone}>{st.text}</Badge>
                      <span className="text-meta text-muted">{fb.user_name ?? "匿名用户"}</span>
                      <span className="text-caption text-muted-soft">
                        {relativeTime(fb.created_at)}
                      </span>
                    </div>
                    <select
                      value={fb.status}
                      onChange={(e) => handleStatusChange(fb, e.target.value)}
                      disabled={savingId === fb.id}
                      aria-label={`反馈 ${fb.id.slice(0, 8)} 的状态`}
                      className="text-meta rounded-md border border-hairline bg-canvas px-2 py-1 text-ink"
                    >
                      <option value="open">待处理</option>
                      <option value="in_progress">处理中</option>
                      <option value="resolved">已解决</option>
                    </select>
                  </div>
                  <p className="text-copy text-ink leading-relaxed whitespace-pre-wrap">
                    {fb.content}
                  </p>
                  {fb.contact && <p className="text-meta text-muted">联系方式：{fb.contact}</p>}
                  {fb.admin_reply && (
                    <div className="pt-2 border-t border-hairline">
                      <p className="text-caption text-muted mb-0.5">已回复</p>
                      <p className="text-meta text-ink leading-relaxed whitespace-pre-wrap">
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
                      aria-label={`回复反馈 ${fb.id.slice(0, 8)}`}
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

        {!loading && !error && feedback.length > 0 && (
          <Pagination
            page={page}
            hasMore={hasMore}
            total={total}
            pageSize={PAGE_SIZE}
            loading={loading}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        )}
      </div>

      {/* 公告二次确认（A-35）：点击「发送公告」先确认发送对象与内容预览。 */}
      <ConfirmDialog
        open={!!pendingBroadcast}
        title="发送公告"
        confirmLabel="确认发送"
        busy={sending}
        message={
          pendingBroadcast
            ? `将通知全部用户。标题：「${pendingBroadcast.title}」；内容预览：「${
                pendingBroadcast.message.length > 80
                  ? `${pendingBroadcast.message.slice(0, 80)}…`
                  : pendingBroadcast.message
              }」`
            : ""
        }
        onClose={() => {
          if (!sending) setPendingBroadcast(null);
        }}
        onConfirm={doBroadcast}
      />
    </div>
  );
}
