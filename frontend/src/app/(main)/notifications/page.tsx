"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, Check, ChevronRight, Settings, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageTransition } from "@/components/common/PageTransition";
import { ErrorState } from "@/components/common/ErrorState";
import { FullPageSpinner, InlineSpinner } from "@/components/common/Spinner";
import { TabPills } from "@/components/ui/TabPills";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { useNotificationStore } from "@/stores/notificationStore";
import { cn } from "@/lib/utils";
import type { Paginated } from "@/types";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  related_url: string | null;
  created_at: string;
}

/**
 * 筛选 tab 覆盖后端 NotificationType 里所有「用户可能收到」的类型：
 * system / video_ready / pro_expiring / vocabulary_reminder / streak_warning /
 * achievement_unlocked。comment_reply / social_follow / post_liked 是 ADR-0012
 * 砍社区后的休眠枚举，quality_alert / announcement 只由管理端产生，均归入「全部」。
 */
const TYPE_TABS: { key: string; label: string; value: string | null }[] = [
  { key: "all", label: "全部", value: null },
  { key: "video", label: "视频", value: "video_ready" },
  { key: "pro", label: "会员", value: "pro_expiring" },
  { key: "vocab", label: "词汇", value: "vocabulary_reminder" },
  { key: "system", label: "系统", value: "system" },
];

const TYPE_LABELS: Record<string, string> = {
  system: "系统",
  video_ready: "视频就绪",
  pro_expiring: "会员",
  vocabulary_reminder: "词汇提醒",
  comment_reply: "互动",
  social_follow: "互动",
  post_liked: "互动",
  quality_alert: "质量提醒",
  announcement: "公告",
};

/** 通知设置预览（与 profile→设置里的 NotificationPreferences 同一组开关：
 *  推送总开关 + 词汇复习提醒，后端只认这两个 key）。 */
const PREF_PREVIEW: { label: string; key: string }[] = [
  { label: "推送通知", key: "push_notifications" },
  { label: "词汇复习提醒", key: "vocabulary_reminder" },
];

function formatNotifyTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  const hh = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (t >= todayStart) return `今天 ${hh}`;
  if (t >= todayStart - 86_400_000) return `昨天 ${hh}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}`;
}

/**
 * 通知中心（Phase 1 D6 → stage-3 notifications.html 对齐）。
 *
 * 设计口径：页头右侧橙色主操作「全部已读（N）」、类型筛选带计数、未读用
 * 橙点+浅橙底标出并写「未读/已读」、每张卡有类型 tag、主栏「最近通知」分区、
 * 底部「通知设置」预览块、右栏未读统计与「什么时候会收到」。
 */
export default function NotificationsPage() {
  const { isAuthenticated, isLoading } = useRequireAuth();
  const [type, setType] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [markingAll, setMarkingAll] = useState(false);
  // 设置预览要显示真实开关状态，而不是一律打勾。
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);

  const fetcher = useCallback(
    (page: number) => {
      const params = new URLSearchParams({ page: String(page), page_size: "20" });
      if (type) params.set("type", type);
      return api<Paginated<Notification>>(`/api/v1/notifications?${params}`);
    },
    [type]
  );

  const { items, setItems, loading, error, total, hasMore, loaderRef, reload } =
    usePaginatedList<Notification>({
      fetcher,
      mode: "append",
      filters: [type],
      enabled: isAuthenticated && !isLoading,
    });

  /** 页头未读总数 + 各筛选 tab 计数。
   *  后端没有批量计数接口：如果按 tab 各拉一次 total，一次进入要打 1+7 个请求，
   *  在页面间来回切换会被 30/min 限流。这里用 1 个未读计数 + 1 个 page_size=100
   *  的列表请求，在客户端按 type 分组计数；超过 100 条时 tab 计数封顶在 100
   *  （当前通知量远小于此；页头「全部」仍用接口的 total，保持准确）。 */
  const refreshMeta = useCallback(async () => {
    const [unreadRes, allRes] = await Promise.all([
      api<{ count: number }>("/api/v1/notifications/unread-count").catch(() => null),
      api<Paginated<Notification>>("/api/v1/notifications?page=1&page_size=100").catch(() => null),
    ]);
    const next: Record<string, number> = { all: allRes?.total ?? 0 };
    for (const item of allRes?.items ?? []) {
      if (item.type) next[item.type] = (next[item.type] ?? 0) + 1;
    }
    setCounts(next);
    if (unreadRes) {
      setUnread(unreadRes.count);
      useNotificationStore.getState().setUnread(unreadRes.count);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    void refreshMeta();
  }, [isAuthenticated, isLoading, refreshMeta]);

  useEffect(() => {
    if (!isAuthenticated || isLoading) return;
    let cancelled = false;
    api<Record<string, boolean>>("/api/v1/notifications/preferences")
      .then((data) => {
        if (!cancelled) setPrefs(data);
      })
      .catch(() => {
        // 读不到偏好时预览不显示开关状态，而不是替用户默认「已开启」。
        if (!cancelled) setPrefs({});
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading]);

  async function markRead(notification: Notification) {
    if (notification.is_read) return;
    try {
      await api(`/api/v1/notifications/${notification.id}/read`, { method: "PATCH" });
      setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n)));
      void refreshMeta();
    } catch {
      toast.error("操作失败");
    }
  }

  async function markAllRead() {
    setMarkingAll(true);
    try {
      await api(`/api/v1/notifications/read-all`, { method: "PATCH" });
      setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success("已全部标记为已读");
      reload();
      void refreshMeta();
    } catch {
      toast.error("操作失败");
    } finally {
      setMarkingAll(false);
    }
  }

  const visibleItems = useMemo(
    () =>
      TYPE_TABS.map((t) => ({
        key: t.key,
        label: (
          <span className="inline-flex items-center gap-1.5">
            {t.label}
            <span className="text-caption font-medium text-muted">
              {t.value ? (counts[t.value] ?? 0) : (counts.all ?? 0)}
            </span>
          </span>
        ),
      })),
    [counts]
  );

  const activeTabKey = TYPE_TABS.find((t) => t.value === type)?.key ?? "all";
  const filteredUnread = items.filter((n) => !n.is_read).length;
  const sectionUnread = type === null ? unread : filteredUnread;
  const learningReminderCount = counts.vocabulary_reminder ?? 0;

  if (isLoading) return <FullPageSpinner />;

  return (
    <PageTransition>
      <div className="user-page">
        <PageHeader
          crumb="我的"
          title="通知"
          description="查看系统消息、视频就绪与词汇复习提醒。"
          actions={
            <Button
              variant="primary"
              icon={Check}
              disabled={unread === 0 || markingAll}
              onClick={() => void markAllRead()}
            >
              {unread === 0 ? "全部已读" : `全部已读（${unread}）`}
            </Button>
          }
        />

        {/* 计数只出现在 tab 与列表小标题里，不再在工具条右侧重复一遍。 */}
        <div className="mt-6">
          {/* 手机上五个筛选一排放不下：整条横向滚动，而不是让胶囊容器折成两行。 */}
          <div className="overflow-x-auto">
            <TabPills
              className="flex-nowrap"
              size="sm"
              tabs={visibleItems}
              activeKey={activeTabKey}
              onChange={(key) => {
                const tab = TYPE_TABS.find((t) => t.key === key);
                setType(tab?.value ?? null);
              }}
            />
          </div>
        </div>

        <div className="user-page-layout has-aside">
          <div className="user-page-main">
            <section aria-labelledby="n-list-title">
              <div className="user-sec-head">
                <h2 className="user-sec-title" id="n-list-title">
                  最近通知
                </h2>
                <span className="user-sec-sub">
                  {type === null ? (counts.all ?? 0) : total} 条 · 未读 {sectionUnread} 条
                </span>
              </div>

              {loading && items.length === 0 ? (
                <InlineSpinner className="py-12" />
              ) : error && items.length === 0 ? (
                <ErrorState title={error} onRetry={reload} className="py-12" />
              ) : items.length === 0 && (counts.all ?? 0) === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-hairline-strong bg-surface-soft p-5">
                  <p className="text-copy font-semibold text-ink">暂无通知</p>
                  <p className="mt-1 max-w-[44ch] text-copy leading-relaxed text-body">
                    新视频就绪和自愿开启的词汇复习提醒会出现在这里；也可以先去首页挑一段开始学。
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <LinkButton href="/" variant="outline" size="sm">
                      去首页挑一段
                    </LinkButton>
                    <LinkButton href="/vocabulary" variant="text" size="sm" iconRight>
                      看词库
                    </LinkButton>
                  </div>
                </div>
              ) : items.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-hairline-strong bg-surface-soft p-5">
                  <p className="text-copy font-semibold text-ink">这一类还没有通知</p>
                  <p className="mt-1 max-w-[44ch] text-copy leading-relaxed text-body">
                    当前筛选下没有匹配的通知；全部通知里共有 {counts.all ?? 0} 条。
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button variant="outline" size="sm" onClick={() => setType(null)}>
                      看全部通知
                    </Button>
                    <LinkButton href="/" variant="text" size="sm" iconRight>
                      去首页挑一段
                    </LinkButton>
                  </div>
                </div>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {items.map((n) => (
                    <li key={n.id}>
                      <article
                        className={cn(
                          "relative flex items-start gap-3 rounded-lg border p-4",
                          n.is_read ? "border-hairline bg-canvas" : "border-brand-200 bg-brand-50"
                        )}
                      >
                        {!n.is_read && (
                          <span
                            aria-hidden
                            className="absolute bottom-3 left-0 top-3 w-0.5 rounded-pill bg-brand-500"
                          />
                        )}
                        <span
                          aria-hidden
                          className={cn(
                            "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                            n.is_read ? "bg-hairline-strong" : "bg-brand-500"
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                            <h3 className="min-w-0 text-copy font-semibold leading-snug text-ink">
                              {n.title}
                            </h3>
                            <span className="shrink-0 text-caption text-body">
                              {formatNotifyTime(n.created_at)}
                            </span>
                          </div>
                          {n.message && (
                            <p className="mt-1 whitespace-pre-wrap text-copy leading-relaxed text-body">
                              {n.message}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <span className="inline-flex h-6 items-center gap-1 rounded-sm border border-hairline px-2 text-caption text-body">
                              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                              {TYPE_LABELS[n.type] ?? "系统"}
                            </span>
                            <span className="text-caption text-body">
                              {n.is_read ? "已读" : "未读"}
                            </span>
                            {n.related_url && (
                              <Link
                                href={n.related_url}
                                onClick={() => void markRead(n)}
                                className="inline-flex items-center gap-1 text-caption font-semibold text-body transition-colors hover:text-brand-700"
                              >
                                查看详情
                                <ChevronRight size={13} />
                              </Link>
                            )}
                            {!n.is_read && (
                              <button
                                type="button"
                                onClick={() => void markRead(n)}
                                className="inline-flex items-center gap-1 text-caption text-body transition-colors hover:text-ink"
                              >
                                <Check size={12} />
                                标为已读
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              )}

              {hasMore && (
                <div ref={loaderRef} className="flex justify-center py-6">
                  <span className="text-meta text-muted">加载更多…</span>
                </div>
              )}
            </section>

            {/* 通知设置预览（开关在 profile→设置 的 NotificationPreferences） */}
            <section aria-labelledby="n-pref-title">
              <div className="user-sec-head">
                <h2 className="user-sec-title flex items-center gap-2" id="n-pref-title">
                  <Settings size={17} className="text-muted" />
                  通知设置
                </h2>
              </div>
              <div className="mt-4 flex flex-wrap items-start justify-between gap-4 rounded-lg border border-hairline bg-surface-soft p-5">
                <div className="min-w-0">
                  <p className="text-copy font-semibold text-ink">哪些通知要推给我</p>
                  <p className="mt-1 max-w-[46ch] text-meta leading-relaxed text-body">
                    两项开关都在「我的 → 设置 → 通知设置」里保存；关掉总开关就不再推送。
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {PREF_PREVIEW.map(({ label, key }) => {
                      const on = prefs?.[key];
                      return (
                        <span
                          key={key}
                          className="inline-flex h-8 items-center gap-1.5 rounded-pill border border-hairline-strong bg-canvas px-3 text-meta text-body"
                        >
                          {on === false ? (
                            <X size={12} className="text-muted" />
                          ) : on === true ? (
                            <Check size={12} className="text-success-text" />
                          ) : null}
                          {label}
                          {on !== undefined && (
                            <span className="text-caption text-muted">
                              {on ? "已开启" : "已关闭"}
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <LinkButton
                  href="/profile?tab=settings"
                  variant="outline"
                  icon={Settings}
                  className="shrink-0"
                >
                  去「我的」设置
                </LinkButton>
              </div>
            </section>
          </div>

          <aside className="user-page-aside" aria-label="通知说明">
            <section className="user-aside-sec">
              <h2 className="user-aside-title">未读统计</h2>
              <div className="user-kv">
                <div className="user-kv-row">
                  <span className="user-kv-key">全部</span>
                  <span className="user-kv-val">{counts.all ?? 0} 条</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">未读</span>
                  <span className="user-kv-val">{unread} 条</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">系统</span>
                  <span className="user-kv-val">{counts.system ?? 0} 条</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">学习提醒</span>
                  <span className="user-kv-val">{learningReminderCount} 条</span>
                </div>
                <div className="user-kv-row">
                  <span className="user-kv-key">其他</span>
                  <span className="user-kv-val">
                    {Math.max((counts.all ?? 0) - (counts.system ?? 0) - learningReminderCount, 0)}{" "}
                    条
                  </span>
                </div>
              </div>
            </section>
            <section className="user-aside-sec">
              <h2 className="user-aside-title">什么时候会收到</h2>
              <ul className="flex flex-col gap-2 text-meta text-body">
                <li className="flex items-baseline justify-between gap-3">
                  <span>视频处理完成</span>
                  <b className="font-semibold text-ink">立即</b>
                </li>
                <li className="flex items-baseline justify-between gap-3">
                  <span>词汇复习提醒</span>
                  <b className="font-semibold text-ink">每天 09:00</b>
                </li>
                <li className="flex items-baseline justify-between gap-3">
                  <span>连续学习提醒</span>
                  <b className="font-semibold text-ink">当天未学时</b>
                </li>
                <li className="flex items-baseline justify-between gap-3">
                  <span>系统维护</span>
                  <b className="font-semibold text-ink">提前 24 小时</b>
                </li>
              </ul>
            </section>
            <p className="flex items-start gap-1.5 text-caption leading-relaxed text-muted">
              <Bell size={14} className="mt-0.5 shrink-0" />
              <span>通知设置与推送偏好由「我的 → 设置」管理；这里只做预览。</span>
            </p>
          </aside>
        </div>
      </div>
    </PageTransition>
  );
}
