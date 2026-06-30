"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Flag,
  Loader2,
  MessageSquare,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import { FilterPills } from "@/components/admin/FilterPills";
import { SectionCard } from "@/components/admin/SectionCard";
import { Pagination } from "@/components/admin/Pagination";
import { Badge, type BadgeTone } from "@/components/common/Badge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type {
  AdminComment,
  AdminPost,
  CommentReport,
  ReportStatus,
} from "@/types";
import {
  deleteComment,
  deletePost,
  listComments,
  listPosts,
  listReports,
  resolveReport,
} from "@/lib/adminData";

const REPORT_FILTERS = [
  { key: "", label: "全部" },
  { key: "pending", label: "待处理" },
  { key: "reviewed", label: "已处理" },
  { key: "dismissed", label: "已驳回" },
];

const STATUS_LABEL: Record<ReportStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "待处理", tone: "amber" },
  reviewed: { label: "已处理", tone: "green" },
  dismissed: { label: "已驳回", tone: "neutral" },
};

const POST_TYPE_LABEL: Record<string, string> = {
  text: "文本",
  progress_share: "学习打卡",
  vocabulary_share: "词汇分享",
  speaking_share: "口语分享",
  video_share: "视频分享",
};

export default function AdminCommunityPage() {
  return (
    <div className="space-y-6">
      <ReportQueue />
      <PostsManager />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report queue
// ---------------------------------------------------------------------------

function ReportQueue() {
  const [reports, setReports] = useState<CommentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // Confirmation state for resolve actions (replaces native window.confirm).
  const [resolvePrompt, setResolvePrompt] = useState<{
    report: CommentReport;
    action: "remove" | "dismiss";
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listReports({
        page,
        page_size: 20,
        status: statusFilter,
      });
      setReports(data.items);
      setHasMore(data.has_more);
    } catch {
      toast.error("加载举报列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  async function handleResolve(
    report: CommentReport,
    action: "remove" | "dismiss",
  ) {
    try {
      await resolveReport(report.id, action);
      toast.success(action === "remove" ? "已删除评论" : "已驳回举报");
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  }

  return (
    <SectionCard
      title="举报队列"
      description="用户举报的评论，审核后可删除评论或驳回举报。"
      actions={
        <button
          onClick={load}
          disabled={loading}
          className="btn-secondary !py-2 !px-3 text-xs"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      }
    >
      <FilterPills
        options={REPORT_FILTERS}
        value={statusFilter}
        onChange={setStatusFilter}
        className="mb-4"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-muted-foreground uppercase tracking-wider">
              <th className="pb-2 font-medium">举报原因</th>
              <th className="pb-2 font-medium">评论内容</th>
              <th className="pb-2 font-medium">作者</th>
              <th className="pb-2 font-medium">举报人</th>
              <th className="pb-2 font-medium">状态</th>
              <th className="pb-2 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {reports.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  {loading ? "加载中..." : "暂无举报"}
                </td>
              </tr>
            ) : (
              reports.flatMap((r) => [
                <tr
                  key={r.id}
                  className="text-xs align-top cursor-pointer hover:bg-surface-soft/40"
                  onClick={() =>
                    setExpandedId(expandedId === r.id ? null : r.id)
                  }
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-1.5 text-ink">
                      {expandedId === r.id ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronRight size={12} />
                      )}
                      <Flag size={12} className="text-amber-500" />
                      <span className="truncate max-w-[120px]">{r.reason}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground truncate max-w-[200px]">
                    {r.comment_content}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {r.comment_author_name}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {r.reporter_name}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={STATUS_LABEL[r.status].tone}>
                      {STATUS_LABEL[r.status].label}
                    </Badge>
                  </td>
                  <td
                    className="py-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {r.status === "pending" ? (
                      <div className="inline-flex gap-1">
                        <button
                          onClick={() =>
                            setResolvePrompt({ report: r, action: "remove" })
                          }
                          className="inline-flex items-center gap-1 rounded-sm bg-red-50 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100"
                        >
                          <Check size={11} /> 通过
                        </button>
                        <button
                          onClick={() =>
                            setResolvePrompt({ report: r, action: "dismiss" })
                          }
                          className="inline-flex items-center gap-1 rounded-sm bg-surface-soft px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-ink"
                        >
                          <X size={11} /> 驳回
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-soft">
                        已处理
                      </span>
                    )}
                  </td>
                </tr>,
                expandedId === r.id && (
                  <tr key={`${r.id}-detail`} className="bg-surface-soft/40">
                    <td colSpan={6} className="p-4">
                      <div className="grid gap-4 lg:grid-cols-2">
                        <div>
                          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                            被举报评论
                          </h4>
                          <p className="text-sm text-ink bg-canvas border border-hairline rounded-sm p-3">
                            {r.comment_content}
                          </p>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            评论作者：{r.comment_author_name} · 举报时间：
                            {new Date(r.created_at).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                            所属帖子
                          </h4>
                          <p className="text-sm text-muted-foreground bg-canvas border border-hairline rounded-sm p-3">
                            {r.post_snippet}
                          </p>
                        </div>
                      </div>
                    </td>
                  </tr>
                ),
              ])
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        hasMore={hasMore}
        loading={loading}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />

      <ConfirmDialog
        open={!!resolvePrompt}
        tone={resolvePrompt?.action === "remove" ? "danger" : "default"}
        title={resolvePrompt?.action === "remove" ? "通过举报" : "驳回举报"}
        confirmLabel={
          resolvePrompt?.action === "remove" ? "通过并删除" : "驳回"
        }
        message={
          resolvePrompt?.action === "remove"
            ? "确认通过举报并删除该评论？"
            : "确认驳回该举报？"
        }
        onClose={() => setResolvePrompt(null)}
        onConfirm={() => {
          const p = resolvePrompt;
          setResolvePrompt(null);
          if (p) handleResolve(p.report, p.action);
        }}
      />
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// Posts manager
// ---------------------------------------------------------------------------

function PostsManager() {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [postComments, setPostComments] = useState<
    Record<string, AdminComment[]>
  >({});
  const [loadingComments, setLoadingComments] = useState<string | null>(null);
  // Delete-confirmation state (replaces native window.confirm).
  const [deletePostTarget, setDeletePostTarget] = useState<AdminPost | null>(
    null,
  );
  const [deleteCommentTarget, setDeleteCommentTarget] = useState<{
    postId: string;
    comment: AdminComment;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPosts({ page: 1, page_size: 20, keyword });
      setPosts(data.items);
    } catch {
      toast.error("加载帖子失败");
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleExpand(post: AdminPost) {
    if (expandedId === post.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(post.id);
    if (!postComments[post.id]) {
      setLoadingComments(post.id);
      try {
        const cs = await listComments(post.id);
        setPostComments((prev) => ({ ...prev, [post.id]: cs }));
      } catch {
        toast.error("加载评论失败");
      } finally {
        setLoadingComments(null);
      }
    }
  }

  async function handleDeletePost(post: AdminPost) {
    try {
      await deletePost(post.id);
      toast.success("帖子已删除");
      setPosts((prev) => prev.filter((p) => p.id !== post.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  }

  async function handleDeleteComment(postId: string, comment: AdminComment) {
    try {
      await deleteComment(comment.id);
      toast.success("评论已删除");
      setPostComments((prev) => ({
        ...prev,
        [postId]: (prev[postId] || []).filter((c) => c.id !== comment.id),
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    }
  }

  return (
    <SectionCard
      title="帖子管理"
      description="强制删除违规帖子及其评论。"
      actions={
        <button
          onClick={load}
          disabled={loading}
          className="btn-secondary !py-2 !px-3 text-xs"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          刷新
        </button>
      }
    >
      <div className="mb-4 flex justify-end">
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") load();
          }}
          placeholder="搜索内容/作者..."
          className="input-field !py-1.5 max-w-xs"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-muted-foreground uppercase tracking-wider">
              <th className="pb-2 font-medium">内容</th>
              <th className="pb-2 font-medium">作者</th>
              <th className="pb-2 font-medium">类型</th>
              <th className="pb-2 font-medium">互动</th>
              <th className="pb-2 font-medium">举报</th>
              <th className="pb-2 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {posts.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  {loading ? "加载中..." : "暂无帖子"}
                </td>
              </tr>
            ) : (
              posts.flatMap((p) => [
                <tr key={p.id} className="text-xs align-top">
                  <td className="py-3 pr-4">
                    <button
                      onClick={() => toggleExpand(p)}
                      className="flex items-start gap-1.5 text-left"
                    >
                      {expandedId === p.id ? (
                        <ChevronDown
                          size={12}
                          className="mt-0.5 text-muted-foreground"
                        />
                      ) : (
                        <ChevronRight
                          size={12}
                          className="mt-0.5 text-muted-foreground"
                        />
                      )}
                      <span className="text-ink truncate max-w-[280px]">
                        {p.is_pinned && (
                          <Badge tone="amber" className="mr-1 px-1.5">
                            置顶
                          </Badge>
                        )}
                        {p.content}
                      </span>
                    </button>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {p.user_name}
                    <div className="text-[10px] text-muted-soft">
                      {p.author_email}
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {POST_TYPE_LABEL[p.post_type] || p.post_type}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <span>❤ {p.like_count}</span>
                      <span className="inline-flex items-center gap-0.5">
                        <MessageSquare size={11} /> {p.comment_count}
                      </span>
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    {p.report_count > 0 ? (
                      <Badge tone="red">{p.report_count}</Badge>
                    ) : (
                      <span className="text-muted-soft">0</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => setDeletePostTarget(p)}
                      className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700"
                    >
                      <Trash2 size={11} /> 删除
                    </button>
                  </td>
                </tr>,
                expandedId === p.id && (
                  <tr key={`${p.id}-detail`} className="bg-surface-soft/40">
                    <td colSpan={6} className="p-4">
                      <p className="text-sm text-ink mb-3">{p.content}</p>
                      <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
                        评论 ({postComments[p.id]?.length ?? 0})
                      </h4>
                      {loadingComments === p.id ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 size={12} className="animate-spin" />{" "}
                          加载中...
                        </div>
                      ) : (postComments[p.id] || []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          暂无评论
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {(postComments[p.id] || []).map((c) => (
                            <li
                              key={c.id}
                              className="flex items-start justify-between gap-3 bg-canvas border border-hairline rounded-sm p-2.5"
                            >
                              <div className="min-w-0">
                                <p className="text-xs text-ink">{c.content}</p>
                                <p className="mt-0.5 text-[10px] text-muted-soft">
                                  {c.user_name} ·{" "}
                                  {new Date(c.created_at).toLocaleString()}
                                </p>
                              </div>
                              <button
                                onClick={() =>
                                  setDeleteCommentTarget({
                                    postId: p.id,
                                    comment: c,
                                  })
                                }
                                className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700 flex-shrink-0"
                              >
                                <Trash2 size={11} /> 删除
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                ),
              ])
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={!!deletePostTarget}
        tone="danger"
        title="删除帖子"
        confirmLabel="确认删除"
        message="确认强制删除该帖子及其所有评论？"
        onClose={() => setDeletePostTarget(null)}
        onConfirm={() => {
          const t = deletePostTarget;
          setDeletePostTarget(null);
          if (t) handleDeletePost(t);
        }}
      />

      <ConfirmDialog
        open={!!deleteCommentTarget}
        tone="danger"
        title="删除评论"
        confirmLabel="确认删除"
        message="确认删除该评论？"
        onClose={() => setDeleteCommentTarget(null)}
        onConfirm={() => {
          const t = deleteCommentTarget;
          setDeleteCommentTarget(null);
          if (t) handleDeleteComment(t.postId, t.comment);
        }}
      />
    </SectionCard>
  );
}
