"use client";

import { ArrowLeft, Home } from "lucide-react";
import { LinkButton } from "@/components/ui/LinkButton";
import { Button } from "@/components/ui/Button";

/**
 * 404（用户壳内路由）：与根级 404 同一套文案与动作，但由 `(main)` 布局提供
 * 导航壳与容器，这里只渲染内容区。
 */
export default function MainNotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
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
