"use client";

import { ArrowLeft, Home } from "lucide-react";
import { LinkButton } from "@/components/ui/LinkButton";
import { Button } from "@/components/ui/Button";

/**
 * 404（根级路由）：404 编号 + 页面不存在 + 原因猜测 + 两个下一步
 * （主：回首页挑一段；次：返回上一页）。设计 `states.html` ① 的组件形态。
 */
export default function RootNotFound() {
  return (
    <main className="user-ui flex min-h-dvh items-center justify-center bg-canvas px-4 pt-6 pb-18">
      <div className="w-full max-w-md text-center">
        <h1 className="font-mono text-[56px] font-bold leading-none tracking-[-0.04em] text-ink">
          404
        </h1>
        <p className="mt-4 text-title font-semibold text-ink">页面不存在</p>
        <p className="mt-2 text-copy leading-relaxed text-muted">
          你访问的页面可能已被移动或删除。如果链接是从聊天记录里复制来的，可能是它已经过期了。
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <LinkButton href="/" icon={Home}>
            回首页挑一段
          </LinkButton>
          <Button variant="outline" icon={ArrowLeft} onClick={() => history.back()}>
            返回上一页
          </Button>
        </div>
      </div>
    </main>
  );
}
