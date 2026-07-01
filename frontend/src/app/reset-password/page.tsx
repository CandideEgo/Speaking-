"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Sparkles, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { toastApiError, apiErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <div className="w-full max-w-sm text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-brand-500 text-white">
          <Sparkles size={22} />
        </span>
        <h1 className="mt-4 font-display text-3xl font-normal text-ink tracking-display-md">
          链接无效
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          该重置链接无效或已过期，请重新申请。
        </p>
        <Link
          href="/forgot-password"
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-brand-500 hover:underline font-medium"
        >
          重新发送重置链接
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("密码至少需要 8 位，含大小写字母、数字及特殊字符");
      return;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);
    try {
      await api<{ message: string }>("/api/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, new_password: password }),
      });

      toast.success("密码重置成功，请重新登录");
      router.push("/login");
    } catch (err) {
      setError(apiErrorMessage(err, "重置失败，请重试"));
      toastApiError(err, "重置失败，请重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-brand-500 text-white">
          <Sparkles size={22} />
        </span>
        <h1 className="mt-4 font-display text-3xl font-normal text-ink tracking-display-md">
          设置新密码
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">请输入您的新密码</p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink">新密码</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1.5"
            placeholder="至少 8 位，含大小写字母、数字及特殊字符"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink">确认密码</label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            className="mt-1.5"
            placeholder="至少 8 位，含大小写字母、数字及特殊字符"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" fullWidth disabled={loading} className="mt-2">
          {loading ? "重置中..." : "重置密码"}
        </Button>

        <div className="text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-brand-500 hover:underline font-medium"
          >
            <ArrowLeft size={14} />
            返回登录
          </Link>
        </div>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 bg-canvas">
      <Suspense
        fallback={
          <div className="w-full max-w-sm text-center text-sm text-muted-foreground">
            加载中...
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
