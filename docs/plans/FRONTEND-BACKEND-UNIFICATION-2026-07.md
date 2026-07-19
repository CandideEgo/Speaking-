# 前后端统一方案 (2026-07)

> 调研：3 个 Explore agent + 视觉直查。本文为执行方案，分 4 期独立可交付。
> 范围：①后台与用户端视觉 ②API 契约/错误格式 ③品牌与命名 ④认证/会话。

---

## 现状摘要（证据见调研记录）

| 方向 | 核心问题 |
|---|---|
| 视觉 | admin 登录页用裸 `<input>/<button>`+自制暗卡（用户登录用 AuthCard/Button/Input）；`DataTable` 行无 hover；admin 其余已采用共享原语+token |
| API 契约 | 无统一错误 schema（150 处 HTTPException 全 string detail、零错误码）；`payments.py` 同文件 4 种 body；分页标准 `PaginatedResponse` 存在但 vocabulary/learning/notifications/browse 偏离；前端 3 个互相矛盾的分页类型；`ApiClientError.code` 是死字段 |
| 品牌命名 | 代码层干净；DB 凭证 `speaking:speaking_dev`（dev）vs `seeword`（CI）不一致；文档三件套 localStorage key 打架（CLAUDE.md 新 / AGENTS.md+CONTEXT.md 旧）；nginx 残留已删路由的限流规则；README 严重过时；前端无品牌常量（"SeeWord" 硬编码 30 处）；若干 TS 类型与后端 schema 字段不对齐 |
| 认证会话 | 后端已统一（单登录端点/单 refresh/单 blacklist/JWT 无 role claim/`get_admin_user` 仅叠加 role 检查）；前端两个 store 逻辑 70% 重复；`analytics.ts:45` 绕过 store 直读 localStorage；`AdminAuthUser.role?` 类型误导（role 不在 JWT） |

---

## Phase 1 · 品牌与命名统一（低风险快速项）

**目标**：消除品牌/命名分裂，集中品牌常量，修文档与类型对齐。

1. **集中品牌常量**：`frontend/src/lib/siteConfig.ts` 加 `brandName: "SeeWord"`、`userAgent` 常量；替换前端 17 文件 30 处硬编码 "SeeWord" + 后端 `media.py:90`/`seed_official_videos.py:170` 两处 User-Agent 引用常量。
2. **文档三件套对齐**：`AGENTS.md:138` + `CONTEXT.md:67` 的 `speaking_token` -> `seeword_token`（与 CLAUDE.md 一致）。
3. **DB 凭证迁移到 seeword**（用户已确认，需重建 dev DB）：
   - 改 `docker-compose.yml`/`docker-compose.dev.yml` 的 `POSTGRES_USER/PASSWORD/DB` 与 `DATABASE_URL` 为 `seeword/seeword_dev/seeword`。
   - 改 `.env.example:18` + `config.py:206` dev fallback 为 seeword 凭证。
   - **重建 dev DB**（破坏性，dev 数据丢失，可重新 seed）：
     ```
     docker compose -f docker-compose.dev.yml down -v   # 删 speaking-db-1 容器+卷
     docker compose -f docker-compose.dev.yml up -d     # 用 seeword 凭证重建
     alembic upgrade head                                # 重建表
     python scripts/seed_official_videos.py              # 重新灌种子视频
     ```
   - CI `seeword` 不变（已一致）。**注意**：执行前确认 dev DB 无未备份数据。
4. **nginx 死规则**：删 `nginx.conf:73-80` + `nginx.ssl.conf:98-105` 的 `/api/v1/speaking/practice` 限流块（路由已删）。
5. **README 更新**：重写 `README.md` 正文（删已删功能描述、修定价为 ¥9.9/月、修目录树文件名）。
6. **GPU-WORKER-SETUP.md**：`seeword-db-1` -> `Speaking-db-1`（实际容器名）。
7. **TS 类型对齐后端 schema**：
   - `Post` 加 `media_url: string | null`（后端有）
   - `LearningRecord` 加 `time_spent_seconds`/`position_seconds`，去 `user_id`（后端无）
   - `AdminUser` 不再 `extends User`（后端 `AdminUserResponse` 不返回 streak/onboarding）；改为独立 interface
   - `UserPreferences.daily_goal_type` 去掉 `"speaking_attempts"`（后端 `UserPreferencesUpdate` 会 422）
   - `PostType` 加 `"speaking_share"`（与后端 `Literal` 一致，用于历史帖渲染）
   - 删孤儿类型 `UserStats`（types/index.ts:226-239，已删 speaking 评分字段，零消费者）

**验收**：`tsc --noEmit` 0 错；grep "SeeWord" 硬编码 < 5 处（仅常量定义+无法避免处）。

---

## Phase 2 · 认证/会话统一（方案 A：工厂去重，保留双会话）

**目标**：消除两个 auth store 的 70% 重复代码，保留 admin/user 会话隔离安全边界。后端不动。

**不选方案 B（合并会话）**：后端 JWT 无 role claim，合并无后端收益；丧失会话隔离（admin 被 XSS 牵连用户侧）；登录/登出 UX 复杂化。`adminAuthStore.ts:1-9` 注释明确把隔离作为设计目标。

1. **抽 `createAuthStore` 工厂**（`frontend/src/stores/createAuthStore.ts`）：参数化 `{ tokenKey, refreshTokenKey, legacyTokenKeys, loginRedirect, logoutRedirect, onLogoutSideEffects? }`。收敛重复逻辑：`migrateTokenKeys`、`deriveAuthenticated`、mutex `refreshPromise` + `refreshAccessToken`、`login`、`logout`、`initialize/bootstrap`。
2. **`authStore.ts`/`adminAuthStore.ts` 改为薄配置**：各 ~30 行，调工厂 + 各自的重定向/side-effect 差异。
3. **修 `analytics.ts:45`**：`localStorage.getItem("seeword_token")` -> `useAuthStore.getState().token`（恢复 single source of truth）。
4. **修 `AdminAuthUser` 类型**：去 `role?`（JWT 无 role claim，误导）；admin role 判断明确依赖 `/users/me` DB 查询。
5. **`getApiUrl()` 去重**：`api.ts:28-30` 与 `adminApi.ts:26-30` 合并到 `lib/apiUrl.ts`。
6. **`ApiError` vs `AdminApiError`**：评估合并为单类 + `name` 字段区分（或保留，低优先）。

**验收**：`tsc`+`build` 过；手测用户登录/登出/admin 登录/登出/token 刷新/401 重试全正常；两 store 行数合计下降 > 40%。

---

## Phase 3 · 后台与用户端视觉统一

**目标**：admin 控制台与用户端共享设计语言，暗色模式表现一致。

1. **`DataTable` 行 hover**：`components/admin/DataTable.tsx:66` `<tr>` 加 `hover:bg-surface-soft transition-colors`（与用户端 VideoCard hover 语言对齐）。
2. **admin 登录页改亮色对齐用户登录**（用户已确认改亮色）：
   - 用 `<AuthCard>` 替自制暗卡（与 `app/login/page.tsx` 一致）
   - 用 `<Input>` 替裸 `<input>`、`<Button variant="primary">` 替裸 `<button>`
   - 错误处理改用 `apiErrorMessage`（与用户登录一致）
   - 保留"管理后台/仅限管理员登录"文案与 ShieldCheck 图标作为身份区分（视觉与用户登录一致，仅文案标识 admin 入口）
3. **admin 暗色模式走查**：`(admin)` 全 7 页在 `.dark` 下无亮色残留、文本可读（依赖 P1 已迁移的 token；重点查 stats 图表 chart-theme、StatCard、DataTable）。
4. **StatCard 打磨**：delta 正负色（已改 success token）、与用户端 MetricCard 视觉语言对齐。
5. **空态/加载态一致**：admin 列表页用共享 `EmptyState`/`SkeletonCard`（若现用各页自制则统一）。

**验收**：`build` 过；admin 7 页亮/暗双主题目视无残留、无不可读文本；DataTable 行有 hover 反馈。

---

## Phase 4 · API 契约/错误格式统一（最大，内部分两子期）

### 4a · 错误响应 envelope + 错误码

**目标**：后端统一错误形状 `{code, message, detail?}`，前端 `ApiClientError.code` 落地可用。

1. **后端**：
   - `backend/app/core/errors.py` 新建：`ErrorCode` 枚举（`USER_NOT_FOUND`/`INVALID_CREDENTIALS`/`QUOTA_EXCEEDED`/`VIDEO_NOT_FOUND`/`PAYMENTS_DISABLED`/...）+ `AppException(status, code, message)` 基类。
   - `main.py` 注册全局 handler：`AppException` -> `{code, message, detail?}`；`HTTPException` -> 兜底转 envelope（`code` 按 status 推断 `HTTP_400/401/...`，`message`=detail）；`RequestValidationError`(422) -> `{code:"VALIDATION_ERROR", message, detail:[{loc,msg}]}`。
   - **渐进迁移**：新代码用 `raise AppException`；存量 150 处 HTTPException 由全局 handler 兜底（不强制全改，先把 `payments.py` 4 种 body 统一到 envelope）。
2. **前端**：
   - `createApiClient.ts:183` `code = data.code ?? null` 已就绪，无需改。
   - `admin/login/page.tsx` 等可改用 `err.code === "INVALID_CREDENTIALS"` 替代 `err.status === 401` 区分错误种类。
   - `lib/errors.ts` 的 `apiErrorMessage` 读 `err.code` 做更精准的中文映射表。

### 4b · 分页统一

**目标**：所有列表端点走标准 `PaginatedResponse{items, page, page_size, has_more, total?}`，前端单一分页类型。

1. **后端偏离端点归一**：
   - `vocabulary.py:180` `{words, stats}` -> 拆为 `GET /vocabulary` 返回 `PaginatedResponse[VocabularyResponse]` + `GET /vocabulary/stats` 保留（stats 本就不该塞进列表）
   - `learning.py:79` `LearningRecordListResponse{records,total,...}` -> `PaginatedResponse[LearningRecordResponse]`（加 `has_more`，`records`->`items`）
   - `notifications.py:131` 裸数组+limit/offset -> `PaginatedResponse`+page/page_size
   - `browse.py:83` 多余 `category` 字段保留在 item 内或单独字段，envelope 走标准
   - `videos.py:175` search 裸数组 -> `PaginatedResponse`（或显式标非分页）
   - `total` 统一：能算的端点都返回 `total`（前端依赖 total 的有 history/AdminTopbar/invites）
2. **前端类型统一**：
   - `types/index.ts` 统一为单一 `Paginated<T> = {items, page, page_size, has_more, total?: number}`，删 `hooks/usePaginatedList.ts` 的 `PaginatedResponse` 与 `SubtitleRevisionPage`（合并）
   - `history/page.tsx` 去掉手算 `has_more`（后端补上后直接读）
   - `vocabulary/page.tsx` + `vocabularyStore.ts` 统一用 `Paginated<VocabularyWord>`

**验收**：4a 全局错误 handler 生效，`payments.py` 4 种 body 归一；4b 4 个偏离端点归一，前端单一分页类型，`tsc`+`build`+`pytest` 过。

---

## 执行顺序与风险

| 期 | 风险 | 改动面 | 估时 |
|---|---|---|---|
| P1 品牌命名 | 低 | 文档+常量+类型 | 1 轮 |
| P2 认证工厂 | 中（auth 敏感） | 前端 2 store + factory | 1 轮 |
| P3 视觉 | 低 | DataTable+admin 登录+走查 | 1 轮 |
| P4a 错误 envelope | 中高（全局 handler 影响所有错误路径） | 后端 errors.py+main.py+payments + 前端 errors.ts | 1-2 轮 |
| P4b 分页统一 | 中高（多端点+多消费方） | 后端 4 端点+服务层 + 前端类型/store/page | 1-2 轮 |

**建议执行顺序**：P1 → P3 → P2 → P4a → P4b（低风险先清，auth 与 API 高风险后做且可单独审批）。

## 已确认决策

1. **DB 凭证**：迁移到 `seeword`（需重建 dev DB，见 P1-3）。
2. **admin 登录页**：改亮色，用 AuthCard/Button/Input 与用户登录一致（见 P3-2）。
3. **本轮范围**：全部 4 期（P1+P2+P3+P4a+P4b），按建议顺序 P1->P3->P2->P4a->P4b 执行，每期完成后 `check`+`build`/`pytest` 验证并提交一次。
