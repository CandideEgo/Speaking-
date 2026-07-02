# ADR-0005: 前端重做 — 统一组件库（保持现有色系），播放页为锚点

- **Status**: Accepted — 2026-07-03

## Context

前端现状（调查确认）：

- **不满意点（用户全选）**：风格不一致 + 移动端差 + 导航混乱 + 视觉品质低。
- 认证后 app（首页/dashboard/browse/watch/profile）结构上连贯；**真问题是**：
  - 入口/导航断裂：落地页 `/landing` 写好了但孤儿（未链接）；未登录直接跳 `/login` 表单，无价值展示；TopBar 登录按钮是死代码（被 auth 拦在前面）；**全 app 无退出登录按钮**；profile 在侧边栏/移动 tab 无入口（只能点 TopBar 头像字母）。
  - 图片加载崩（`NEXT_PUBLIC_API_URL` 未设 → 回退 localhost；全站裸 `<img>`；头像绕过 `mediaUrl`；TopBar 头像从不显示图片；社区视频贴不渲染缩略图）。
- **播放页（watch/[id]）用户满意、亲自调过**——不动，只优化。

用户决策：**推倒重做用户页 + 管理面板 UI**，但**保持现有 coral/cream/brand 色系**（不换色系，统一组件 + 修布局）；**播放页不动**；落地页接为公开首页；管理面板 UI 现在和用户页一起重做。

## Decision

**统一组件库**：抽取一套统一组件库，**以 watch 页为风格锚点**——组件样式对齐 watch 页，使重做后全站与 watch 页一致。保持现有色系（coral/cream/brand），不换设计语言。这是"统一 + 修布局 + 视觉打磨"，不是视觉换肤。

**播放页豁免**：`watch/[id]` 不重做。仅优化：去掉"跟读"标签（ADR-0002）、录音面板文案对齐新定位。统一组件库的样式参考它。

**入口/导航修复**：
- 未登录 `/` → 落地页（营销内容 + 登录/试用入口 → `/login`）。落地页不再孤儿。
- 侧边栏加 profile 入口；移动 tab bar 加 profile/dashboard。
- 全 app 加退出登录按钮（用户端）。
- TopBar 头像渲染图片（不再永远首字母）。
- 头像支持上传（不只是 URL 粘贴）——需后端头像上传端点。

**图片加载修复（随重做一起）**：
- 部署设 `NEXT_PUBLIC_API_URL`（头号修复）。
- 统一 `mediaUrl` 使用（头像、缩略图、社区视频贴都走 mediaUrl）。
- 组件库内迁移 `next/image`（替代裸 `<img>`），配置 `images.remotePatterns`。

**移动优先**：重做页面 mobile-first，修移动端体验。

**管理面板**：UI 现在重做（统一组件），功能性修复（添加视频按钮、UGC 通知、bug 修）无论 UI 是否重做都做。

## Consequences

- 大工作量：用户页（首页/browse/dashboard/profile/community/vocabulary/creator/auth/landing）+ 管理面板全重做。
- watch 页保留，作为风格基准——组件库需先抽 watch 页的样式 token。
- 设计语言延续（同色系），降低重做风险。
- 落地页投入兑现（不再孤儿）。
- 图片加载是系统性修复（env var + mediaUrl + next/image），随组件库统一落地。
- 见 [落地计划](../plans/REDESIGN-2026-07.md) 的分阶段执行。
