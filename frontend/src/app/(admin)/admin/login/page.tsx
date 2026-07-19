"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useAdminAuthStore } from "@/stores/adminAuthStore";
import { adminApi } from "@/lib/adminApi";
import { apiErrorMessage } from "@/lib/errors";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AuthCard } from "@/components/auth/AuthCard";

interface LoginResponse {
  token: string;
  refresh_token?: string;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const login = useAdminAuthStore((s) => s.login);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await adminApi<LoginResponse>("/api/v1/auth/phone-login", {
        method: "POST",
        body: JSON.stringify({ phone, password }),
      });
      login(data.token, data.refresh_token ?? null);
      router.replace("/admin");
    } catch (err) {
      setError(apiErrorMessage(err, "登录失败，请重试"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthCard
      title="管理后台"
      subtitle={
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={13} />
          仅限管理员登录
        </span>
      }
    >
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-ink">手机号</label>
          <Input
            type="tel"
            inputMode="numeric"
            maxLength={11}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
            required
            autoComplete="tel"
            className="mt-1.5"
            placeholder="请输入手机号"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-ink">密码</label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="mt-1.5"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <Button type="submit" fullWidth disabled={loading} className="mt-2">
          {loading ? "登录中..." : "管理员登录"}
        </Button>
      </form>
    </AuthCard>
  );
}
