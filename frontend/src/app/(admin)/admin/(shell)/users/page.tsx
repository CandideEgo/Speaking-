"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import {
  Activity,
  Ban,
  ChevronDown,
  Crown,
  Flame,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldOff,
  UserCog,
  Users,
  UserX,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  AdminPageHeader,
  AdminSearchInput,
  AdminDropdown,
  AdminConfirmDialog,
  AdminSkeleton,
} from "@/components/admin/ui";
import { StatChip } from "@/components/admin/StatChip";
import { FilterPills } from "@/components/admin/FilterPills";
import { Pagination } from "@/components/admin/Pagination";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import type { AdminStats, AdminUser } from "@/types";
import { getAdminStats, listUsers, promoteUser, setUserBanned, setUserPlan } from "@/lib/adminData";

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

const ROLE_FILTERS = [
  { key: "", label: "全部角色" },
  { key: "admin", label: "管理员" },
  { key: "user", label: "普通用户" },
];

const PLAN_FILTERS = [
  { key: "", label: "全部方案" },
  { key: "pro", label: "Pro 会员" },
  { key: "free", label: "Free" },
  { key: "expired", label: "已过期" },
];

// ---------------------------------------------------------------------------
// Stat chip (prototype 28 .stat-chip)
// ---------------------------------------------------------------------------

/** Pro 会员是否已过期（plan 仍为 pro 但到期时间已过）。 */
function isExpiredPro(u: AdminUser): boolean {
  return (
    u.plan === "pro" && !!u.plan_expires_at && new Date(u.plan_expires_at).getTime() < Date.now()
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminUsersPage() {
  const [roleFilter, setRoleFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [confirmPrompt, setConfirmPrompt] = useState<{
    title: string;
    description: string;
    danger: boolean;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(() => undefined);
  }, []);

  const {
    items: users,
    setItems: setUsers,
    page,
    setPage,
    hasMore,
    total,
    loading,
    reload,
  } = usePaginatedList<AdminUser>({
    fetcher: (pg) =>
      listUsers({
        page: pg,
        page_size: 20,
        role: roleFilter,
        plan: planFilter,
        keyword,
      }),
    mode: "replace",
    filters: [roleFilter, planFilter, keyword],
  });

  const patchUser = useCallback(
    (id: string, patch: Partial<AdminUser>) => {
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    },
    [setUsers]
  );

  // --- Actions ---

  async function doBan(user: AdminUser) {
    const next = !user.is_banned;
    try {
      await setUserBanned(user.id, next);
      patchUser(user.id, { is_banned: next });
      toast.success(next ? "已封禁" : "已解封");
    } catch (err) {
      toastApiError(err);
    }
  }

  async function doPromote(user: AdminUser) {
    const next = (user.role || "user") === "admin" ? "user" : "admin";
    try {
      await promoteUser(user.id, next);
      patchUser(user.id, { role: next });
      toast.success("已更新角色");
    } catch (err) {
      toastApiError(err);
    }
  }

  async function handleGrantPro(user: AdminUser, days: number) {
    try {
      const updated = await setUserPlan(user.id, "pro", days);
      patchUser(user.id, updated);
      toast.success(`已赠送 Pro ${days} 天`);
    } catch (err) {
      toastApiError(err);
    }
  }

  function handleRevokePro(user: AdminUser) {
    setConfirmPrompt({
      title: "撤销 Pro 会员",
      description: `确认撤销「${user.name || user.phone}」的 Pro 会员？此操作不可撤销。`,
      danger: true,
      confirmLabel: "确认撤销",
      onConfirm: async () => {
        try {
          const updated = await setUserPlan(user.id, "free", 0);
          patchUser(user.id, updated);
          toast.success("已撤销 Pro");
        } catch (err) {
          toastApiError(err);
        }
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        title="用户管理"
        description={`共 ${total} 位用户`}
        actions={
          <Button
            onClick={reload}
            disabled={loading}
            variant="secondary"
            size="sm"
            icon={RefreshCw}
            className={loading ? "[&_svg]:animate-spin" : ""}
          >
            刷新
          </Button>
        }
      />

      {/* Stat strip (prototype 28) */}
      <div className="flex flex-wrap gap-2.5">
        <StatChip
          icon={Users}
          value={stats ? stats.total_users.toLocaleString() : "—"}
          label="总用户"
          iconClass="bg-brand-50 text-brand-600"
        />
        <StatChip
          icon={Crown}
          value={stats ? stats.pro_users.toLocaleString() : "—"}
          label="Pro 会员"
          iconClass="bg-warning-soft text-warning"
        />
        <StatChip
          icon={Activity}
          value={stats ? stats.active_users_today.toLocaleString() : "—"}
          label="今日活跃"
          iconClass="bg-success-soft text-success"
        />
        <StatChip
          icon={Flame}
          value={stats ? stats.pro_expired_count.toLocaleString() : "—"}
          label="已过期"
          iconClass="bg-error/10 text-error"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <FilterPills options={ROLE_FILTERS} value={roleFilter} onChange={setRoleFilter} />
        <div className="h-5 w-px bg-hairline" />
        <FilterPills options={PLAN_FILTERS} value={planFilter} onChange={setPlanFilter} />
        <AdminSearchInput
          value={keyword}
          onChange={setKeyword}
          placeholder="搜索姓名 / 手机号..."
          className="ml-auto w-64"
        />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-hairline bg-canvas overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline bg-surface-soft/50">
              {[
                ["用户", "text-left"],
                ["角色", "text-left"],
                ["方案", "text-left"],
                ["到期", "text-left"],
                ["学习", "text-left"],
                ["状态", "text-left"],
                ["注册时间", "text-left"],
                ["操作", "text-right"],
              ].map(([h, align]) => (
                <th
                  key={h}
                  className={cn(
                    "px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted",
                    align
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {loading ? (
              <AdminSkeleton.TableRows rows={5} cols={8} />
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-muted">
                  暂无用户
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isExpanded = expandedId === u.id;
                return (
                  <UserRow
                    key={u.id}
                    user={u}
                    isExpanded={isExpanded}
                    onToggleExpand={() => setExpandedId(isExpanded ? null : u.id)}
                    onBan={() => {
                      if (!u.is_banned) {
                        setConfirmPrompt({
                          title: "封禁用户",
                          description: `确认封禁用户「${u.name || u.phone}」？封禁后该用户将无法登录。`,
                          danger: true,
                          confirmLabel: "确认封禁",
                          onConfirm: () => doBan(u),
                        });
                      } else {
                        doBan(u);
                      }
                    }}
                    onPromote={() => {
                      const next = (u.role || "user") === "admin" ? "user" : "admin";
                      const verb = next === "admin" ? "提升为管理员" : "降级为普通用户";
                      setConfirmPrompt({
                        title: verb,
                        description: `确认将「${u.name || u.phone}」${verb}？`,
                        danger: false,
                        confirmLabel: "确认",
                        onConfirm: () => doPromote(u),
                      });
                    }}
                    onGrantPro={(days) => handleGrantPro(u, days)}
                    onRevokePro={() => handleRevokePro(u)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pagination
        page={page}
        hasMore={hasMore}
        loading={loading}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />

      {/* Confirm Dialog */}
      <AdminConfirmDialog
        open={!!confirmPrompt}
        onClose={() => setConfirmPrompt(null)}
        onConfirm={() => {
          confirmPrompt?.onConfirm();
          setConfirmPrompt(null);
        }}
        title={confirmPrompt?.title ?? ""}
        description={confirmPrompt?.description}
        confirmLabel={confirmPrompt?.confirmLabel}
        danger={confirmPrompt?.danger}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// User Row
// ---------------------------------------------------------------------------

function UserRow({
  user: u,
  isExpanded,
  onToggleExpand,
  onBan,
  onPromote,
  onGrantPro,
  onRevokePro,
}: {
  user: AdminUser;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onBan: () => void;
  onPromote: () => void;
  onGrantPro: (days: number) => void;
  onRevokePro: () => void;
}) {
  const [days, setDays] = useState(30);

  return (
    <>
      <tr
        className={cn(
          "transition-colors cursor-pointer",
          isExpanded ? "bg-surface-soft/60" : "hover:bg-surface-soft/40"
        )}
        onClick={onToggleExpand}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <ChevronDown
              size={14}
              className={cn("text-muted-soft transition-transform", !isExpanded && "-rotate-90")}
            />
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600">
              {(u.name || u.phone || "U").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-ink truncate max-w-[140px]">{u.name || "未命名"}</p>
              <p className="text-xs text-muted truncate max-w-[140px]">{u.phone || "-"}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          {(u.role || "user") === "admin" ? (
            <Badge tone="brand" icon={ShieldCheck}>
              管理员
            </Badge>
          ) : (
            <span className="text-xs text-muted">普通用户</span>
          )}
        </td>
        <td className="px-4 py-3">
          {u.plan === "pro" ? (
            <Badge tone={isExpiredPro(u) ? "red" : "amber"} icon={Crown}>
              {isExpiredPro(u) ? "已过期" : "Pro"}
            </Badge>
          ) : (
            <span className="text-xs text-muted">Free</span>
          )}
        </td>
        <td className="px-4 py-3">
          {u.plan_expires_at ? (
            <span
              className={cn(
                "font-mono text-[12.5px]",
                isExpiredPro(u) ? "text-error" : "text-body"
              )}
            >
              {new Date(u.plan_expires_at).toLocaleDateString("zh-CN")}
            </span>
          ) : (
            <span className="text-xs text-muted">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="font-mono text-[13px] text-body">{u.learned_words ?? 0}</span>
          <span className="text-xs text-muted"> 词 · {u.videos_watched ?? 0} 视频</span>
        </td>
        <td className="px-4 py-3">
          {u.is_banned ? (
            <Badge tone="red" icon={Ban}>
              已封禁
            </Badge>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              正常
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-muted">
          {new Date(u.created_at).toLocaleDateString("zh-CN")}
        </td>
        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <AdminDropdown
            items={[
              {
                key: "ban",
                label: u.is_banned ? "解封用户" : "封禁用户",
                icon: u.is_banned ? ShieldOff : Shield,
                danger: !u.is_banned,
                onClick: onBan,
              },
              {
                key: "promote",
                label: (u.role || "user") === "admin" ? "降级为普通用户" : "提升为管理员",
                icon: UserCog,
                onClick: onPromote,
              },
              {
                key: "revoke",
                label: "撤销 Pro",
                icon: UserX,
                danger: true,
                disabled: u.plan !== "pro",
                onClick: onRevokePro,
              },
            ]}
          />
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr className="bg-surface-soft/40">
          <td colSpan={8} className="px-4 py-4">
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <DetailStat label="观看视频" value={u.videos_watched ?? 0} />
                <DetailStat label="等级" value={u.level || "-"} />
                <DetailStat
                  label="Pro 到期"
                  value={
                    u.plan_expires_at
                      ? new Date(u.plan_expires_at).toLocaleDateString("zh-CN")
                      : "-"
                  }
                />
              </div>

              {/* Pro management */}
              <div className="flex items-end gap-3">
                <div>
                  <label className="block text-xs text-muted mb-1.5">赠送天数</label>
                  <input
                    type="number"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    min={1}
                    max={3650}
                    className="w-24 rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  />
                </div>
                <Button
                  onClick={() => onGrantPro(Math.max(1, Math.min(3650, Math.round(days))))}
                  icon={Crown}
                  size="sm"
                >
                  赠送 Pro
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail Stat
// ---------------------------------------------------------------------------

function DetailStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-canvas border border-hairline p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
