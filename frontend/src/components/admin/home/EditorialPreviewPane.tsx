"use client";

/**
 * 后台预览渲染器 —— 「后台看什么 = 首页显示什么」的唯一接缝。
 *
 * 直接渲染 frontend-home（T3）导出的公共展示组件 `HomeEditorialPreview`
 * （`@/components/home/HomeEditorialHero`，props: `{ page, mode, issues }`），
 * 不自写任何公共首页样式。数据只来自管理员 preview 接口。
 */

import { HomeEditorialPreview } from "@/components/home/HomeEditorialHero";
import type { HomeEditorialPage, HomeLayoutIssue } from "@/types/homeContent";
import { HomeLayoutIssues } from "./HomeLayoutIssues";

export function EditorialPreviewPane({
  page,
  issues = [],
}: {
  page: HomeEditorialPage | null;
  issues?: HomeLayoutIssue[];
}) {
  return (
    <div className="space-y-3">
      <p className="rounded-sm bg-surface-soft px-3 py-2 text-caption text-muted">
        预览渲染与首页相同的公共展示组件；数据来自管理员 preview 接口，不读取公共
        `/browse/home-editorial`。
      </p>
      {!page ? (
        <>
          <HomeLayoutIssues issues={issues} />
          <div className="rounded-md border border-dashed border-hairline px-5 py-10 text-center">
            <p className="text-copy font-medium text-ink">当前没有可展示内容</p>
            <p className="mt-1 text-meta text-muted">
              草稿为空或引用的内容版本已失效；补齐内容并保存后再预览。
            </p>
          </div>
        </>
      ) : (
        <HomeEditorialPreview page={page} mode="preview" issues={issues} />
      )}
    </div>
  );
}
