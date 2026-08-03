"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  Gift,
  Loader2,
  Save,
  Settings2,
  ShieldCheck,
  UserCog,
  Zap,
} from "lucide-react";

import { AdminPageHeader, AdminSkeleton } from "@/components/admin/ui";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/lib/errors";
import type { AdminAccount, AdminSettings } from "@/types";
import { getAdminSettings, listAdminAccounts, saveAdminSettings } from "@/lib/adminData";
import { useAdminAuthStore } from "@/stores/adminAuthStore";

// ---------------------------------------------------------------------------
// Toggle Switch (prototype 32 .switch)
// ---------------------------------------------------------------------------

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-6 w-[42px] shrink-0 rounded-full transition-colors",
        on ? "bg-brand-500" : "border border-hairline bg-surface-card"
      )}
    >
      <span
        className={cn(
          "absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full shadow-sm transition-all",
          on ? "left-[20px] bg-white" : "left-[2px] bg-canvas"
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Setting row (prototype 32 .row)
// ---------------------------------------------------------------------------

function Row({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-hairline-soft py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section card (prototype 32 .section)
// ---------------------------------------------------------------------------

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Settings2;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-canvas">
      <div className="flex items-center gap-2.5 border-b border-hairline px-5 py-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon size={16} />
        </div>
        <div>
          <h2 className="text-[15px] font-bold text-ink">{title}</h2>
          {description && <p className="mt-px text-xs text-muted">{description}</p>}
        </div>
      </div>
      <div className="px-5 py-2">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inputs (prototype 32 .input / .input-suffix)
// ---------------------------------------------------------------------------

function TextInput({
  value,
  onChange,
  mono,
  wide,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  wide?: boolean;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "h-9 rounded-lg border border-hairline bg-canvas px-3 text-[13.5px] text-ink outline-none transition-all",
        "placeholder:text-muted-soft focus:border-brand-400 focus:ring-[3px] focus:ring-brand-500/12",
        mono && "font-mono",
        wide ? "min-w-[220px]" : "min-w-[140px]"
      )}
    />
  );
}

function NumberSuffixInput({
  value,
  onChange,
  suffix,
  width = 90,
  step,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix: string;
  width?: number;
  step?: string;
}) {
  return (
    <span className="inline-flex items-center">
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width }}
        className={cn(
          "h-9 rounded-l-lg border border-hairline bg-canvas px-3 font-mono text-[13.5px] text-ink outline-none transition-all",
          "focus:border-brand-400 focus:ring-[3px] focus:ring-brand-500/12"
        )}
      />
      <span className="inline-flex h-9 items-center rounded-r-lg border border-hairline border-l-0 bg-surface-card px-2.5 text-[13px] text-muted">
        {suffix}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const MASK_PHONE = (phone: string | null) =>
  phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "—";

export default function AdminSettingsPage() {
  const currentUserId = useAdminAuthStore((s) => s.user?.sub);
  const [saved, setSaved] = useState<AdminSettings | null>(null);
  const [form, setForm] = useState<AdminSettings | null>(null);
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, accounts] = await Promise.all([
        getAdminSettings(),
        listAdminAccounts().catch(() => [] as AdminAccount[]),
      ]);
      setSaved(settings);
      setForm(settings);
      setAdmins(accounts);
    } catch (err) {
      toast.error(apiErrorMessage(err, "加载设置失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!saved || !form) return false;
    return JSON.stringify(saved) !== JSON.stringify({ ...form, updated_at: saved.updated_at });
  }, [saved, form]);

  const thresholdError = useMemo(() => {
    if (!form) return null;
    if (form.quality_warn_threshold < form.quality_block_threshold) {
      return "警告阈值不能低于阻塞阈值";
    }
    return null;
  }, [form]);

  function patch(p: Partial<AdminSettings>) {
    setForm((prev) => (prev ? { ...prev, ...p } : prev));
  }

  async function handleSave() {
    if (!form || thresholdError) return;
    setSaving(true);
    try {
      const { updated_at: _omit, ...payload } = form;
      const next = await saveAdminSettings(payload);
      setSaved(next);
      setForm(next);
      toast.success("设置已保存");
    } catch (err) {
      toast.error(apiErrorMessage(err, "保存失败"));
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    if (saved) setForm(saved);
  }

  if (loading || !form) {
    return <AdminSkeleton.Page />;
  }

  return (
    <div className="mx-auto max-w-[860px] space-y-[18px] pb-20">
      {/* Header */}
      <AdminPageHeader title="系统设置" description="平台配置 · 质量门禁 · 管理员账户" />

      {/* 通用配置 */}
      <Section icon={Settings2} title="通用配置" description="站点名称、存储、支付模式">
        <Row title="站点名称" description="显示在导航栏与邮件中">
          <TextInput value={form.site_name} onChange={(v) => patch({ site_name: v })} />
        </Row>
        <Row title="微信小商店 URL" description="Pro 会员购买入口，留空则显示「即将开通」">
          <TextInput
            mono
            wide
            value={form.wechat_shop_url ?? ""}
            placeholder="https://shop.weixin.com/..."
            onChange={(v) => patch({ wechat_shop_url: v || null })}
          />
        </Row>
        <Row title="启用支付" description="非经营性平台，保持关闭。关闭时仅支持兑换码激活。">
          <Toggle on={form.payments_enabled} onChange={(v) => patch({ payments_enabled: v })} />
        </Row>
        <Row title="新用户注册" description="允许新用户通过手机号注册">
          <Toggle
            on={form.registration_enabled}
            onChange={(v) => patch({ registration_enabled: v })}
          />
        </Row>
      </Section>

      {/* 质量门禁 */}
      <Section icon={ShieldCheck} title="质量门禁" description="翻译/转录质量阈值与阻塞开关">
        <Row title="翻译质量阻塞" description="覆盖率低于阻塞阈值时标记 error，阻止上线">
          <Toggle
            on={form.quality_block_enabled}
            onChange={(v) => patch({ quality_block_enabled: v })}
          />
        </Row>
        <Row title="阻塞阈值" description="覆盖率低于此值 -> quality_blocked">
          <NumberSuffixInput
            step="0.01"
            value={String(form.quality_block_threshold)}
            suffix="%"
            onChange={(v) => {
              const n = parseFloat(v);
              if (!Number.isNaN(n)) patch({ quality_block_threshold: n });
            }}
          />
        </Row>
        <Row title="警告阈值" description="覆盖率低于此值（≥阻塞）-> quality_warning">
          <NumberSuffixInput
            step="0.01"
            value={String(form.quality_warn_threshold)}
            suffix="%"
            onChange={(v) => {
              const n = parseFloat(v);
              if (!Number.isNaN(n)) patch({ quality_warn_threshold: n });
            }}
          />
        </Row>
        <Row title="转录幻觉检测" description="重复/无意义/时长异常/空段检测，失败即阻塞">
          <Toggle
            on={form.hallucination_detection_enabled}
            onChange={(v) => patch({ hallucination_detection_enabled: v })}
          />
        </Row>
        {thresholdError && (
          <div className="flex items-center gap-2 py-2.5 text-xs text-error">
            <AlertCircle size={14} />
            {thresholdError}
          </div>
        )}
      </Section>

      {/* 视频管线 */}
      <Section icon={Zap} title="视频管线" description="超时、重试、Watchdog">
        <Row title="翻译步超时" description="单步卡死超此时间由 Watchdog 标记失败">
          <NumberSuffixInput
            value={String(form.translate_timeout_sec)}
            suffix="秒"
            onChange={(v) => {
              const n = parseInt(v, 10);
              if (!Number.isNaN(n)) patch({ translate_timeout_sec: n });
            }}
          />
        </Row>
        <Row title="下载步超时" description="yt-dlp 下载超时">
          <NumberSuffixInput
            value={String(form.download_timeout_sec)}
            suffix="秒"
            onChange={(v) => {
              const n = parseInt(v, 10);
              if (!Number.isNaN(n)) patch({ download_timeout_sec: n });
            }}
          />
        </Row>
        <Row title="下载失败自动重试" description="每日 beat 任务重试失败下载，最多 3 次">
          <Toggle
            on={form.download_auto_retry_enabled}
            onChange={(v) => patch({ download_auto_retry_enabled: v })}
          />
        </Row>
        <Row title="Watchdog 轮询" description="每 10 分钟检测全管线卡死">
          <Toggle on={form.watchdog_enabled} onChange={(v) => patch({ watchdog_enabled: v })} />
        </Row>
      </Section>

      {/* 管理员账户 */}
      <Section icon={UserCog} title="管理员账户" description="拥有后台访问权限的账户">
        <div className="flex flex-col gap-2.5 py-3.5">
          {admins.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted">暂无管理员账户</p>
          ) : (
            admins.map((a, i) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-[10px] border border-hairline px-3.5 py-2.5"
              >
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
                    i === 0
                      ? "bg-gradient-to-br from-brand-500 to-brand-400"
                      : "bg-gradient-to-br from-indigo to-indigo/70"
                  )}
                >
                  {(a.name || "管").slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold text-ink">
                    {a.name || "管理员"}
                    {a.id === currentUserId && (
                      <span className="ml-1.5 text-xs text-muted">(我)</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {MASK_PHONE(a.phone)} · 最近活跃{" "}
                    {a.last_active_at
                      ? new Date(a.last_active_at).toLocaleString("zh-CN", {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    i === 0 ? "bg-brand-50 text-brand-600" : "bg-indigo-soft text-indigo"
                  )}
                >
                  {i === 0 ? (
                    <>
                      <Gift size={11} />
                      超级管理员
                    </>
                  ) : (
                    "管理员"
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </Section>

      {/* Save bar (prototype 32 .save-bar) */}
      {dirty && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-xl bg-ink px-[18px] py-3 text-white shadow-xl">
          <div className="flex items-center gap-2 text-[13px]">
            <AlertCircle size={15} className="text-warning" />
            有未保存的更改
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDiscard}
              disabled={saving}
              className="border-white/20 bg-transparent text-white hover:bg-white/10"
            >
              放弃
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !!thresholdError}>
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save size={14} />
                  保存更改
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
