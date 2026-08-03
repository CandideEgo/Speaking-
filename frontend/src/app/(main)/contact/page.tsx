"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { Button } from "@/components/ui/Button";
import { Textarea, Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/common/Badge";
import { FullPageSpinner } from "@/components/common/Spinner";
import { EmptyState } from "@/components/common/EmptyState";
import { Megaphone, Send, MessageSquare, CheckCircle2 } from "lucide-react";
import { relativeTime } from "@/lib/date";

interface Announcement {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

interface Feedback {
  id: string;
  category: string;
  content: string;
  contact: string | null;
  status: string;
  admin_reply: string | null;
  created_at: string;
}

const CATEGORIES = [
  { key: "suggestion", label: "建议" },
  { key: "bug", label: "Bug" },
  { key: "other", label: "其他" },
] as const;

const STATUS_LABEL: Record<string, { tone: string; text: string }> = {
  open: { tone: "brand", text: "待处理" },
  in_progress: { tone: "warning", text: "处理中" },
  resolved: { tone: "success", text: "已解决" },
};

export default function ContactPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [category, setCategory] = useState<string>("suggestion");
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [myFeedback, setMyFeedback] = useState<Feedback[]>([]);

  useEffect(() => {
    if (isLoading || !isAuthenticated) return;
    // Fetch announcements (type=announcement) + the user's own feedback in parallel.
    (async () => {
      try {
        const [notifRes, fbRes] = await Promise.all([
          api<{ items: Announcement[] }>("/api/v1/notifications?page=1&page_size=50"),
          api<Feedback[]>("/api/v1/feedback/mine").catch(() => [] as Feedback[]),
        ]);
        setAnnouncements(notifRes.items.filter((n) => n.type === "announcement"));
        setMyFeedback(fbRes);
      } catch {
        // non-fatal
      }
    })();
  }, [isAuthenticated, isLoading]);

  if (isLoading) return <FullPageSpinner />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (content.trim().length < 5) {
      toast.error("反馈内容至少 5 个字");
      return;
    }
    setSubmitting(true);
    try {
      const fb = await api<Feedback>("/api/v1/feedback", {
        method: "POST",
        body: JSON.stringify({
          category,
          content: content.trim(),
          contact: contact.trim() || null,
        }),
      });
      setMyFeedback((prev) => [fb, ...prev]);
      setContent("");
      setContact("");
      toast.success("反馈已提交，感谢！");
    } catch {
      toast.error("提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageTransition>
      <main className="container-page py-6 sm:py-12 max-w-3xl">
        <PageHeader crumb="学习" title="联系我们" />

        {/* Developer contact */}
        <Card padding={5} className="mb-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-50 text-brand-500 flex items-center justify-center shrink-0">
              <MessageSquare size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-ink">开发者联系方式</h2>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                有任何问题或建议，欢迎通过下方反馈表单留言，或直接联系开发者邮箱：
              </p>
              <p className="text-sm font-mono text-ink mt-2 select-all">
                developer@seeword.example
              </p>
            </div>
          </div>
        </Card>

        {/* Announcements */}
        <section className="mb-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink mb-3">
            <Megaphone size={16} className="text-brand-500" />
            公告
          </h2>
          {announcements.length === 0 ? (
            <EmptyState icon={Megaphone} title="暂无公告" />
          ) : (
            <div className="space-y-2">
              {announcements.map((a) => (
                <Card key={a.id} padding={4} className={a.is_read ? "" : "border-brand-200"}>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h3 className="text-sm font-semibold text-ink truncate">{a.title}</h3>
                    <span className="text-[11px] text-muted-soft shrink-0">
                      {relativeTime(a.created_at)}
                    </span>
                  </div>
                  {a.message && (
                    <p className="text-xs text-body leading-relaxed whitespace-pre-wrap">
                      {a.message}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Feedback form */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-ink mb-3">提交反馈</h2>
          <Card as="form" padding={5} className="space-y-3" onSubmit={handleSubmit}>
            <div className="flex gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer " +
                    (category === c.key
                      ? "bg-brand-500 text-white"
                      : "bg-surface-soft text-muted hover:text-ink")
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="说说你遇到的问题或建议（至少 5 个字）..."
              rows={4}
              maxLength={5000}
              required
            />
            <Input
              type="text"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="联系方式（可选，如 QQ 邮箱，方便我们回复你）"
              maxLength={200}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting} icon={submitting ? undefined : Send}>
                {submitting ? "提交中..." : "提交反馈"}
              </Button>
            </div>
          </Card>
        </section>

        {/* My feedback history */}
        {myFeedback.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-ink mb-3">我的反馈</h2>
            <div className="space-y-2">
              {myFeedback.map((f) => {
                const st = STATUS_LABEL[f.status] ?? STATUS_LABEL.open;
                return (
                  <Card key={f.id} padding={4}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Badge tone={st.tone as never}>{st.text}</Badge>
                      <span className="text-[11px] text-muted-soft">
                        {relativeTime(f.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
                      {f.content}
                    </p>
                    {f.admin_reply && (
                      <div className="mt-2.5 pt-2.5 border-t border-hairline flex items-start gap-2">
                        <CheckCircle2 size={14} className="text-success shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[11px] text-muted mb-0.5">开发者回复</p>
                          <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">
                            {f.admin_reply}
                          </p>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </PageTransition>
  );
}
