"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listUsers({
        page,
        page_size: 20,
        role: roleFilter,
        plan: planFilter,
        keyword,
      });
      setUsers(data.items);
      setHasMore(data.has_more);
    } catch {
      toast.error("加载用户列表失败");
    } finally {
      setLoading(false);
    }
  }, [page, roleFilter, planFilter, keyword]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [roleFilter, planFilter, keyword]);

  function patchUser(id: string, patch: Partial<AdminUser>) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  }

  async function handleBan(user: AdminUser) {
    const next = !user.is_banned;
    if (next && !window.confirm(`确认封禁用户「${user.name || user.email}」？`))
      return;
    try {
      await setUserBanned(user.id, next);
      patchUser(user.id, { is_banned: next });
      toast.success(next ? "已封禁" : "已解封");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function handlePromote(user: AdminUser) {
    const next = (user.role || "user") === "admin" ? "user" : "admin";
    const verb = next === "admin" ? "提升为管理员" : "降级为普通用户";
    if (!window.confirm(`确认将「${user.name || user.email}」${verb}？`))
      return;
    try {
      await promoteUser(user.id, next);
      patchUser(user.id, { role: next });
      toast.success("已更新角色");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function handleGrantPro(user: AdminUser, days: number) {
    try {
      const updated = await setUserPlan(user.id, "pro", days);
      patchUser(user.id, updated);
      toast.success(`已赠送 Pro ${days} 天`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  }

  async function handleRevokePro(user: AdminUser) {
    if (!window.confirm(`确认撤销「${user.name || user.email}」的 Pro 会员？`))
      return;
    try {
      const updated = await setUserPlan(user.id, "free", 0);
      patchUser(user.id, updated);
      toast.success("已撤销 Pro");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败");
    }
  }

  return (
    <SectionCard
      title="用户管理"
      description="管理用户角色、封禁状态与 Pro 会员。"
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
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") load();
          }}
          placeholder="搜索姓名/邮箱..."
          className="input-field !py-1.5 max-w-xs ml-auto"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-muted-foreground uppercase tracking-wider">
              <th className="pb-2 font-medium">用户</th>
              <th className="pb-2 font-medium">角色</th>
              <th className="pb-2 font-medium">方案</th>
              <th className="pb-2 font-medium">状态</th>
              <th className="pb-2 font-medium">注册时间</th>
              <th className="pb-2 font-medium">最后活跃</th>
              <th className="pb-2 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {users.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  {loading ? "加载中..." : "暂无用户"}
                </td>
              </tr>
            ) : (
              users.flatMap((u) => [
                <tr key={u.id} className="text-xs align-top">
                  <td className="py-3 pr-4">
                    <button
                      onClick={() =>
                        setExpandedId(expandedId === u.id ? null : u.id)
                      }
                      className="flex items-center gap-2 text-left"
                    >
                      {expandedId === u.id ? (
                        <ChevronDown
                          size={12}
                          className="text-muted-foreground"
                        />
                      ) : (
                        <ChevronRight
                          size={12}
                          className="text-muted-foreground"
                        />
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
                      <span className="inline-flex items-center gap-1 rounded-sm bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-600">
                        <Shield size={11} /> 管理员
                      </span>
                    ) : (
                      <span className="text-muted-foreground">普通用户</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {u.plan === "pro" ? (
                      <span className="inline-flex items-center gap-1 rounded-sm bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        <Crown size={11} /> Pro
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Free</span>
                    )}
                  </td>
                  <td className="py-3 pr-4">
                    {u.is_banned ? (
                      <span className="inline-flex rounded-sm bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">
                        已封禁
                      </span>
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
                      <button
                        onClick={() => handleBan(u)}
                        title={u.is_banned ? "解封" : "封禁"}
                        className={cn(
                          "btn-secondary !py-1 !px-2 text-[11px]",
                          u.is_banned && "text-green-600",
                        )}
                      >
                        {u.is_banned ? (
                          <ShieldOff size={11} />
                        ) : (
                          <Shield size={11} />
                        )}
                        {u.is_banned ? "解封" : "封禁"}
                      </button>
                      <button
                        onClick={() => handlePromote(u)}
                        title="切换管理员角色"
                        className="btn-secondary !py-1 !px-2 text-[11px]"
                      >
                        <UserCog size={11} />
                        {(u.role || "user") === "admin" ? "降级" : "提升"}
                      </button>
                    </div>
                  </td>
                </tr>,
                expandedId === u.id && (
                  <tr key={`${u.id}-detail`} className="bg-surface-soft/40">
                    <td colSpan={7} className="p-4">
                      <UserDetailRow
                        user={u}
                        onGrantPro={handleGrantPro}
                        onRevokePro={handleRevokePro}
                      />
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
            <input
              type="number"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              min={1}
              max={3650}
              className="input-field !py-1.5 w-28"
            />
          </div>
          <button
            onClick={() => onGrantPro(user, days)}
            className="btn-primary !py-2 !px-3 text-xs"
          >
            <Crown size={12} /> 赠送 Pro
          </button>
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
