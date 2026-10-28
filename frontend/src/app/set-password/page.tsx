"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Lock, Loader2 } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { safeNext } from "@/lib/authHelpers";
import { PASSWORD_RE, PASSWORD_RULE_MESSAGE } from "@/lib/password";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Button } from "@/components/ui/Button";
import { LinkButton } from "@/components/ui/LinkButton";
import { FullPageSpinner } from "@/components/common/Spinner";
import { AuthCard } from "@/components/auth/AuthCard";
import { PasswordField } from "@/components/auth/PasswordField";

type Origin = "register" | "login" | "";

const SUBTITLE: Record<Origin, string> = {
  register: "注册成功，设置后可用手机号 + 密码登录。",
  login: "已登录，设置后可用手机号 + 密码登录。",
  "": "设置后可用手机号 + 密码登录。",
};

/**
 * 设置登录密码（原型「设置登录密码」视图）。
 *
 * 入口：注册成功（from=register）或验证码登录首次建号（from=login）后跳来。
 * 走 `POST /api/v1/auth/change-password`，**首次设置不传 current_password**
 * （后端允许省略，且不会使当前会话失效）。「暂时跳过」不调接口，直接放行。
 */
export default function SetPasswordPage() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <SetPasswordForm />
    </Suspense>
  );
}

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawFrom = searchParams.get("from");
  const from: Origin = rawFrom === "login" ? "login" : rawFrom === "register" ? "register" : "";
  const next = safeNext(searchParams.get("next"), "/onboarding");
  const current = searchParams.toString();
  const { isAuthenticated, isLoading } = useRequireAuth({
    redirectTo: `/login?next=${encodeURIComponent(`/set-password${current ? `?${current}` : ""}`)}`,
  });
  // The JWT payload carries no password flag, so ask /users/me once. If the
  // request fails we fail open to the form (the submit handler still maps a
  // 400 to the guidance state).
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    api<{ has_password?: boolean }>("/api/v1/users/me", { cacheTtlMs: 30_000 })
      .then((me) => {
        if (!cancelled) setHasPassword(Boolean(me.has_password));
      })
      .catch(() => {
        if (!cancelled) setHasPassword(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  // The API answers 400 when an account already has a password but the page
  // only collected a new one (no current_password field here). Treat that as a
  // "change password elsewhere" state instead of a generic retry message.
  const [needsCurrentPassword, setNeedsCurrentPassword] = useState(false);
  // 错误归属于哪个字段：只有它该红的那个框才红（空串 = 表单级错误，不染红任何输入框）。
  const [errorField, setErrorField] = useState<"" | "password" | "confirm">("");
  const [fieldError, setFieldError] = useState("");
  const [loading, setLoading] = useState(false);

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  // Set-password is a first-setup page. An account that already has a password
  // must not be pushed into a 400 dead end: point it at the settings page that
  // asks for the current password.
  if (needsCurrentPassword || hasPassword === true) {
    return (
      <AuthCard
        title="设置登录密码"
        subtitle="这个账号已经设置过密码，可以直接用手机号 + 密码登录。"
      >
        <div className="mt-4 flex items-start gap-2 rounded-md border border-hairline bg-surface-soft px-3 py-2.5 text-meta leading-relaxed text-body">
          <Lock size={15} className="mt-0.5 flex-none text-muted" aria-hidden="true" />
          <span>
            修改密码需要先验证当前密码，请在「我的 → 学习设置 →
            账号与安全」里完成；忘记密码也可以用手机验证码重置。
          </span>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <LinkButton href="/profile?tab=settings" fullWidth>
            去账号设置修改密码
          </LinkButton>
          <Link
            href="/"
            className="text-center text-copy font-medium text-muted transition-colors hover:text-ink"
          >
            先回首页挑一段
          </Link>
        </div>
      </AuthCard>
    );
  }

  function finish() {
    router.replace(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // 回车提交不受按钮 disabled 约束，所以在途要在这里再挡一次。
    if (loading) return;
    setError("");
    setFieldError("");
    setErrorField("");

    if (!PASSWORD_RE.test(password)) {
      setFieldError(PASSWORD_RULE_MESSAGE);
      setErrorField("password");
      return;
    }
    if (password !== confirm) {
      setFieldError("两次输入的密码不一致，请检查第二遍输入是否有多余空格。");
      setErrorField("confirm");
      return;
    }

    setLoading(true);
    try {
      await api<{ message: string }>("/api/v1/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ new_password: password }),
      });
      finish();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setNeedsCurrentPassword(true);
        return;
      }
      // 服务端错误不指向某个输入框（表单级）。
      setError(apiErrorMessage(err, "保存失败，请重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="设置登录密码" subtitle={SUBTITLE[from]}>
      <div className="mt-4 flex items-start gap-2 rounded-md border border-hairline bg-surface-soft px-3 py-2.5 text-meta leading-relaxed text-body">
        <Lock size={15} className="mt-0.5 flex-none text-muted" aria-hidden="true" />
        <span>
          <strong className="font-semibold text-ink">密码只用于本站登录</strong>
          ，服务器只存加盐哈希。忘记密码可以随时用验证码找回，不会被锁在账号外。
        </span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <PasswordField
          id="setpw-password"
          label="新密码"
          value={password}
          onChange={(value) => {
            setPassword(value);
            setError("");
            setErrorField("");
            setFieldError("");
          }}
          placeholder="请输入新密码"
          disabled={loading}
          error={errorField === "password" ? fieldError : undefined}
          showMeter
          showRules
          hint="强度条第三档 = 可直接提交，两处口径完全一致，不会出现「显示强却被拒」。"
        />

        <PasswordField
          id="setpw-confirm"
          label="确认密码"
          value={confirm}
          onChange={(value) => {
            setConfirm(value);
            setError("");
            setErrorField("");
            setFieldError("");
          }}
          placeholder="再次输入密码"
          disabled={loading}
          error={errorField === "confirm" ? fieldError : undefined}
        />

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-sm border border-error/30 bg-red-soft px-3 py-2.5 text-meta leading-relaxed text-error-text"
          >
            <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          fullWidth
          disabled={loading}
          className="mt-1 h-12 rounded-md text-copy-lg"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              保存中...
            </>
          ) : (
            "保存并完成"
          )}
        </Button>
      </form>

      <div className="mt-5 flex flex-col items-center gap-1.5">
        <button
          type="button"
          onClick={finish}
          disabled={loading}
          className="text-copy font-medium text-muted transition-colors hover:text-ink disabled:cursor-not-allowed"
        >
          暂时跳过
        </button>
        <p className="text-caption text-muted">
          跳过不影响验证码登录，之后可在「我的 → 学习设置」补密码。
        </p>
      </div>
    </AuthCard>
  );
}
