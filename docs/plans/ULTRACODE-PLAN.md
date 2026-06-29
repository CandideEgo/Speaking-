# Speaking 项目 Ultracode 评估与改进计划

> **COMPLETED** — All 10 phases finished. This document is retained for historical reference only.

## 背景

对 Speaking 项目进行了全栈代码审计，发现 **76 个问题**，从生产崩溃 Bug 到无障碍性缺陷。本计划将它们组织为 10 个阶段，通过 ultracode 多 agent 工作流系统化解决。

**用户决策**:
- ✅ **全部 10 个阶段** — 覆盖所有 76 个问题
- ✅ **API Key 轮换** — 用户手动处理
- ✅ **PyJWT 迁移** — 已批准，现有 token 失效可接受

**设计方向修正**: 项目设计文档 (`../design/DESIGN-claude.md`) 明确采用 **暖奶油色浅色设计** — 以 `#faf9f5` 为画布底色，珊瑚色 `#cc785c` 为主强调色，暖墨色 `#141413` 为文字色。深色表面（`#181715`）仅用于特定产品模拟卡片（代码编辑器、模型展示），**不是全局深色主题**。因此原计划中 Phase 8 的"实现深色模式"修正为"统一设计 token，移除硬编码色值"。

---

## Phase 0: 人工前置事项（无 Agent）

在代码 agent 运行之前，以下需要人工操作：

1. **轮换 Agnes AI API Key** `sk-<REDACTED>` — 在 commit `57bbdf9` 中通过 `.env.example` 暴露。从 Agnes AI 控制台生成新密钥，更新生产环境变量，使旧密钥失效。
2. **清除 git 历史** 使用 BFG Repo Cleaner 从所有历史提交中删除已提交的密钥。
3. **替换 `.env.example` 密钥** 为占位符 `your-api-key-here`。
4. **确认 Redis 密码** 与 `docker-compose.prod.yml` 命令和健康检查匹配。

---

## Phase 1: 生产崩溃拦截器（3 agents）

修复会导致立即运行时崩溃或数据损坏的问题。

| # | 问题 | 文件 |
|---|------|------|
| 2 | `settings.csp_connect_domains` 不在 Settings 类中 → 每个请求 AttributeError | `config.py`, `main.py:76` |
| 5 | `Video` 模型缺少 `comment_quality_score`/`comment_count` 列 → AttributeError | `models/video.py` |
| 4 | Redis 健康检查损坏（无密码但有 requirepass）→ 后端无法启动 | `docker-compose.prod.yml:26` |
| 6 | `VideoCreate` schema 拒绝抖音/TikTok/Twitter URL → 合法输入返回 422 | `schemas/video.py:17-20` |

**Agents**:
- **1A**: 在 `config.py` 的 `Settings` 中添加 `csp_connect_domains: str = ""`，验证 `main.py` CSP 中间件正常工作
- **1B**: 在 `Video` 模型中添加 `comment_quality_score`/`comment_count` 映射列；扩展 `VideoCreate` URL 验证器以接受 `platform_utils.py` 中所有平台域名
- **1C**: 修复 Redis 健康检查为 `redis-cli -a ${REDIS_PASSWORD} ping`

**验证**: 后端启动无 AttributeError；ORM 新列可正常读写；`docker compose config` 验证通过；抖音 URL 在 `/api/v1/videos` 被接受

---

## Phase 2: 安全与认证修复（4 agents）

修复认证漏洞、依赖 CVE 和注入风险。

| # | 问题 | 文件 |
|---|------|------|
| 8 | 未维护的 `python-jose` 有 CVE → 替换为 `PyJWT` | `requirements.txt`, `core/security.py` |
| 9 | 未维护的 `passlib` 冗余 → 移除，直接使用 `bcrypt` | `requirements.txt`, `core/security.py` |
| 7 | 迁移 `fa70252cc1d8.py:82` 中 SQL 注入（f-string SQL） | `migrations/versions/fa70252cc1d8.py` |
| 35 | 支付回调返回 401（网关回调语义错误） | `api/v1/payments.py` |
| 13 | `get_current_user` 中计划到期降级是未提交的副作用 | `api/dependencies.py:31-34` |
| 41 | 不安全的开发 JWT 密钥 | `core/config.py:81` |
| 58 | `TopBar.tsx` 中脆弱的 JWT 解析（`atob` 无验证） | `TopBar.tsx:48-53` |

**Agents**:
- **2A**: 用 `PyJWT` 替换 `python-jose`；移除 `passlib`；更新 `create_token`/`decode_token`
- **2B**: 修复迁移中 SQL 注入（参数化查询）；修复 `.env.example` 占位符
- **2C**: 修复支付回调语义（无效签名返回 200+错误负载，非 401）；提交 `get_current_user` 中的计划降级
- **2D**: 修复 `TopBar.tsx` 中 JWT 处理 — 安全解码、过期检查、错误处理

**验证**: `pytest tests/test_auth.py` 通过；`pip audit` 无关键 CVE；迁移顺利应用；无效签名支付回调返回 200

---

## Phase 3: 后端健壮性与性能（4 agents）

修复查询模式、服务架构和数据完整性问题。

| # | 问题 | 文件 |
|---|------|------|
| 10 | 说话人识别和翻译循环中的 N+1 查询 | `video_processing.py:58-78, 132-144` |
| 11 | 加载所有评论到内存用于计数 | `comments.py:119-122` |
| 12 | `LearningRecord(user_id, video_id)` 缺少唯一约束 | `models/learning.py` |
| 29 | AIService 每次调用实例化（无单例） | `speaking_service.py:33` |
| 30 | OpenAI 调用无重试/超时 | `ai_service.py:19-32` |
| 31 | Celery 任务中 `asyncio.run()` 反模式 | `video_processing.py:173`, `comment_analysis.py:56` |
| 32 | Celery 任务无重试延迟 | `video_processing.py:83, 183` |
| 28 | 业务逻辑泄漏到路由处理器 | `speaking.py`, `vocabulary.py`, `videos.py` |
| 33 | 重复的 `extract_youtube_video_id` | `videos.py:20`, `video_processing.py:21` |
| 34 | 重复的 AI 服务单例模式 | `ai.py:14-21`, `video_processing.py:33-40` |

**Agents**:
- **3A**: 修复 N+1 查询（批量获取）；修复评论计数（`SELECT COUNT(*)`）；添加唯一约束迁移
- **3B**: 提取业务逻辑到服务层（`video_service.py`，整合词汇逻辑）；去重 `extract_youtube_video_id` 到 `platform_utils.py`
- **3C**: 修复 AIService 单例；用 `tenacity` 添加重试+超时；修复 `asyncio.run()` 模式
- **3D**: 添加 Celery 重试延迟；统一 AI 服务单例

**验证**: 字幕批次 O(1) 查询；并发首次查看无重复记录；瞬态故障有重试

---

## Phase 4: 前端架构与去重（5 agents）

修复阻碍安全功能开发的前端结构性问题。

| # | 问题 | 文件 |
|---|------|------|
| 19 | 8 个重复的 `Subtitle` 接口定义 | 8 个组件文件 |
| 23 | `.map()` 回调中的 `useMemo`（无效 hooks） | `SubtitleList.tsx:198` |
| 24 | 无 auth store（分散的 localStorage + useEffect） | 多个页面 |
| 50 | 4 个模式组件中重复的句子导航 | `DictationMode`, `FillBlankMode`, `TranslateMode`, `ReadingMode` |
| 51 | 6 个文件中重复的 SpeechSynthesis 样板代码 | 6 个组件文件 |
| 61 | 重复的 `formatTime`/`formatDuration` 工具函数 | `utils.ts`, `format.ts`, `VideoThumbnail.tsx` |
| 20 | 483 行 watch 页面含 15 个状态变量 | `watch/[id]/page.tsx` |
| 52 | 无组件使用 `React.memo` | 所有展示组件 |
| 53 | SubtitleList 中 O(n²) `indexOf` | `SubtitleList.tsx:196` |
| 21 | 所有 12 个页面都是 `'use client'` | 所有页面文件 |
| 22 | 无路由有 `generateMetadata` | 所有页面文件 |

**Agents**:
- **4A**: 合并 `Subtitle` 类型（单一来源在 `@/types`）；提取 `useSpeech` hook；提取 `useSentenceNavigation` hook；合并格式化工具
- **4B**: 修复 `.map()` 中的 `useMemo`（移到子组件）；修复 O(n²) `indexOf`；为叶组件添加 `React.memo`
- **4C**: 创建 Zustand auth store（`useAuthStore`）含 token 存储、JWT 解码、过期、登录/登出；替换分散的 `getToken()` 模式
- **4D**: 分解 watch 页面 — 提取 `useVideoPlayer`、`useQuiz`、`useWordLookup` hooks；目标 <150 行
- **4E**: 为公共页面添加 `generateMetadata`；添加 `loading.tsx`/`not-found.tsx`；尽可能将 layout 转为 server component

**验证**: `npx tsc --noEmit` 通过；`npm run build` 成功；无重复 Subtitle 接口；watch 页面 <150 行；server components 无 hydration mismatch

---

## Phase 5: Feed 路由整合与 API 一致性（3 agents）

整合重复的 feed 路由，标准化 API 模式。

| # | 问题 | 文件 |
|---|------|------|
| 14 | 三个几乎相同的 feed 路由文件 | `bilibili.py`, `community.py`, `douyin.py` |
| 60 | 社区页面重复 `usePlatformFeed` 逻辑 | `community/page.tsx:58-93` |
| 17 | 大多数端点缺少速率限制 | 多个路由文件 |
| 47 | 分页模式不一致 | 多个端点 |

**Agents**:
- **5A**: 创建 `feed_base.py` 工厂；将 3 个 feed 路由重写为薄包装；提取共享缓存工具
- **5B**: 修复社区页面使用 `usePlatformFeed`；标准化分页（`page`/`page_size`/`has_more`）
- **5C**: 为未保护端点添加速率限制；创建分页基础 schema

**验证**: 所有 feed 端点返回相同结构；社区页面使用 hook；所有分页端点一致；8+ 端点有速率限制

---

## Phase 6: Docker、Nginx 与生产加固（4 agents）

修复部署基础设施以安全部署到生产环境。

| # | 问题 | 文件 |
|---|------|------|
| 3 | Backend Dockerfile 无多阶段构建（~2GB+ 镜像） | `backend/Dockerfile` |
| 18 | 生产环境前端端口暴露到主机 | `docker-compose.prod.yml:101` |
| 42 | Nginx 缓存区在使用后声明（解析错误） | `nginx.conf:81, 139` |
| 43 | 生产 nginx 配置无 SSL | `nginx.conf` |
| 44 | `alembic.ini` 硬编码开发数据库 URL | `alembic.ini:3` |
| 45 | `.env.example` 缺少环境变量 | `.env.example` |
| 68 | 后端无 `.dockerignore` | （新文件） |
| 69 | `docker-compose.prod.yml` 无日志轮转 | `docker-compose.prod.yml` |
| 72 | 健康检查过于简单（无 DB/Redis 检查） | `main.py` |
| 75 | 生产 `requirements.txt` 中有测试依赖 | `requirements.txt` |
| 76 | `faster-whisper`、`whisperx` 版本未固定 | `requirements.txt` |

**Agents**:
- **6A**: 多阶段后端 Dockerfile；从生产 compose 中移除前端端口暴露
- **6B**: 修复 nginx.conf（将 `proxy_cache_path` 移到使用之前；配置 SSL 块）；修复 `alembic.ini` 环境变量覆盖
- **6C**: 添加 `.dockerignore`；添加日志轮转；拆分 `requirements-dev.txt`；固定未固定版本
- **6D**: 升级健康端点（DB `SELECT 1`、Redis `PING`）；用所有缺失变量更新 `.env.example`

**验证**: Docker 镜像 <1GB；`nginx -t` 通过；`docker compose config` 验证；健康端点返回 DB/Redis 状态；生产 requirements 无测试依赖

---

## Phase 7: 可观测性与测试（4 agents）

建立适当的监控和测试覆盖率。

| # | 问题 | 文件 |
|---|------|------|
| 27 | 17 个文件使用原始 `logging` 而非 `structlog` | 多个后端文件 |
| 70 | 无 Celery 监控（Flower） | `docker-compose.prod.yml` |
| 71 | 无指标端点（Prometheus） | `main.py` |
| 73 | 无 E2E 测试 | （新建） |
| 74 | AI、评论、feeds、上传、Celery 任务、服务零测试覆盖 | `tests/` |
| 15 | CI 无安全扫描 | `.github/workflows/ci.yml` |
| 16 | CI 无测试覆盖率强制 | `.github/workflows/ci.yml` |

**Agents**:
- **7A**: 将所有 17 个文件迁移到 `structlog`；为 Celery 日志添加 request_id 绑定
- **7B**: 在生产 compose 中添加 Flower；通过 `prometheus-fastapi-instrumentator` 添加 `/metrics`
- **7C**: 在 CI 中添加 `pip-audit` + `bandit`；为 pytest 添加 `--cov-fail-under=30`
- **7D**: 为关键路径编写测试（认证、视频提交、口语评估、支付回调）；添加 Playwright E2E 存根

**验证**: 所有日志为结构化 JSON；`/metrics` 返回 Prometheus 数据；CI 运行安全扫描+覆盖率门禁；≥30% 覆盖率

---

## Phase 8: UI/UX 与设计系统统一（4 agents）

修复影响可用性、可访问性和视觉一致性的用户界面问题。

**重要设计方向**: 项目采用暖奶油色浅色设计（参考 `../design/DESIGN-claude.md`），深色表面仅用于特定产品模拟卡片，**不是全局深色主题**。本阶段重点是统一设计 token、替换硬编码色值、修复可访问性，而非实现深色模式。

| # | 问题 | 文件 |
|---|------|------|
| 25 | 频道组件使用硬编码色值而非设计 token（原描述"无深色模式"修正为"未使用设计系统"） | 所有频道组件 |
| 26 | 大范围可访问性问题（缺少 aria-labels、div onClick、无键盘导航） | 多个组件 |
| 49 | YouTube 组件中 4 个 `any` 类型 | `YouTubePlayer.tsx`, `YouTubeSearch.tsx` |
| 54 | API 客户端无请求取消 | `lib/api.ts` |
| 55 | 无集中式错误处理/重试 | `lib/api.ts` |
| 56 | localStorage 中的 token 无刷新机制 | `lib/api.ts` |
| 59 | API 调用无一致的加载状态 | 多个页面 |
| 62 | 频道组件不使用 Tailwind 设计 token（原描述"无 dark: 变体"修正为"未采用设计系统"） | 频道组件 |
| 63 | 硬编码十六进制色值破坏设计系统（`#0f0f0f`、`#f2f2f2`、`#00aeec`、`#fb7299` 等） | 频道组件 |
| 64 | Tailwind 类中 `!important` 覆盖 | 多个组件 |

**设计 token 映射**（根据 `../design/DESIGN-claude.md`）:
```
硬编码色值 → 设计 token 替换:
#0f0f0f      → ink (#141413)
#606060      → muted-foreground (#6c6a64)
#f2f2f2      → cream-soft (#f5f0e8)
#18191c      → navy (#181715)
#9499a0      → muted-soft (#8e8b82)
#00aeec (B站蓝) → coral/品牌色（或保留为平台标识色，用 accent-teal）
#fb7299 (B站粉) → coral-active（或保留为平台标识色）
```

**Agents**:
- **8A**: **统一设计 token** — 替换所有硬编码十六进制色值为 Tailwind 设计 token（`bg-canvas`、`text-ink`、`bg-cream-card` 等）；移除 `darkMode: "class"` 配置和 `.dark` CSS 变量（设计不需要全局深色主题）；确保所有组件使用设计系统 token 而非内联色值；平台标识色（B站蓝、抖音红）可作为 accent token 保留但需归入 token 体系
- **8B**: 修复可访问性 — 图标按钮添加 aria-label；`div onClick` 替换为 `button`；添加键盘导航；focus-visible 环
- **8C**: 修复 API 客户端 — `AbortController` 支持；集中式错误处理与重试；一致的加载状态；移除 `!important`
- **8D**: 修复 TypeScript — 用正确接口替换 `any` 类型；添加 JWT 过期检测 + 重定向

**验证**: 所有页面正确渲染暖奶油色浅色设计；无硬编码十六进制色值（grep 验证）；`axe` 审计零关键违规；`tsc --noEmit` 无 `any` 错误；请求取消正常工作；过期 token 重定向

---

## Phase 9: 支付与业务逻辑加固（3 agents）

修复支付系统完整性缺陷和剩余代码质量问题。

| # | 问题 | 文件 |
|---|------|------|
| 36 | 硬编码支付金额，无计划验证 | `payments.py:108` |
| 37 | 生产代码中的模拟支付端点 | `payments.py:132-157` |
| 38 | 重复的视频访问控制逻辑（5 处重复） | `videos.py`, `comments.py` |
| 39 | 行内 schema 绕过 Pydantic 验证 | `comments.py:21-57` |
| 46 | Rubrics 路由未在 main.py 中注册 | `main.py` |

**Agents**:
- **9A**: 创建计划定义注册表；对 `create_order` 进行验证；将模拟端点提取到仅测试模块
- **9B**: 提取视频访问控制依赖；将行内评论 schema 转为 Pydantic 模型
- **9C**: 在 `main.py` 中注册 rubrics 路由；验证端点工作

**验证**: 无效计划返回 400；模拟端点在生产返回 404；共享访问控制依赖；rubrics 端点返回 200

---

## Phase 10: 文档与清理（2 agents**

更新所有文档以匹配重构后的代码库。

| # | 问题 | 文件 |
|---|------|------|
| 48 | 过时文档 | `SECURITY.md`, `PRODUCTION.md`, `PROGRESS.md` |
| 65 | 无 `loading.tsx` 文件 | （新文件） |
| 66 | 任何级别无 `not-found.tsx` | （新文件） |
| 67 | 侧边栏 hydration 不匹配风险 | `SidebarProvider.tsx` |

**Agents**:
- **10A**: 更新三个文档文件以反映当前架构、安全状态、部署流程
- **10B**: 添加 `loading.tsx`/`not-found.tsx`；用 `suppressHydrationWarning` 修复侧边栏 hydration

**验证**: 所有文档描述的端点存在；自定义 404 渲染；加载骨架渲染；无 hydration 警告

---

## 执行策略

### 依赖图
```
Phase 0 (人工) → Phase 1 → Phase 2 → Phase 3 ─┬→ Phase 5 → Phase 9
                              ├→ Phase 4 ────────┤       ↓
                              └→ Phase 6 ────────┼→ Phase 7
                                                  └→ Phase 8
                                                        ↓
                                                   Phase 10
```

### 并行化
- **Phase 2 之后**: Phase 3、4、6 可**并发**运行
- **Phase 3+4 之后**: Phase 5、7、8 可开始（7 需要 3+6，8 需要 4+5）
- **Phase 10** 在所有代码变更稳定后最后运行

### Agent 总估算
~37 次 agent 运行，横跨 10 个阶段。每个阶段内使用并行 agents。

### 建议起始点
**Phase 0 + Phase 1** 优先 — 崩溃拦截器使应用在生产环境无法运行。然后 Phase 2 修复安全。之后 Phase 3/4/6 可并行以获得最大吞吐量。

---

## 关键文件清单

| 文件 | 涉及阶段 |
|------|---------|
| `backend/app/core/config.py` | Phase 1 (csp_connect_domains), Phase 2 (JWT 密钥) |
| `backend/app/models/video.py` | Phase 1 (ORM 列), Phase 9 (访问控制) |
| `backend/app/schemas/video.py` | Phase 1 (URL 验证器) |
| `backend/app/core/security.py` | Phase 2 (PyJWT 迁移) |
| `backend/app/tasks/video_processing.py` | Phase 3 (N+1, asyncio, 重试) |
| `backend/app/api/v1/payments.py` | Phase 2 (回调语义), Phase 9 (计划验证) |
| `backend/app/api/v1/bilibili.py` | Phase 5 (feed 工厂) |
| `backend/app/api/v1/community.py` | Phase 5 (feed 工厂) |
| `backend/app/api/v1/douyin.py` | Phase 5 (feed 工厂) |
| `docker-compose.prod.yml` | Phase 1 (Redis), Phase 6 (Docker 加固) |
| `backend/Dockerfile` | Phase 6 (多阶段构建) |
| `nginx.conf` | Phase 6 (缓存区顺序, SSL) |
| `.github/workflows/ci.yml` | Phase 7 (安全扫描, 覆盖率) |
| `frontend/src/app/(main)/watch/[id]/page.tsx` | Phase 4 (分解) |
| `frontend/src/components/subtitle/SubtitleList.tsx` | Phase 4 (useMemo, indexOf) |
| `frontend/src/lib/api.ts` | Phase 8 (取消, 错误处理) |
| `frontend/src/components/channel/VideoCard.tsx` | Phase 8 (设计 token) |
| `frontend/src/components/channel/ShortsRow.tsx` | Phase 8 (设计 token) |
| `frontend/src/app/globals.css` | Phase 8 (移除 dark 变量) |
| `frontend/tailwind.config.ts` | Phase 8 (移除 darkMode) |
| `frontend/src/components/TopBar.tsx` | Phase 2 (JWT), Phase 4 (auth store) |
