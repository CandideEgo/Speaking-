"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/errors";
import { safeNext } from "@/lib/authHelpers";
import {
  PASSWORD_HINT,
  PASSWORD_RE,
  PASSWORD_RULE_MESSAGE,
  passwordStrength,
} from "@/lib/password";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/common/Spinner";
import { AuthCard } from "@/components/auth/AuthCard";
import { cn } from "@/lib/utils";

type Origin = "register" | "login" | "";

const SUBTITLE: Record<Origin, string> = {
  register: "注册成功，设置后可用手机号 + 密码登录。",
  login: "已登录，设置后可用手机号 + 密码登录。",
  "": "设置后可用手机号 + 密码登录。",
};

const STRENGTH_LABEL = ["强度", "弱", "中", "强"] as const;
const STRENGTH_COLOR = ["", "bg-error", "bg-warning", "bg-success"] as const;

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

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  // 错误归属于哪个字段：只有它该红的那个框才红（空串 = 表单级错误，不染红任何输入框）。
  const [errorField, setErrorField] = useState<"" | "password" | "confirm">("");
  const [loading, setLoading] = useState(false);

  const strength = passwordStrength(password);

  if (isLoading || !isAuthenticated) {
    return <FullPageSpinner />;
  }

  function finish() {
    router.replace(next);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // 回车提交不受按钮 disabled 约束，所以在途要在这里再挡一次。
    if (loading) return;
    setError("");
    setErrorField("");

    if (!PASSWORD_RE.test(password)) {
      setError(PASSWORD_RULE_MESSAGE);
      setErrorField("password");
      return;
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致");
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
      // 服务端错误不指向某个输入框（表单级）。
      setError(apiErrorMessage(err, "保存失败，请重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard title="设置登录密码" subtitle={SUBTITLE[from]}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <label htmlFor="setpw-password" className="block text-copy font-medium text-ink">
            新密码
          </label>
          <div
            className={cn(
              "flex h-[46px] items-stretch overflow-hidden rounded-md border-[1.5px] bg-surface-card transition-colors focus-within:border-brand-500 focus-within:bg-canvas focus-within:ring-4 focus-within:ring-brand-500/15",
              errorField === "password" ? "border-error" : "border-hairline hover:border-muted"
            )}
          >
            <input
              id="setpw-password"
              name="new-password"
              type={show ? "text" : "password"}
              autoComplete="new-password"
              disabled={loading}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
                setErrorField("");
              }}
              placeholder="请输入新密码"
              aria-invalid={errorField === "password"}
              aria-describedby={error ? "setpw-error" : undefined}
              className="min-w-0 flex-1 bg-transparent px-3.5 text-copy text-ink outline-none placeholder:text-muted-soft"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "隐藏密码" : "显示密码"}
              aria-pressed={show}
              className="flex items-center pr-3.5 pl-2 text-muted transition-colors hover:text-ink"
            >
              {show ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          <div className="flex items-center gap-2 pt-0.5">
            <div
              className="flex flex-1 gap-1"
              role="img"
              aria-label={`密码强度：${STRENGTH_LABEL[strength]}`}
            >
              {[1, 2, 3].map((seg) => (
                <span
                  key={seg}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    seg <= strength ? STRENGTH_COLOR[strength] : "bg-surface-card"
                  )}
                />
              ))}
            </div>
            <span className="text-caption text-muted">{STRENGTH_LABEL[strength]}</span>
          </div>

          <p className="text-meta leading-relaxed text-muted">{PASSWORD_HINT}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="setpw-confirm" className="block text-copy font-medium text-ink">
            确认密码
          </label>
          <input
            id="setpw-confirm"
            name="confirm-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            disabled={loading}
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError("");
              setErrorField("");
            }}
            placeholder="再次输入密码"
            aria-invalid={errorField === "confirm"}
            aria-describedby={error ? "setpw-error" : undefined}
            className={cn(
              "h-[46px] w-full rounded-md border-[1.5px] bg-surface-card px-3.5 text-copy text-ink outline-none transition-colors placeholder:text-muted-soft focus:border-brand-500 focus:bg-canvas focus:ring-4 focus:ring-brand-500/15",
              errorField === "confirm" ? "border-error" : "border-hairline hover:border-muted"
            )}
          />
        </div>

        {error && (
          <div
            id="setpw-error"
            role="alert"
            className="flex items-start gap-2 rounded-sm border border-error/20 bg-red-soft px-3 py-2.5 text-meta leading-relaxed text-error"
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

      <div className="mt-5 text-center">
        <button
          type="button"
          onClick={finish}
          disabled={loading}
          className="text-copy font-medium text-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-muted-soft"
        >
          暂时跳过
        </button>
      </div>
    </AuthCard>
  );
}
