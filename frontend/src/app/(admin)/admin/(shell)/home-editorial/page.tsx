"use client";

/**
 * 首页编排页（`/admin/home-editorial`）。
 * 页面本身只挂载编排编辑器；标题由 `AdminPageHeader` 渲染（页面不自写一级标题）。
 */

import { HomeLayoutEditor } from "@/components/admin/home/HomeLayoutEditor";

export default function HomeEditorialPage() {
  return <HomeLayoutEditor />;
}
