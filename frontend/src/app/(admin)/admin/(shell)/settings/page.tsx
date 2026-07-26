"use client";

import { useState } from "react";
import { Bell, Cpu, Globe, Palette, Save, Server, Shield, ToggleLeft } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useWorkerStatus } from "@/hooks/useAdminPolling";

// ---------------------------------------------------------------------------
// Toggle Switch
// ---------------------------------------------------------------------------

function Toggle({
  enabled,
  onChange,
  label,
  description,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && <p className="text-xs text-muted mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
          enabled ? "bg-brand-500" : "bg-surface-card"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
            enabled ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Card
// ---------------------------------------------------------------------------

function SettingsSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Globe;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-canvas p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-soft text-muted">
          <Icon size={18} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
      </div>
      <div className="divide-y divide-hairline">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminSettingsPage() {
  const { data: workerStatus } = useWorkerStatus();

  // Feature flags state (local for now)
  const [flags, setFlags] = useState({
    registration: true,
    ugcUpload: true,
    aiAnalysis: true,
    shadowing: true,
    notifications: true,
    maintenanceMode: false,
  });

  const updateFlag = (key: keyof typeof flags, value: boolean) => {
    setFlags((prev) => ({ ...prev, [key]: value }));
    // TODO: persist to backend API once available
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <AdminPageHeader
        title="系统设置"
        description="管理平台配置与功能开关"
        actions={
          <Button icon={Save} size="sm" disabled title="设置持久化功能即将上线">
            保存更改
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Feature Flags */}
        <SettingsSection icon={ToggleLeft} title="功能开关" description="启用或禁用平台功能">
          <Toggle
            enabled={flags.registration}
            onChange={(v) => updateFlag("registration", v)}
            label="用户注册"
            description="允许新用户注册账号"
          />
          <Toggle
            enabled={flags.ugcUpload}
            onChange={(v) => updateFlag("ugcUpload", v)}
            label="UGC 上传"
            description="允许用户提交视频"
          />
          <Toggle
            enabled={flags.aiAnalysis}
            onChange={(v) => updateFlag("aiAnalysis", v)}
            label="AI 分析"
            description="启用 AI 字幕生成与词汇提取"
          />
          <Toggle
            enabled={flags.shadowing}
            onChange={(v) => updateFlag("shadowing", v)}
            label="跟读练习"
            description="启用语音跟读功能"
          />
          <Toggle
            enabled={flags.notifications}
            onChange={(v) => updateFlag("notifications", v)}
            label="站内通知"
            description="启用系统通知推送"
          />
        </SettingsSection>

        {/* System Status */}
        <SettingsSection icon={Server} title="系统状态" description="服务运行状态监控">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Cpu size={16} className="text-muted" />
              <div>
                <p className="text-sm font-medium text-ink">GPU Worker</p>
                <p className="text-xs text-muted">视频处理服务</p>
              </div>
            </div>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                workerStatus == null
                  ? "bg-surface-soft text-muted"
                  : workerStatus.worker_online
                    ? "bg-success-soft text-success"
                    : "bg-error/10 text-error"
              )}
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  workerStatus == null
                    ? "bg-muted"
                    : workerStatus.worker_online
                      ? "bg-success"
                      : "bg-error"
                )}
              />
              {workerStatus == null ? "检测中..." : workerStatus.worker_online ? "在线" : "离线"}
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Globe size={16} className="text-muted" />
              <div>
                <p className="text-sm font-medium text-ink">API 服务</p>
                <p className="text-xs text-muted">FastAPI 后端</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              运行中
            </span>
          </div>
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Bell size={16} className="text-muted" />
              <div>
                <p className="text-sm font-medium text-ink">Celery Worker</p>
                <p className="text-xs text-muted">异步任务队列</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              运行中
            </span>
          </div>
        </SettingsSection>

        {/* Maintenance Mode */}
        <SettingsSection icon={Shield} title="维护模式" description="系统维护相关设置">
          <Toggle
            enabled={flags.maintenanceMode}
            onChange={(v) => updateFlag("maintenanceMode", v)}
            label="维护模式"
            description="开启后用户端将显示维护页面"
          />
          <div className="py-3">
            <label className="block text-sm font-medium text-ink mb-1.5">维护公告</label>
            <textarea
              rows={3}
              placeholder="输入维护公告内容..."
              className="w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm placeholder:text-muted-soft focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 resize-none"
            />
          </div>
        </SettingsSection>

        {/* Appearance */}
        <SettingsSection icon={Palette} title="外观设置" description="管理后台界面偏好">
          <div className="py-3">
            <p className="text-sm font-medium text-ink mb-3">主题模式</p>
            <div className="flex gap-3">
              {["浅色", "深色", "跟随系统"].map((theme, i) => (
                <button
                  key={theme}
                  className={cn(
                    "flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                    i === 0
                      ? "border-brand-500 bg-brand-50 text-brand-600"
                      : "border-hairline text-muted hover:border-brand-300"
                  )}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
