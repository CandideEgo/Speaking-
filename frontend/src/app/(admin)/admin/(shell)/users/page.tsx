"use client";

import { useState } from "react";
import { toast } from "sonner";
import { toastApiError } from "@/lib/errors";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import {
  ChevronDown,
  ChevronRight,
  Crown,
  RefreshCw,
  Shield,
  ShieldOff,
  UserCog,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { FilterPills } from "@/components/admin/FilterPills";
import { SectionCard } from "@/components/admin/SectionCard";
import { Pagination } from "@/components/admin/Pagination";
import { DataTable } from "@/components/admin/DataTable";
import { Badge } from "@/components/common/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import type { AdminUser } from "@/types";
import {
  listUsers,
  promoteUser,
  setUserBanned,
  setUserPlan,
} from "@/lib/adminData";

const ROLE_FILTERS = [
  { key: "", label: "全部" },
  { key: "admin", label: "管理员" },
  { key: "user", label: "普通用户" },
];

const PLAN_FILTERS = [
  { key: "", label: "全部" },
  { key: "pro", label: "Pro" },
  { key: "free", label: "Free" },
];

export default function AdminUsersPage() {
  const [roleFilter, setRoleFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmPrompt, setConfirmPrompt] = useState<{
    title: string;
    message: string;
    tone: "default" | "danger";
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  const {
    items: users,
    setItems: setUsers,
    page,
    setPage,
    hasMore,
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

  function patchUser(id: string, patch: Partial<AdminUser>) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  async function handleBan(user: AdminUser) {
    const next = !user.is_banned;
    if (next) {
      setConfirmPrompt({
        title: "封禁用户",
        message: `确认封禁用户「${user.name || user.email}」？`,
        tone: "danger",
        confirmLabel: "确认封禁",
        onConfirm: () => doBan(user),
      });
      return;
    }
    doBan(user);
  }

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

  async function handlePromote(user: AdminUser) {
    const next = (user.role || "user") === "admin" ? "user" : "admin";
    const verb = next === "admin" ? "提升为管理员" : "降级为普通用户";
    setConfirmPrompt({
      title: verb,
      message: `确认将「${user.name || user.email}」${verb}？`,
      tone: "default",
      confirmLabel: "确认",
      onConfirm: () => doPromote(user),
    });
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

  async function handleRevokePro(user: AdminUser) {
    setConfirmPrompt({
      title: "撤销 Pro",
      message: `确认撤销「${user.name || user.email}」的 Pro 会员？`,
      tone: "danger",
      confirmLabel: "确认撤销",
      onConfirm: () => doRevokePro(user),
    });
  }

  async function doRevokePro(user: AdminUser) {
    try {
      const updated = await setUserPlan(user.id, "free", 0);
      patchUser(user.id, updated);
      toast.success("已撤销 Pro");
    } catch (err) {
      toastApiError(err);
    }
  }

  return (
    <SectionCard
      title="用户管理"
      description="管理用户角色、封禁状态与 Pro 会员。"
      actions={
        <Button
          onClick={reload}
          disabled={loading}
          variant="secondary"
          icon={RefreshCw}
          size="sm"
        >
          刷新
        </Button>
      }
    >
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <FilterPills
          options={ROLE_FILTERS}
          value={roleFilter}
          onChange={setRoleFilter}
        />
        <span className="text-xs text-muted-soft">·</span>
        <FilterPills
          options={PLAN_FILTERS}
          value={planFilter}
          onChange={setPlanFilter}
        />
        <Input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") reload();
          }}
          placeholder="搜索姓名/邮箱..."
          className="!py-1.5 max-w-xs ml-auto"
        />
      </div>

      <DataTable
        columns={[
          { label: "用户" },
          { label: "角色" },
          { label: "方案" },
          { label: "状态" },
          { label: "注册时间" },
          { label: "最后活跃" },
          { label: "操作", align: "right" },
        ]}
        rows={users}
        rowKey={(u) => u.id}
        loading={loading}
        emptyText="暂无用户"
        expandedId={expandedId}
        renderRow={(u, isExpanded) => (
          <tr className="text-xs align-top">
            <td className="py-3 pr-4">
              <button
                onClick={() => setExpandedId(isExpanded ? null : u.id)}
                className="flex items-center gap-2 text-left"
              >
                {isExpanded ? (
                  <ChevronDown size={12} className="text-muted-foreground" />
                ) : (
                  <ChevronRight size={12} className="text-muted-foreground" />
                )}
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-soft text-[11px] font-medium text-ink flex-shrink-0">
                  {(u.name || u.email).slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-ink truncate max-w-[160px]">
                    {u.name || "未命名"}
                  </div>
                  <div className="text-muted-foreground truncate max-w-[160px]">
                    {u.email}
                  </div>
                </div>
              </button>
            </td>
            <td className="py-3 pr-4">
              {(u.role || "user") === "admin" ? (
                <Badge tone="brand" icon={Shield}>
                  管理员
                </Badge>
              ) : (
                <span className="text-muted-foreground">普通用户</span>
              )}
            </td>
            <td className="py-3 pr-4">
              {u.plan === "pro" ? (
                <Badge tone="amber" icon={Crown}>
                  Pro
                </Badge>
              ) : (
                <span className="text-muted-foreground">Free</span>
              )}
            </td>
            <td className="py-3 pr-4">
              {u.is_banned ? (
                <Badge tone="red">已封禁</Badge>
              ) : (
                <span className="text-muted-foreground">正常</span>
              )}
            </td>
            <td className="py-3 pr-4 text-muted-foreground">
              {new Date(u.created_at).toLocaleDateString()}
            </td>
            <td className="py-3 pr-4 text-muted-foreground">
              {u.last_active_at
                ? new Date(u.last_active_at).toLocaleDateString()
                : "-"}
            </td>
            <td className="py-3 text-right">
              <div className="inline-flex gap-1">
                <Button
                  onClick={() => handleBan(u)}
                  title={u.is_banned ? "解封" : "封禁"}
                  variant="secondary"
                  size="compact"
                  className={cn(u.is_banned && "text-green-600")}
                >
                  {u.is_banned ? <ShieldOff size={11} /> : <Shield size={11} />}
                  {u.is_banned ? "解封" : "封禁"}
                </Button>
                <Button
                  onClick={() => handlePromote(u)}
                  title="切换管理员角色"
                  variant="secondary"
                  size="compact"
                >
                  <UserCog size={11} />
                  {(u.role || "user") === "admin" ? "降级" : "提升"}
                </Button>
              </div>
            </td>
          </tr>
        )}
        renderDetail={(u) => (
          <UserDetailRow
            user={u}
            onGrantPro={handleGrantPro}
            onRevokePro={handleRevokePro}
          />
        )}
      />

      <Pagination
        page={page}
        hasMore={hasMore}
        loading={loading}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
      />

      <ConfirmDialog
        open={!!confirmPrompt}
        tone={confirmPrompt?.tone ?? "default"}
        title={confirmPrompt?.title}
        confirmLabel={confirmPrompt?.confirmLabel ?? "确认"}
        message={confirmPrompt?.message ?? ""}
        onClose={() => setConfirmPrompt(null)}
        onConfirm={() => {
          const p = confirmPrompt;
          setConfirmPrompt(null);
          p?.onConfirm();
        }}
      />
    </SectionCard>
  );
}

function UserDetailRow({
  user,
  onGrantPro,
  onRevokePro,
}: {
  user: AdminUser;
  onGrantPro: (u: AdminUser, days: number) => void;
  onRevokePro: (u: AdminUser) => void;
}) {
  const [days, setDays] = useState(30);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="grid grid-cols-2 gap-3 text-xs">
        <Stat label="口语练习次数" value={user.speaking_attempts} />
        <Stat label="观看视频数" value={user.videos_watched} />
        <Stat label="发帖数" value={user.posts_count} />
        <Stat label="等级" value={user.level || "-"} />
        {user.plan_expires_at && (
          <Stat
            label="Pro 到期"
            value={new Date(user.plan_expires_at).toLocaleDateString()}
          />
        )}
      </div>
      <div>
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Pro 会员管理
        </h4>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-[11px] text-muted-foreground mb-1">
              赠送天数
            </label>
            <Input
              type="number"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              min={1}
              max={3650}
              className="!py-1.5 w-28"
            />
          </div>
          <Button onClick={() => onGrantPro(user, days)} icon={Crown} size="sm">
            赠送 Pro
          </Button>
          {user.plan === "pro" && (
            <button
              onClick={() => onRevokePro(user)}
              className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 ml-auto"
            >
              撤销 Pro
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-canvas border border-hairline rounded-sm p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-ink">{value}</div>
    </div>
  );
}
