"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAdminAuthStore } from "@/stores/adminAuthStore";
import { adminApi } from "@/lib/adminApi";
import type { User } from "@/types";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";

/**
 * Guarded admin shell. Boots the admin auth store from localStorage, verifies
 * the session is an admin via `/users/me`, then renders the sidebar + topbar
 * + content. Any failure redirects to `/admin/login`.
 */
export default function AdminShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const bootstrap = useAdminAuthStore((s) => s.bootstrap);
  const isAuthenticated = useAdminAuthStore((s) => s.isAuthenticated);
  const isLoading = useAdminAuthStore((s) => s.isLoading);

  const [status, setStatus] = useState<"checking" | "ok" | "denied">(
    "checking",
  );

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace("/admin/login");
      return;
    }
    let cancelled = false;
    adminApi<User>("/api/v1/users/me")
      .then((u) => {
        if (cancelled) return;
        if (u.role !== "admin") {
          toast.error("该账号无管理员权限");
          setStatus("denied");
          setTimeout(() => router.replace("/admin/login"), 800);
          return;
        }
        setStatus("ok");
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("登录已过期，请重新登录");
        router.replace("/admin/login");
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isLoading, router]);

  if (status !== "ok") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-soft">
        <div className="text-center">
          {status === "denied" ? (
            <>
              <ShieldAlert size={40} className="mx-auto text-muted-soft" />
              <p className="mt-3 text-sm text-muted-foreground">无管理员权限</p>
            </>
          ) : (
            <Loader2 size={28} className="mx-auto animate-spin text-coral" />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-soft">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminTopbar pathname={pathname} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1200px] px-6 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
