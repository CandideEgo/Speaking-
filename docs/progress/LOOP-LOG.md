# 前端设计优化循环 — 修改日志

> 长期 `/loop` 任务（每 10 分钟一轮：子 agent 探索 → 执行 → typecheck/lint/build 门禁 → commit）。
> 基线 commit：`3f1dbf6 chore: baseline before frontend optimization loop`
> 范围：用户端 + 管理面板及所有子页面的前端设计，附带沿途发现的后端/安全/性能修复。
> 最近一次同步：2026-07-01

## 循环约定

- 开始前先 commit 基线；每轮结束 commit 一条，保证可回溯。
- 验证门禁：`cd frontend && npx tsc --noEmit` + `pre-commit run prettier --files <files>` + `npm run build`（`npm run lint` / `next lint` 无配置会交互卡死，禁用）。
- prettier 本地 npx 是 v3.8.4，pre-commit hook 是 **v4.0.0-alpha.8**，输出不一致 → 改完文件必须用 `pre-commit run prettier` 格式化再 add+commit。
- 改动前用 GitNexus `impact` 评估爆炸半径，commit 前用 `detect_changes` 校验影响范围。

## 迭代日志

| # | Commit | 主题 | 改动摘要 |
|---|--------|------|----------|
| 1 | `cbfeba7` | watch 练习三合一 | `UnifiedPracticePanel`（词汇/AI/理解 Tab），选择即判分即时揭示答案+解析，header 常驻「收拾」重置；三 hook 收敛到 `graded: Record<number, GradedResult>` |
| 2 | `4152e54` | 管理台原语 | 新建 `Modal`/`ConfirmDialog`/`Badge`；7 处 `window.confirm` 全替换；`REVIEW_BADGE`/`STATUS_LABEL` 及 ~12 处内联 pill 改 `Badge`；删死代码 `AdminNav.tsx` |
| 3 | `eb93051` | 管理台 DataTable | 新建 `components/admin/DataTable.tsx`（overflow+thead 派生 colSpan+expand wiring+empty-state row）；5 表全采用 |
| 4 | `a7b221a` | UI 原语 Button/Card/Input | 新建 `components/ui/{Button,Card,Input}.tsx`；迁移高杠杆调用点；`.btn-*/.card-*/.input-field` 类暂保留 |
| 5 | `b81ac74` | 原语迁移 | VideoManager & WatchPage 迁到 Button/Input/Textarea/Card |
| 6 | `5e66d3e` | LinkButton | 新增 `LinkButton` + `ghostDark`/`icon` variant，迁移 5 个页面脱离 `btn-*` CSS |
| 7 | `b37f6c8` | btn-* 迁移 | 再迁 5 个页面到 Button/LinkButton |
| 8 | `173a4a3` | btn-* 清零 | 所有 `btn-*` CSS 调用点改用 Button/LinkButton |
| 9 | `53d511b` | card-outline 清零 | 所有 `card-outline` 调用点改用 Card 原语 |
| 10 | `e8b4292` | 图标系统统一 | 用 `lucide-react` 替换 526 行自绘 `Icons.tsx`，删死 CSS |
| 11 | `a6dbf5c` | input-field 迁移 | `input-field` CSS → Input/Textarea 组件，17 文件 40 处 |
| 12 | `73fc39b` | Select 组件 | 新建 `Select`，完成 input-field 迁移，删死 CSS |
| 13 | `d81f7b3` | 社区功能 | 视频点赞、UGC 一键种植、创作者导入对话框 |
| 14 | `4711441` | 死 CSS 清理 | globals.css 删 17 个死类 |
| 15 | `ac43829` | TabPills | 抽取 `TabPills`，迁移 `tab-pill` + `fchip` CSS |
| 16 | `98fe25c` | PageHeader | 抽取 `PageHeader`，迁移 `page-head` CSS |
| 17 | `96b62c3` | SectionHeader | 抽取 `SectionHeader`，迁移 `sec-head` CSS |
| 18 | `0137834` | VideoCard | 抽取 `VideoCard`，内联 `vcard` CSS，替换 SVG play 图标 |
| 19 | `44bb9ec` | dashboard 迁 VideoCard | dashboard 改用 VideoCard，globals 删全部 `vcard` CSS |
| 20 | `ec9193d` | 图标 lucide 化 | vocabulary & watch 页内联 SVG → lucide-react |
| 21 | `3c03bd2` | 图标 lucide 化 | 剩余内联 SVG → lucide-react |
| 22 | `b456561` | 图标 lucide 化 | landing 页内联 SVG → lucide-react |
| 23 | `2eacd02` | ProgressRing | 抽取 `ProgressRing`，替换最后一个自绘 SVG，删死 CSS |
| 24 | `fd4b9f6` | Spinner 抽取 | 抽取 `FullPageSpinner` + `InlineSpinner`，迁移 19 处 |
| 25 | `00bb43e` | EmptyState 推广 | 6 个页面采用 `EmptyState`，对齐当前设计系统 |
| 26 | `a352105` | ErrorState | 抽取 `ErrorState`，迁移 6 处错误模式 |
| 27 | `d34d548` | 社区修复 | 社区 tabs、视频用户信息、响应模型、分页 |
| 28 | `e031b00` | MetricCard | 抽取 `MetricCard`，统一 `dash-stat` + `stat-card` |
| 29 | `5f3deae` | 社区性能 | 批量加载用户和点赞，消除 community feed N+1 |
| 30 | `f480c57` | 清理 | 删死代码、修重复类型、加 rate limit |
| 31 | `cacfb11` | 首页门控 | 首页改用 `show_on_homepage` + 22 个端点加 rate limit |
| 32 | `3b4566c` | DB 索引 | 为高频查询列补数据库索引 |
| 33 | `c20068e` | watch 健壮性 | watch 页错误恢复 + 字幕 null 守卫 |
| 34 | `5d0465c` | 生产校验 | 生产配置校验、callback rate limit、ILIKE 转义 |
| 35 | `e9839d6` | Eyebrow+PriceCard | 抽取 `Eyebrow` + `PriceCard`，删 5 个 CSS 类 |
| 36 | `72b3e56` | 外键级联 | 外键加 `ondelete CASCADE/SET NULL` |
| 37 | `5f48764` | TimelineItem | 抽取 `TimelineItem`，删 8 个 `tl-*` CSS 类 |
| 38 | `da856fb` | admin 门控开关 | 视频详情 MetadataForm 加 `show_on_homepage` toggle |
| 39 | `fdfb824` | adminApi 重试 | adminApi 加 5xx 指数退避重试 |
| 40 | `80efc7d` | store 重置 | watchStore/vocabularyStore 加 `reset()`，登出自动重置 |
| 41 | `9cdeaca` | 社区分页 | community feed 查询加 SQL LIMIT/OFFSET，修 undefined 条件 bug |
| 42 | `12dec78` | Celery 健壮性 | order/video 任务错误处理加固 |
| 43 | `77c0b71` | 工具函数抽取 | 抽 `timeAgo`/`avatarColor`/`userInitial`，修 N+1，加 rate limit，WS 黑名单检查 |
| 44 | `4370955` | confirm/竞态 | 替换 `window.confirm`，合并 post type 常量，修 like/favorite 竞态 |
| 45 | `0a55ade` | 安全 | 防视频详情缓存泄漏 owner-only `rejection_reason` |
| 46 | `992dc30` | 安全 | 搜索 LIKE 通配符转义 + API 校验 |
| 47 | `30f5b36` | 类型对齐 | 前端类型与后端 schema 对齐 |
| 48 | `1777395` | watch hook 抽取 | 抽 `WordTooltipInline`/`ExamLevelSelector`/`useVideoMeta` hook |
| 49 | `d095224` | 后端代码质量 | proper import、CASCADE、async Redis |
| 50 | `03b84e9` | 后端原子性 | speaking 消除 double-commit、user-seed-full auto_publish、修 videos/like-status 导入崩溃 |
| 51 | `9c1c1d7` | 上线阻塞 | 容器 entrypoint 自动跑 alembic 迁移 + create_admin 引导脚本 |
| 52 | `470846d` | 法律页降级 | privacy/terms 页主体名称占位从「待补充」改中性「本站运营方」 |
| 53 | `3d02c3c` | stale tests | 修 6 个 stale tests（分页 shape/show_on_homepage/mock 签名/访问控制），全量 317 passed |
| 54 | `b4f2757` | 架构:分页统一 | paginated() helper 统一 9 处手建分页 envelope（P1，结构债审计） |
| 55 | `ca8031d` | 安全 | 密码重置 token O(n) bcrypt 全表扫描 → O(1) 索引查找（token_lookup SHA-256 列+迁移） |

## 主题汇总

### UI 原语体系（迭代 2–12）
从零搭起组件原语层：`Button`/`Card`/`Input`/`Textarea`/`Select`/`LinkButton`/`Modal`/`ConfirmDialog`/`Badge`/`DataTable`，并完成 `btn-*`、`card-outline`、`input-field` 三大 legacy CSS 类的**全量迁移清零**。原语带 variant/size 系统，吸收了野外 `!py/!px/!text` 覆盖组合。

### 组件抽取（迭代 15–19, 23–26, 28, 35, 37）
把重复的页面级模式抽成共享组件：`TabPills`、`PageHeader`、`SectionHeader`、`VideoCard`、`ProgressRing`、`FullPageSpinner`/`InlineSpinner`、`EmptyState`、`ErrorState`、`MetricCard`、`Eyebrow`/`PriceCard`、`TimelineItem`。每抽一个就迁移所有调用点并删对应 globals.css 类。

### 图标系统统一（迭代 10, 20–22）
526 行自绘 `Icons.tsx` 全部替换为 `lucide-react`，所有页面内联 SVG 也统一到 lucide。死 CSS 一并清除。

### 性能（迭代 29, 32）
community feed 批量加载用户/点赞消除 N+1；为高频查询列补数据库索引。

### 安全（迭代 45–46, 34）
视频详情缓存不再泄漏 owner-only `rejection_reason`；搜索 LIKE 通配符转义防注入；API 入参校验；生产配置校验 + callback rate limit。

### 社区功能（迭代 13, 27, 41）
视频点赞、UGC 一键种植、创作者导入对话框；社区 tabs/分页/响应模型修复；feed 查询补 SQL LIMIT/OFFSET。

### 后端/任务健壮性（迭代 36, 38–40, 42–44, 49）
外键 CASCADE/SET NULL；admin `show_on_homepage` toggle；adminApi 5xx 重试；store 登出重置；Celery 任务错误处理；WS 黑名单检查；like/favorite 竞态修复；后端代码质量（proper import、async Redis）。

### watch 页 hook 化（迭代 48）
抽 `WordTooltipInline`/`ExamLevelSelector`/`useVideoMeta`。

## 后续路线

1. 接入 `useSpeakingRecorder` 到 WatchPage，删原内联录音逻辑。
2. 失效暗色模式：配 `darkMode` + `.dark` 覆盖，或移除 TopBar 死切换按钮。
3. 清 legacy 颜色别名（`cream-*/navy/olive/coral/teal/accent-amber`）与 legacy 组件类（`.btn-secondary/.card-cream/.tab-category`）。
4. 管理台抽 `FormField`（VideoManager VideoDetailRow 与 videos/[id] MetadataForm 近重复）；VideoManager 迁 `SectionCard` 统一 wrapper。
5. 管理台加移动端导航（`AdminSidebar` 现 `hidden md:flex` 无 fallback）。
6. 删死代码疑似未用 `components/player/*`。
7. recharts 颜色 token 化（`stats/page.tsx` 硬编码 `#ededed/#71717a/#5db8a6`）；admin `StatCard` 与 dashboard `.dash-stat` 统一。
8. 修复 6 个 stale tests（test_videos/test_browse_comments/test_practice_questions 断言旧响应形状）。
9. email_service 接真实 SMTP/SendGrid（生产环境密码重置/邮箱验证当前不可用）。
10. 密码重置 token O(n) bcrypt 全表扫描 → hash 索引查找。
11. 支付回调 user plan 升级竞态 → user 行级锁。
12. WebSocket 加心跳/超时。

关联记忆：`frontend-design-optimization-loop`、`bugfix-rounds-1-7`、`optimization-roadmap`、`round3-todo`。
