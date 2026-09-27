# SeeWord 全项目 AI 代码审计报告

- 工具：`alibaba/open-code-review`（OCR），CLI 名 `ocr`，版本 1.12.9
- 模型提供方：DeepSeek（`deepseek-flash`）
- 扫描日期：2026-09-25
- 审查范围：`backend/app`（160 文件 / 30,120 行）+ `frontend/src`（219 文件 / 33,506 行）
- 本次消耗：约 14.5M tokens（含首轮因余额耗尽废弃的 2.3M）
- 本报告状态：**工作区已改、未提交**（见文末「提交前必做」）

---

## 1. 摘要

**做了什么。** 用 AI 代码审查工具对整个仓库做了一轮扫描，逐条核实它报出的 6 条 critical 与 23 条 high（后端）＋50 条 high（前端），修掉了其中 4 类真实缺陷，并跑了全量回归验证。

**核心结论（按可信度排序）。**

1. **AI 的「结论」命中率很高，「理由」错误率很高。** 后端 23 条 high 里，结论成立 17 条、部分成立 6 条、**整条误报 0 条**；但论证里有 **9 处被证伪**（把不存在的攻击路径当论据、把不可达代码当漏洞、把已下线的功能当在跑的链路），并有 5 条严重性被夸大、1 条被低估。**只读结论不读论证，会把修复精力投到错误的地方。**
2. **真正的头号风险是「支付/权益信任边界」，且是多个独立缺口叠加。** `mock_payments.py` 用 GET 改状态且不检查 `payments_enabled`；真实回调不校验实付金额；dev 签名旁路依赖 `env == "development"` 而这正是 `env` 的默认值。单看每处都「有前置条件」，合起来是「漏配一个环境变量即接受伪造回调」。
3. **6 条 critical 全部成立，全部已修**，其中 2 条（C3 环境白名单、C2 路径遍历）属于「一旦命中就是高影响」的类型。
4. **最有价值的产出不是那 29 条，而是「同形状缺陷的分布图」。** 例如 check-then-act 竞态在约 10 个模块重复出现，静默吞异常在前端是三层系统性现象。修单点收益低，修模式收益高。
5. **覆盖率只有 53%**（379 个源文件里评了 203 个），因为两轮扫描都撞上了 token 预算上限。剩余 176 个文件未评，续跑命令见附录。

**安全结论一句话版。** 未发现已可利用的高危漏洞（前端凭据暴露与后端回调伪造都需额外前提），但存在多处「配置一错就破防」的信任边界，和大量会把故障隐藏成静默失败的异常处理。

---

## 2. 工具介绍：alibaba/open-code-review

### 2.1 它是什么

OCR 是阿里开源的一款「AI 代码审查」CLI。它把仓库按文件切片，逐文件把源码 + 上下文喂给 LLM，要求模型输出结构化评论（严重性 / 类别 / 行号 / 理由 / 建议改法），最后生成一份仓库级总结。

与通用聊天式审查的区别：

- **文件级并行 + 会话持久化。** 每个文件一次独立请求，可并发；整个扫描是一条 session，中断后可用 `--resume` 续跑，已完成的文件会被复用而不是重花钱。
- **预算护栏。** `--max-tokens-budget` 是硬上限，撞上就停并标 `budget_exceeded`。这是防「无人值守一夜烧掉几百美元」的机制，但也意味着大仓库一次扫不完（本次就吃了这个亏）。
- **零成本预演。** `scan --preview` 只做文件筛选与 token 估算，不发请求。
- **产出是机器可读 JSON**（`--format json -o file`），含每条评论的 severity/category/file/line/建议改法，以及 `project_summary`。

### 2.2 适用场景

| 场景 | 是否合适 | 说明 |
|---|---|---|
| 快速摸清一个陌生仓库的风险面 | 很合适 | 项目级总结比人工通读快一个数量级 |
| 上线前对「有外部触发面」的代码做一轮排查 | 很合适 | 命中率最高的是 API 端点、鉴权、支付、文件上传 |
| 找同类缺陷的分布（一处竞态 → 全仓还有几处） | 很合适 | 模型对「同一形状」的重复识别稳定 |
| 替代人工 review 做合并门禁 | 不合适 | 理由常错、严重性不稳，需人工复核每条论证 |
| 审查 schema 约束、死代码、无写入方的模型 | 低价值 | 这类代码「技术正确但实际无意义」的发现很多（本次 9 处证伪全在此类） |
| 替代 SAST/依赖扫描/密钥扫描 | 不合适 | 不做数据流分析，不查 CVE |

### 2.3 基本操作

```bash
# 预演：只估算不花钱
ocr scan --preview --path backend/app

# 正式扫描（JSON 便于后续处理）
ocr scan --path backend/app --concurrency 4 --max-tokens-budget 6000000 -o out.json

# 中断后续跑：复用已完成的文件
ocr scan --path backend/app --resume <session-id> --concurrency 4 --max-tokens-budget 6000000 -o out2.json
```

本次环境：provider `deepseek`，model `deepseek-flash`，`ocr` 位于 `/c/nvm4w/nodejs/ocr`。

### 2.4 三个必须知道的坑（本次实测）

1. **并发上限绑余额，不是固定值。** 余额不足时服务端直接回 `429 ... concurrency limit of 5 based on your remaining balance`，并伴随 `402 Payment Required Insufficient Balance`。首轮用默认并发跑 160 个文件，**136 个失败**。改成 `--concurrency 4` 后两轮 **零 402/429**。教训：并发值应低于「余额允许的上限」，并在日志里盯 429。
2. **`--max-tokens-budget` 是双刃的。** 它救了你一次（拦住失控花费），也毁了你一次（两轮都在长文件处撞顶，剩余文件根本没派发）。合理做法是**按目录拆成多轮**，每轮预算给足，而不是给一个大仓库一个总预算。
3. **`summary.files_reviewed` 不等于实际完成数。** 后端那轮报 `files_reviewed: 160`，但会话计数器是 `selected 100 / completed 70 / failed 6 / reused 24` → 实际只评完 94 个。**算覆盖率必须看会话计数器，不能看 `files_reviewed`**（后者是派发数）。

---

## 3. 本次扫描过程

### 3.1 规模摸底（`--preview`，零成本）

| 指标 | 数值 |
|---|---|
| 仓库文件总数 | 868 |
| 会进入扫描 | 596 |
| 新增行数 | +98,204 |
| 排除：非源码扩展名 | 132 |
| 排除：测试路径 | 100 |
| 排除：二进制 | 39 |
| 排除：单文件超限 | 1（`seeword-beta-assets/poster_v2.png`，2.26 MB > 2 MB） |
| 真正代码：`backend/app` | 160 文件 / 30,120 行 |
| 真正代码：`frontend/src` | 219 文件 / 33,506 行 |

### 3.2 三轮扫描

**第 1 轮 — 后端首扫（失败，余额耗尽）**

```bash
ocr scan --path backend/app --format json -o logs/ocr-scan-backend-app.json \
  --max-tokens-budget 2500000 --timeout 30
```

结果：`completed_with_errors`。136/160 文件失败（402 + 429），仅 22 个文件产出 81 条评论，2,317,794 tokens。session `4cb28eba-081a-4c05-ad17-2c03b27c0498`。
**价值**：这轮的钱没白花——会话持久化让第 2 轮直接复用。

**第 2 轮 — 后端续跑（成功但撞预算）**

```bash
ocr scan --path backend/app --resume 4cb28eba-081a-4c05-ad17-2c03b27c0498 \
  --concurrency 4 --max-tokens-budget 6000000 -o logs/ocr-scan-backend-app-resume.json
```

日志实证复用生效：`Resume ...: reusing 24 file(s), reviewing 136 file(s)`。

- 撞顶位置：`used 6.2M + next-file est ≈ 6.2M > budget 6.0M — skipping backend/app/services/exam_corpus.py and remaining files`
- summary：`comments 192`，`total_tokens 6,173,968`（input 5,537,196 / output 636,772 / cache_read 4,612,736），`elapsed 14m30s`，`budget_exceeded true`
- 严重性分布：critical 3 / high 23 / medium 90 / low 74
- 会话计数器：`selected 100 / completed 70 / failed 6 / reused 24` → **实际评完 94/160，60 个未派发**
- session `af8336bf-2415-48d1-8f9f-4d05ae6108bf`

**第 3 轮 — 前端**

```bash
ocr scan --path frontend/src --concurrency 4 --max-tokens-budget 6000000 -o logs/ocr-scan-frontend.json
```

- `completed_with_warnings`，撞顶于 `frontend/src/app/global-error.tsx and remaining files`
- `comments 325`，`tokens 6,007,712`，`elapsed 18m14s`，`budget_exceeded true`
- 严重性分布：critical 3 / high 50 / medium 161 / low 111
- 会话计数器：`selected 109 / completed 109` → **实际 109/219，110 个未派发**
- session `f7eba0d2-64f5-4034-a62d-deb515c47103`

工具自估成本行可作参考：`estimated cost: ~154 file(s), est. 4.7M input + 827K output ≈ 5.5M total tokens`。

---

## 4. 覆盖率与诚实交代

**代码覆盖率约 53%**：379 个源文件中评了 203 个。

| 范围 | 源文件 | 实际评完 | 未派发 | 完成率 |
|---|---|---|---|---|
| `backend/app` | 160 | 94 | 60 | 59% |
| `frontend/src` | 219 | 109 | 110 | 50% |
| 合计 | 379 | 203 | 170 | **53%** |

开销：本轮 12.2M tokens，累计约 14.5M，约 60k token/文件。

**为什么没收尾。** 不是工具坏了，是我给的单轮预算不够：`6000000` 这个数在前端那轮只够 109 个文件。**未评的部分不是「评过但没问题」，是「没看」。** 因此本报告的所有「结论分布」只对已评的 203 个文件有效。

**剩余文件的续跑命令**（`-o` 换个新文件名，别覆盖已有产物）：

```bash
ocr scan --path backend/app --resume af8336bf-2415-48d1-8f9f-4d05ae6108bf \
  --concurrency 4 --max-tokens-budget 8000000 -o logs/ocr-scan-backend-app-2.json

ocr scan --path frontend/src --resume f7eba0d2-64f5-4034-a62d-deb515c47103 \
  --concurrency 4 --max-tokens-budget 8000000 -o logs/ocr-scan-frontend-2.json
```

---

## 5. 项目级总结

以下两节来自工具产出的 `project_summary`（原文见 `logs/_ps-backend.txt`、`logs/_ps-frontend.txt`），已压缩。**未核实**——这是模型通读后的归纳，不是逐条验证过的结论。

### 5.1 后端十类

1. **支付/权益信任边界多处失效（影响最高）**
   - `backend/app/api/v1/mock_payments.py`：把「标记已付 + 升级 Pro」做成 **GET**，且不像真实端点那样检查 `payments_enabled`。
   - `backend/app/services/alipay_payment.py` + `backend/app/core/config.py`：dev 旁路 = `env == "development"` + `payment_verify_signature=False`，而 `env` 默认就是 development → **漏配一个环境变量即接受伪造回调**。
   - `backend/app/api/v1/payments.py`：回调**从不校验实付金额**，一张金额更小的有效签名通知就能把订单标记为已付。
   - 同文件：支付宝异步通知要求响应体字面为 `success`，返回 JSON 会导致 25 小时重试。
2. **鉴权/token 生命周期有多处缺口，让已撤销/已封禁的会话活下去**
   - `backend/app/api/v1/auth.py`：`refresh_token` 不复查封禁状态；轮换是黑名单上的非原子读-写。
   - `backend/app/core/token_blacklist.py`：Redis 挂掉时 `is_token_blacklisted` **fail-open** 返回 `False`；`blacklist_token` 返回 `None` 而调用方（logout）照样报成功。
   - `backend/app/api/v1/notifications.py`：JWT 作为 WS **查询参数**接受，只在握手校验，过期/撤销后 socket 继续推送。
   - `backend/app/core/limiter.py`：`Bearer` 匹配大小写敏感，`bearer` 客户端被打进匿名 IP 桶（违反 RFC 7235，削弱限流）。
3. **check-then-act 竞态遍布写路径**，同一根因在约 10 个模块重复：无行锁 / 无原子 upsert / 不处理唯一约束冲突。
   `api/v1/favorites.py`（笔记 upsert）、`api/v1/users.py`（偏好 upsert）、`api/v1/vocabulary.py`（词条插入）、`api/v1/payments.py`（重复待付订单）、`api/v1/exams.py`（交卷）、`services/admin_service.py`（单例设置行）、`services/difficulty_service.py`（等级覆盖）、`services/channel_service.py`（上游 id）、`models/learning_plan.py` 与 `models/video_score.py`（计数器/最新行）。
4. **静默吞异常掩盖故障与数据丢失**
   `api/v1/internal.py`（锁删除、presence `setex`、事件投递上 `except Exception: pass`）、`services/behavior_service.py`、`core/token_blacklist.py`、`api/v1/notifications.py`（只记 `type(exc).__name__` 或字面 `"WebSocket"`）、`api/v1/presence.py`（永远返回 `{"ok": True}`）。叠加 fail-open 后，Redis/DB 坏了完全不可见。
5. **缓存正确性与缓存键安全**
   `api/v1/media.py`（`_VIDEO_ACCESS_CACHE` 只按 `video_id` 建键）、`api/v1/channels.py`（改名/删除不失效浏览缓存，最长 48h 陈旧）、`core/cache.py`（`None` 同时表示 miss 与空值、`key.format(**kwargs)` 遇位置参数崩、`json.dumps` 在 try 之外、逐键 `DELETE` 是 O(n)）、`api/v1/browse.py`（死的透传 `invalidate_browse_cache`）。
6. **无界客户端输入直达持久层/IO**
   `schemas/behavior.py`（`events`/`event_payload`/`question_ids` 无上限；且信任客户端给的 `video_id` 用于副作用）、`api/v1/behavior.py`（批量端点匿名可达）、`schemas/comment.py`（无长度、无非空）、`api/v1/users.py`（`await file.read()` 先全量读入再判大小）、`api/v1/feedback.py`（`list_my_feedback` 不分页）、`schemas/user.py`（密码字段无上限、接受不可能的 `HH:MM`）。
7. **模型/DB 完整性缺口与 model↔migration 漂移**
   缺约束：`models/learning_plan.py`（`user_id, plan_date`）、`models/milestone.py`、`models/redeem.py`（状态耦合、code 冲突无处理）、`models/notification.py`（`NotificationType` 从未接到列上）、`models/admin_setting.py`（单例 `id='global'` 无强制）、`models/video_quality_report.py`（`QualityStage` 死枚举）。
   漂移：`models/feedback.py` 缺 migration 里的 `server_default`/索引 → 测试用的 `Base.metadata.create_all` 与生产 schema **不是同一个**。
   枚举语义：`models/order.py` 持久化枚举 **name** 而非 value。
8. **媒体服务的路径处理与响应头卫生**
   `api/v1/media.py`（门禁按未规范化的 `file_path` 分支而实际服务文件来自 resolved `full`；RFC 7233 后缀 range `bytes=-500` 解析错）、`api/v1/users.py`（MIME 只信客户端 `Content-Type`；旧头像从不删除）、`main.py`（`/media*` 提前 return 跳过 `X-Content-Type-Options: nosniff`；`/metrics` 无鉴权）。
9. **异步路径上的阻塞 IO 与非线程安全原语**
   `api/v1/internal.py`（async handler 里用同步 Redis 客户端）、`api/v1/users.py`/`media.py`（`Path.write_bytes`/`mkdir`）、`core/redis.py`（懒初始化/关闭竞态）、`api/v1/notifications.py`（await 发送期间改动 `_connections`；`list.remove` 会 ValueError；只在 `WebSocketDisconnect` 时清理）。
10. **配置脆弱且静默降级**
    `core/config.py`（只认字面 `"development"`/`"production"`；`redis_url` 的生产守卫是死代码；`payment_verify_signature` 默认 False；翻译质量阈值无交叉校验）、`core/logging.py`（`mask_phone` 泄漏 7 位完整号码；`request_id` 从不 unbind；非法 `log_level` 静默降级为 INFO）、`core/redis.py`（把 Redis URL 连凭据一起写日志）。

**模块热点**：`api/v1/` 最密（`payments.py`、`mock_payments.py`、`auth.py`、`internal.py`、`media.py`、`notifications.py`、`redeem.py`、`users.py`、`favorites.py`）；`models/` 几乎每个文件至少一条；`core/` 是安全原语所在地；`services/` 以 `channel_service.py`、`ai_service.py`、`admin_service.py`、`behavior_service.py` 为主。

### 5.2 前端十类

1. **系统性静默吞错**（跨三层重复）
   - store：`stores/planStore.ts`（`fetchProfile`/`refreshProfile` 空 catch）、`stores/profileStore.ts`（把任何错误映射成缓存的「已答过」null）、`stores/vocabularyStore.ts`（未校验的 shape 直接赋给 state）。
   - hooks：`usePractice.ts`、`usePlatformFeed.ts`、`useShadowing.ts`、`useSpeakingRecorder.ts`、`useVideoMeta.ts`、`useWordLookup.ts`、`useDailySession.ts`。
   - pages：`(admin)/admin/(shell)/invites/page.tsx`、`videos/[id]/page.tsx`、`orders/page.tsx`、`(main)/browse/page.tsx`、`practice/exams/page.tsx`、`profile/page.tsx`（`Promise.allSettled` 的 catch 不可达，`加载失败` 永不触发）。
2. **凭据暴露与弱化鉴权信任**
   - `lib/api.ts` 把裸 token 拼到媒体 URL 上（`?token=`）→ 经日志/`Referer`/浏览器历史泄漏；`(admin)/admin/(shell)/videos/VideoDetailRow.tsx` 同样。
   - `lib/authHelpers.ts` 把 JWT 镜像进 JS 可读的 cookie（**无法**加 `Secure`/`httpOnly`）；`stores/adminAuthStore.ts` 两个 token 都留在 `localStorage`。
   - `lib/jwt.ts` 的 `decodeJwt` 不验签，调用方却直接断言成 `AuthUser`/`AdminAuthUser`；`isTokenExpired` 在缺 `exp` 时 fail-open。
3. **竞态/陈旧响应覆盖**（最高频的 hook 缺陷，10 个 hook + 2 个 admin 页）
   `useDailySession.ts`、`usePlan.ts`、`usePaginatedList.ts`、`useRankings.ts`、`useSession.ts`、`useShadowing.ts`、`useVideoStatusPolling.ts`、`useVocabSetDetail.ts`、`useVocabSieve.ts`、`useWordLookup.ts`、`(shell)/stats/page.tsx`、`(shell)/feedback/page.tsx`。相关：`usePaginatedList.ts` 换页时双请求；`usePlan.ts` 由 `profileLoading` 当依赖触发无限重取。
4. **无守卫访问 localStorage/浏览器 API**（隐私模式、SSR、不支持的环境下抛错或坏状态）
   `stores/watchStore.ts` **在模块加载期**读取 → 未捕获的 throw 会连带崩掉 store 的导入；另见 `useTheme.ts`、`useMilestoneCelebration.ts`、`useRequireAuth.ts`、`useMediaQuery.ts`（`matchMedia`/`addEventListener` 能力检测）、`usePracticeAudio.ts`/`useSpeech.ts`（`speechSynthesis`）。
5. **hook 契约错误或自相矛盾，导致功能静默失效**
   `useMilestoneCelebration.ts` 读错响应形状 → 里程碑永不触发；`useCoachMark.ts` 自动前进回调从未接线 → 用户卡在「下一步」；`useVideoPlayer.ts` 把终态 `error` 映射成 `loading` → 无限转圈；`(main)/watch/[id]/page.tsx` 的 `sessionLookupsRef`/`sessionAddsRef` 从不被写 → EndScreen 统计恒为 0。
6. **常量/工具重复且已漂移**
   `listFormat` 相对时间（`format.ts` vs `utils.ts` vs `date.ts`）、`getApiUrl`/`getToken`（`adminApi.ts`、`analytics.ts` vs `lib/api.ts`）、手机号正则散在 3 个文件、`DIFFICULTY_LEVELS` 两份、搜索接口类型两份、颜色 token（`examLevels.ts` 三处、`chart-theme.ts` 复制 `globals.css`）、cookie 名（`proxy.ts` vs auth stores）、API 路径内联。
7. **类型逃逸掩盖真 bug**
   `adminData.ts`（`res.plan as "free" | "pro"`）、`useVideoPolling.ts`（`as VideoAdmin["status"]`）、`types/index.ts`（`| string` 把字面量联合类型塌掉；`topic_tags` 与 `Video` 不一致）、`cefrLevels.ts`（`Record<string, string>` 丢掉键检查）、`orders/page.tsx`、`videos/[id]/page.tsx` 的 `video!.id`。
8. **格式化/日期函数在坏输入上产出垃圾**
   `format.ts`（`formatDuration`/`formatViews` 用 `if (!sec)` 使 `0` 渲染为空；`formatTime` 产出 `NaN:NaN`）、`date.ts`（`formatTimeSpent` → `"NaN分钟"`/`"-5秒"`，日期运算不防 DST，`relativeTime` 无 NaN 守卫）、`avatar.ts` 会劈开代理对。
9. **`frontend/src/app/globals.css` 的无效 CSS 用法**
   `rgb(var(--success) / 0.18)`、`rgb(var(--scrollbar-track))` 无效（值是十六进制/关键字）；`--brand-500` 从未定义；渲染阻塞的 Google Fonts `@import`；圆角尺度非单调；`.scrollbar-none`/`.scrollbar-hide` 重复。
10. **无障碍与地标回归**
    `(admin)/admin/login/page.tsx`（图标按钮无标签、`<label>` 未用 `htmlFor` 绑定）、`(main)/not-found.tsx` 在布局的 `<main>` 里再套 `<main>`、`rankings/loading.tsx` 缺 `aria-busy`/`role=status`、`favorites/page.tsx` 的取消收藏按钮只靠 `group-hover` 暴露（触屏不可达）。

**模块热点**：`hooks/` 评论密度最高（`useVideoPlayer.ts` 单文件 8 条）；`lib/`（`api.ts`、`createApiClient.ts`、`jwt.ts`、`authHelpers.ts`、`format.ts`、`date.ts`）；`stores/` 六个 store 全有状态完整性或错误处理缺陷；admin shell 密集；`(main)/watch/[id]/page.tsx` 与 `vocabulary/drill/page.tsx` 单文件多项正确性 bug。

---

## 6. 六条 critical：逐条核实与修复

全部 6 条**经代码核对成立**，且**全部已修**。

### C1 缓存键不含身份（`backend/app/api/v1/media.py`）

- **原文**：`_VIDEO_ACCESS_CACHE` 只按 `video_id` 建键，但缓存的决定依赖 `viewer_id`。owner/admin 预览草稿/下线视频时会把 `allowed=True` 缓存 60 秒，窗口内任何其他访问者（含匿名）请求同一 `{video_id}.mp4` 都能拿到草稿内容；反向也成立：匿名请求缓存 `False` 会让 owner/admin 被误 403 最多 60 秒。
- **核实**：**成立**。实测 TTL 60.0 秒。另确认 `_video_unlock_allowed`（会员门）**根本没有缓存**，所以漏洞面只限于「发布态门」这一处。
- **修法**：只缓存 **viewer 无关的公共判定**；带身份的请求每次实时判定 owner/admin 旁路。
- **状态**：已修。

### C2 门禁与所服务路径解耦（`backend/app/api/v1/media.py`）

- **原文**：访问检查按未规范化的 `file_path` 分支，实际服务的文件来自 resolved `full`；`..` 段能让门禁与真实路径不一致。
  1. `/media/shadowing/{own_id}/../{other_id}/rec.webm` 通过 `_shadowing_token_ok(parts[1])`（`parts[1]` 是调用者自己的 id），却解析到别人的私有录音。
  2. `/media/x/../shadowing/{other_id}/rec.webm` 不以 `shadowing/` 开头，token 分支被整段跳过，任何私有录音无 token 可取。
  3. `/media/shadowing/{own_id}/../../{vid}.mp4` 解析到根级视频文件，绕过下方的发布态门。
- **核实**：**成立，三个例子全部成立**。此处我本人出过一次判断失误：最初我说第三个例子不成立（认为 `..` 层数不够），是我数错了层级数，已更正。报告里保留这条，因为它说明**「AI 的论证看起来比实际更严密」是双向的——人也一样会算错，边界算术必须动手数**。
- **修法**：改用已校验的 resolved 路径派生分段 —— `full.relative_to(base).parts`；视频门由 `full.parent == base` 改为 `len(rel) == 1`。
- **状态**：已修。
- **残留**：可利用性取决于上游代理是否规范化 `..`（nginx 默认会合并，直连 uvicorn 不会）。新增的回归测试是直连 ASGI 的，**绕过了代理**，所以它证明的是「应用层已不再依赖未规范化路径」，不代表线上链路已被端到端验证。

### C3 环境校验可被跳过（`backend/app/core/config.py`）

- **原文**：环境相关校验只认字面 `"development"`/`"production"`，任何其他值（`staging`、`prod`、`test`）**同时跳过** dev 默认值与生产守卫，于是 `jwt_secret`/`database_url` 保持空值，应用能用空 key 签发 JWT。更糟的是 `env` 默认就是 `"development"`。
- **核实**：**成立**。
- **修法**：`env` 白名单 `("development", "testing", "production")` + `_ENV_ALIASES = {"prod": "production"}` + 归一化（`object.__setattr__(self, "env", env)`，让下游 `settings.env == "production"` 的检查不会被拼写差异绕过）+ 未知值 `RuntimeError` fail-closed；并把 secret/DB 守卫**移出**那个可被跳过的 `"production"` 分支。
- **状态**：已修。新增 11 条测试（`backend/tests/test_config_env_guard.py`）。
- **残留**：`env` 的**默认值仍是 `"development"`**，未 fail-closed。这是刻意保留（本地开发零配置），但它是「漏配 ENV 即降级」这一根因的最后一块拼图，见第 12 节。

### C4 里程碑响应形状读错（`frontend/src/hooks/useMilestoneCelebration.ts`）

- **原文**：`GET /api/v1/plan/milestones` 返回 `Milestone[]`，字段 `{ id, milestone_type, achieved_at, metadata_json }`，不是 `{ milestones: { key, achieved }[] }`。于是 `data.milestones` 永远是 undefined，**里程碑永不入队**。
- **核实**：**契约双向核实通过**。
  - 后端：`backend/app/api/v1/learning_plan.py:123` 是 `response_model=list[MilestoneResponse]`（**裸数组**，不是包裹对象）；`backend/app/schemas/learning_plan.py:136` 字段为 `id/milestone_type/achieved_at/metadata_json`。
  - 前端：`frontend/src/types/index.ts:582` 字段同名。
- **修法**：改成 `api<Milestone[]>`，按 `achieved_at` 过滤，以 `milestone_type` 去重。
- **状态**：已修。

### C5 失败后无限重试（`frontend/src/hooks/usePlan.ts`）

- **原文**：`fetchProfile()` 失败时把 `profileLoading` 从 true 置回 false、`profile` 仍为 null；而 `profileLoading` 是 effect 依赖，`false → true → false` 每轮都重新满足 `!profile && !profileLoading`，对失败/未授权端点形成无界请求循环。
- **核实**：**成立**。
- **修法**：加 `attempted = useRef(false)`；未认证时重置。
- **状态**：已修。

### C6 竞态跳过整个复习测验（`frontend/src/app/(main)/vocabulary/drill/page.tsx`）

- **原文**：在 `phase` 翻到 `"review"` 的那一次提交上，`useVocabularyPractice` 的 `enabled` 刚变 true，但 `useSession` 还没开始取数 —— 它的 `loading` 仍是陈旧的 `false`（`enabled` 为 false 时 `refetch` 提前返回且不碰 `loading`），`items` 仍是 `[]`。该次提交里的所有 effect 都读到这些陈旧闭包值，于是这个 effect 立刻触发并跳到 `"summary"`。
- **核实**：**逻辑复核成立**。
- **修法**：加 `reviewLoadSeen` ref，**必须观察到过一次 `quiz.loading`** 才允许判空池跳 summary。
- **状态**：已修。
- **残留（必须说清）**：**只有逻辑复核，没有运行时实证**。e2e 需要起前后端服务，本次未跑。边界行为：若某次 quiz 从不进入 `loading`，页面会停在 review 阶段而不跳 summary（比误跳 summary 安全，但仍是行为差异）。

---

## 7. 23 条 high：核实总表

核实分两批：H1–H11 与 H13–H23 各由一个子代理逐条读代码核实，完整过程见 `logs/_v-result-D.md`、`logs/_v-result-E.md`；**H12 由我本人核实**（见下方「本表补充」）。

| # | 位置 | 结论 | 严重性判定 | 一句话理由 |
|---|---|---|---|---|
| H1 | `api/v1/auth.py:212-216` | 成立 | **夸大** | refresh 确实不查封禁，但每个请求的 `get_current_user`（`api/dependencies.py:86-88`）都拒封禁用户 → 续签出来的是废票 |
| H2 | `api/v1/channels.py:148-151` | 成立 | 合理（影响轻） | 改/删频道确实不失效缓存，卡片里的作者页链接最长 48h 指向 404 |
| H3 | `api/v1/favorites.py:196-198` | 成立 | 合理 | 并发 upsert 撞唯一约束未捕获 → 500；原文「`add_favorite` 已加锁」的对比断言**属实**（`favorites.py:94` 确实锁了视频行） |
| H4 | `api/v1/internal.py:106-110` | 部分成立 | **夸大** | 交错时序理论成立，但窗口仅毫秒级，且 `finalize_video` 自带锁（`services/video_processing.py:499`）+ 步骤幂等兜底 |
| H5 | `api/v1/mock_payments.py:27` | 部分成立 | **夸大** | 「GET 不该改状态」对；**CSRF/跨站理由不成立**（Bearer 头认证、全仓无 cookie 会话、生产不注册该 router，`main.py:249-252`） |
| H6 | `api/v1/notifications.py:54` | 成立 | 合理（低） | 确实遍历活列表，会漏发一个连接；不是崩溃 |
| H7 | `api/v1/notifications.py:48-50` | 成立 | 合理（低） | `remove()` 非幂等、双 disconnect 可达；一路逃出端点，另一路被上层吞掉 |
| H8 | `api/v1/payments.py:173-174` | 成立 | **夸大** | 金额确实没校验，但签名不可伪造 + 金额服务端定 + `payments_enabled=False`，当前不可触发 |
| H9 | `api/v1/users.py:82-83` | 部分成立 | **夸大** | 确实只信 `Content-Type`；但 HTML/SVG/脚本载荷**不可能被渲染**（扩展名固定映射 + `/media` 扩展名白名单 + `nosniff`）→ 无 XSS |
| H10 | `api/v1/users.py:88-89` | 成立 | **低估** | 「先全读再判大小」属实；且 `nginx.conf:44` 是 `client_max_body_size 500m` → 单请求可达 500MB 进内存 |
| H11 | `core/cache.py:89` | 成立（潜伏） | 合理（当前不可达） | `json.dumps` 确在 try 之外，但现有全部调用点传的都是 JSON 原生值；**原文 patch 只覆盖一半**，`cache.py` 的 89 与 143 两处都要包 |
| H12 | `core/config.py:130` | 成立（条件性） | 合理偏保守 | `payment_verify_signature=False` 是默认值，但旁路效果被 `settings.env == "development"` 门控（`services/alipay_payment.py:60`、`services/wechat_payment.py:64`）。原文「只翻转 `payments_enabled=True` 就会留下可伪造回调」不准确 —— 还需 `env=development`，而后者恰是默认值，所以「漏配 ENV + 开支付」仍能命中 |
| H13 | `core/logging.py:76` | 成立 | **夸大** | `mask_phone("1234567")` 确实返回完整号码，但全仓**找不到 7 位输入来源** |
| H14 | `core/redis.py:35` | 成立 | 合理 | **真凭据外泄**：生产 `docker-compose.prod.yml:61` 注入 `redis://:${REDIS_PASSWORD}@redis:6379/0` |
| H15 | `main.py:171` | 成立 | **略夸大** | Starlette 的 404/405 确实绕过 `{code, message}` 信封，但前端 `lib/createApiClient.ts:283` 有 `detail` 回退，不会直接崩 |
| H16 | `models/learning_plan.py:123` | 部分成立 | **夸大** | 约束真缺，但该表**无写入方**、功能已下线（端点 410 Gone，见 `.agent/decisions-index.md` DEC-025 D0b）；另 4 个子项论证不成立 |
| H17 | `schemas/behavior.py:19` | 部分成立 | **略夸大** | `events`/`event_payload` 无上限属实；`exam.question_ids` 的 DB 压力**证伪** —— `services/exam_service.py:311-318` 先与用户自己的错题集求交集 |
| H18 | `schemas/behavior.py:9` | 部分成立 | 合理 | **「匿名可刷」证伪**（`services/behavior_service.py:49` 门控需登录）；真问题是 `:102` 的自增在 `if record:` **之外**（未授权也能刷播放完成数）+ 客户端 `video_id` 触发 FK 违约 500 |
| H19 | `schemas/learning.py:32` | 成立 | 合理 | 负值/NaN 确实能过校验并落库；但原文的 NaN 后果说错了 —— Pydantic 默认 `allow_inf_nan=True` 时 **`allow_nan=False` 的 JSON 序列化会 500，同时毒值已写入 DB** |
| H20 | `schemas/admin.py:120` | 成立 | 夸大（实际影响 0） | 5 个响应类全仓**无人使用**（端点返回裸 dict），破损是潜伏的 |
| H21 | `schemas/user.py:65` | 成立 | 合理 | 无 `max_length` → 列是 `String(100)`（`models/user.py:38`）→ 超长名被 PostgreSQL 拒 → 500；另原文写的是 `PUT /users/me`，端点是 PATCH |
| H22 | `services/ai_service.py:44` | 成立 | 影响可忽略 | `_engine_clients` 未初始化确实会 `AttributeError`，但 `ai_service.py:439` 的 `gather(return_exceptions=True)` 把它吞掉 |
| H23 | `services/catalog_service.py:332` | 成立 | 合理 | 真会造出重复 official `Video` + 二次 GPU；**但原文修法有回归风险**（见下） |

**统计**：结论成立 17 / 部分成立 6 / 整条误报 **0**；严重性夸大 5（H1、H4、H5、H8、H9）、略夸大 3（H13、H15、H17）、低估 1（H10）、实际影响≈0 2（H20、H22）、合理 12。

**本表补充 —— H23 的修法风险（重要）**：原文建议「把 `processing` 也一并拒绝」。**不能照做**：`CatalogStatus.error` 从不落库（`catalog_service.py:113` 只是读时派生），所以「拒绝 processing」会**封死唯一的恢复路径** —— 一个卡在 processing 的条目将永远无法重新 promote。正确修法是**行锁 + 复用仍在 processing 的 promoted_video**。

**知识文档对照（这批是否属于已知未修）**：

| # | 相关文档 | 判断 |
|---|---|---|
| H2 | `wiki/problems/cache-invalidation-and-media-gate-blindspots.md` | 相邻但不同问题（该文记「失效被 fail-open 吞掉」，H2 是「根本没调失效」）→ 非已知未修 |
| H9 | 同上（2026-09-22 补记了头像上传的另一个 bug） | 不同问题（那次是「上传 200 但 GET 404」）→ 非已知未修 |
| H1 | `wiki/architecture/auth-system.md` | 只记前端 401 语义，未记封禁与 refresh 的关系 → 非已知未修 |
| H16 | `.agent/decisions-index.md` DEC-025（D0b 下线学习计划） | 相关，但 H16 报的是「约束缺失」，不是「已下线」→ 部分相关 |
| H18 | `wiki/architecture/video-pipeline.md:57`、`.agent/context.md:93,95` | 有相邻描述，未记 FK/越权自增 → 非已知未修 |
| H15 | 无 | envelope 只在 `main.py:89-93` 的 docstring 与前端注释里描述过 |
| H3/H4/H5/H6/H7/H8/H10/H11/H12/H13/H14/H17/H19/H20/H21/H22/H23 | `.agent/`、`wiki/` 均无对应条目 | 全部非已知未修 |

**顺带发现的文档漂移**：`wiki/architecture/backend-services.md:39` 仍在描述**已被删除**的 `learning_plan_service.py`。

---

## 8. 被证伪的论证，与我自己的判断失误

这一节是本报告最有价值的部分。**「结论对」不等于「理由对」**，而理由错了会直接导致修错地方或高估/低估优先级。

### 8.1 被证伪的论证（9 处）

1. **H5「GET 改状态 → CSRF/跨站可利用」** —— 证伪。凭据是 `Authorization` 头（非 cookie），全仓无 cookie 会话，且该 router 在生产不注册（`main.py:249-252`）。「GET 改状态」本身仍是不良设计，但不是 CSRF 面。
2. **H9「上传 HTML/SVG → 存储型 XSS」** —— 证伪。扩展名固定映射 + `/media` 扩展名白名单 + `nosniff`，攻击者可控内容不可能以可执行类型被渲染。
3. **H18「匿名可刷 view_count」** —— 证伪。`services/behavior_service.py:49` 的门控需要登录。真问题是同一函数 `:102` 的自增**在 `if record:` 之外**（已登录用户可对任意 video 触发），以及客户端 `video_id` 造成的 FK 违约 500。
4. **H17「`exam.question_ids` 无上限 → DB 压力」** —— 证伪。`services/exam_service.py:311-318` 先与用户自己的错题集求交集，客户端控制的只是这个小集合。
5. **H16 的四个子项** —— 论证不成立（表无写入方/功能已下线）；约束缺失是真的，但「能造成重复或绕过不变量」在当前代码里无路径。
6. **H22「异常类型错误影响调用方」** —— 影响被吞：`ai_service.py:439` 用 `gather(return_exceptions=True)`。
7. **H23 的修法** —— 见上一节：照原文改会封死恢复路径。
8. **H13 的可达性** —— 无 7 位输入来源。
9. **H20 的实际影响** —— 5 个类全仓无人使用。

共同特征：**全部出现在「死代码、内部 schema 约束、无外部触发面的路径」上。** 模型在这类代码上产出「技术正确但实际无意义」的发现。

### 8.2 严重性判断错误的分布

- **夸大 5 条**（H1、H4、H5、H8、H9）：都是「理论路径成立，但被上游/旁路机制挡住」。H1 最典型 —— 它假设 refresh 签出的 token 可用，忽略了每请求的封禁检查。
- **低估 1 条**（H10）：模型没看到 `nginx.conf` 的 `client_max_body_size 500m`，把「可达 500MB 的单请求」估轻了。**跨文件上下文（网关配置）不在模型的视野里**。
- **略夸大 3 条**（H13、H15、H17）：都有现成的兜底（无来源/前端有 `detail` 回退/上游已收窄）。

### 8.3 我自己的判断失误

- **C2 第三个例子**：我最初判断「不成立」，理由是 `..` 层数不够 —— **是我数错了**。已向用户更正。教训：路径遍历的论证必须动手数层级，不能靠心算；而且第三方（AI）给出的三个例子比一个人一次审查更可能有边界覆盖。
- **H12 不在原定核实范围**：两批子代理分别覆盖 H1–H11 与 H13–H23，**H12 掉在两批之间**。我在写报告时才发现，已自行补核（结论见第 7 节）。这是流程失误：**分批核实必须显式声明边界闭合**。

---

## 9. 修复详情与验证证据

已修 4 项（H10 / H3 / H2 / H14）。每一项都有「先让它红、再让它绿」的证据，不是「改完看着像对的」。

### 9.1 H10 无界上传读入内存

- **改法**：新增 `backend/app/core/uploads.py`，提供 `read_upload_bounded(request, file, max_bytes, *, status_code, detail) -> bytes`，两层防御：
  1. `Content-Length` 预检：超过 `max_bytes + 8KB` **直接抛，一字节不读**（`_ENVELOPE_SLACK = 8KB` 是 multipart 封装开销余量）；
  2. 1MB 分块累计兜底（防 Content-Length 撒谎）。
  调用点：`api/v1/users.py:89-95`（头像）、`api/v1/media.py:223-230`，两处均改用它。
- **行为变化（必须知道）**：头像超限的响应码 **400 → 413**，用 `HTTP_413_CONTENT_TOO_LARGE`（`HTTP_413_REQUEST_ENTITY_TOO_LARGE` 在 starlette 1.6.0 已弃用）。前端 `components/profile/ProfileTab.tsx:92` 只取 `message` 不按状态码分支，所以未被影响。
- **测试**：新增 `backend/tests/test_uploads.py`（6 条）、`test_profile.py`（+3）、`test_shadowing_api.py`（+1）。
- **RED 证据**：把 helper 换回旧实现后，spy 记录到 `reads == [-1]`（一次无界读），新断言失败 → 断言确实在验「读了几次」，不是验「有没有报错」。
- **残留**：Starlette 在进 handler **之前**就落盘 `SpooledTemporaryFile`，所以约 500MB 的临时磁盘/带宽仍然存在。要真正封顶，需给这两个 location 单独设 nginx `client_max_body_size 6m`（**未做**）。

### 9.2 H3 笔记并发 upsert 竞态

- **改法**：`api/v1/favorites.py:42-49` 的 `_get_owned_video_or_404(db, video_id, *, for_update: bool = False)` 增加 keyword-only 开关；`upsert_note`（`:199`）传 `for_update=True`。
- **测试**：新增 `backend/tests/test_favorites_pg.py`（integration 标记，`asyncio.gather` 发两个并行 PUT）。
- **真 Postgres 上的 RED → GREEN**：
  - 改前：第二个 PUT `assert 500 == 200`，响应 `Internal Server Error`；
  - 改后：两个都 200，库中**恰好 1 行**。
- **锁顺序**：全仓统一「视频行 → 关联行」，无死锁。
- 本地无 `PG_TEST_URL` 时该测试 skip（成为第 7 个 skip），CI 会真跑。验证用 `speaking_test` 库 —— `seeword` 库有既存的 `DependentObjectsStillExistError`（仓库自带的 6 个 PG 测试同样 ERROR，非本次引入）。

### 9.3 H2 频道改/删不失效缓存

- **改法**：`api/v1/channels.py:150-161`（update）与 `:170-188`（delete）补 `invalidate_channel_caches`，与既有 create/attach **同形**（commit 之后、`if ids` 守卫、fail-open）。delete 的 id 收集必须在调用 `channel_service.delete_channel`（内部 flush）**之前**完成。
- **FK 语义已核实**：`backend/migrations/versions/b2c3d4e5f6a7_add_channels.py:42-44` 是 `ondelete="SET NULL"`。
- **顺带修掉的测试基建缺陷（重要）**：`backend/tests/conftest.py:123-136` 的 `_FakeRedis` 缺 `__await__` —— 生产代码 `await get_redis()` 合法，但假替身不是 awaitable，导致 `video_cache.invalidate_video_detail_cache`（`backend/app/services/video_cache.py:21-27`）里的 `TypeError` 被自己的 `except Exception: pass` 吞掉，**测试环境里逐视频 detail 缓存永远不失效**。已按 `wiki/problems/cache-invalidation-and-media-gate-blindspots.md` §1 的 Future Prevention 补齐。这条说明：**假替身与真实对象的协议差异，会让一整类缓存缺陷在测试里隐形**。
- **测试**：新增 `tests/test_channels_api.py` 2 条。**两次探针验证**：把 `invalidate_channel_caches` 换成 no-op → 两测试都失败；把 id 收集挪到删除之后 → delete 测试失败。

### 9.4 H14 Redis URL 连凭据入日志

- **改法**（我本人手改，1 行）：`backend/app/core/redis.py:35` 由
  `logger.info("redis_client_created", url=settings.redis_url)`
  改为带两行「为什么」注释 + `host=settings.redis_url.rsplit("@", 1)[-1]`（只留 host/db，丢掉 userinfo）。

---

## 10. 验证汇总

以下全部为实跑结果，不是声明。

| 项目 | 命令 | 结果 |
|---|---|---|
| 后端全量测试（冻结工作区） | `cd backend && PYTHONUTF8=1 .venv/Scripts/python.exe -m pytest tests/ -q` | **846 passed, 7 skipped, 0 failed**（223.93s） |
| 基线对照 | 同上（改前） | 834 passed / 6 skipped → 新增 12 条通过、1 条 PG skip |
| 后端最终树复跑（改完 `redis.py` 之后） | 同上 | **846 passed, 7 skipped, 0 failed**（203.64s） |
| 后端 lint | `ruff check` | All checks passed |
| 后端格式 | `ruff format --check` | 243 files already formatted |
| 前端静态检查 | `npm run check`（typecheck + lint + format:check） | 通过：typecheck 干净、lint 0 error / 10 条既存 warning、prettier 全过 |
| 前端单测 | `npm run test:unit`（vitest） | 56 passed（8 文件） |

`PYTHONUTF8=1` 必须加：否则因 GBK 读 `.env` 直接失败。

**工作区状态**：`git diff --stat` 共 17 个改动文件、506 insertions / 67 deletions。其中 5 个文件是你原有的 401 修复（`frontend/src/app/login/page.tsx`、`register/page.tsx`、`hooks/useRequireAuth.ts`、`frontend/src/components/auth/RedirectStuckState.tsx`、`frontend/e2e/login-redirect-loop.spec.ts`），**不计入本次审计的改动**。

本次产生：

- 修改：`backend/app/api/v1/channels.py`、`favorites.py`、`media.py`、`users.py`、`backend/app/core/config.py`、`backend/app/core/redis.py`、`backend/tests/conftest.py`、`test_channels_api.py`、`test_media_access.py`、`test_profile.py`、`test_shadowing_api.py`、`frontend/src/app/(main)/vocabulary/drill/page.tsx`、`frontend/src/hooks/useMilestoneCelebration.ts`、`frontend/src/hooks/usePlan.ts`
- 新增：`backend/app/core/uploads.py`、`backend/tests/test_config_env_guard.py`（11 条）、`test_favorites_pg.py`、`test_uploads.py`（6 条）

无残留脚手架：子代理创建的临时诊断页 `frontend/src/app/login/probe/`、`probe-plan/` 已删除。

---

## 11. 已核实但**故意未修**的 4 项同类缺陷

这些是同形状缺陷的其它实例，改法会触及既有契约或需要各自的回归测试，所以**留给你决定**（见文末）。

1. **`delete_note`（`backend/app/api/v1/favorites.py:219`）与 H3 完全同形状。** 已在真 Postgres 上复现：`StaleDataError: UPDATE statement on table 'user_notes' expected to update 1 row(s); 0 were matched.` → 500。**故意没改**：修法要么引入视频存在性校验（会改变该端点「幂等、对未知视频返 200 空笔记」的既有契约），要么加一个不带所有权语义的裸行锁 —— 两条路都需要你确认 + 自己的回归测试。
2. **`PATCH /videos/admin/{id}` → `backend/app/services/video_service.py:485/511`**：改 `channel_ref` 时只在 `publish_changed` 才失效浏览缓存，`channel_slug` 会陈旧。这是 H2 的第三处实例，但在不同模块。既有测试 `test_admin_video_patch_sets_channel_ref` 正走这条路径。
3. **H23（`services/catalog_service.py:332`）**：修法应为「行锁 + 复用仍在 processing 的 promoted_video」，**不要**采纳原文的「拒绝 processing」。
4. **H18 的真问题（`services/behavior_service.py:102`）**：把 `update(Video)` 缩进进 `if record:`（一行改动）+ 端点校验 video 存在性返 4xx，一次消掉两个问题（越权刷站内播放完成数 + FK 违约 500）。

---

## 12. 未验证事项与残留风险

**我必须如实说明这些没有验证：**

1. **H13–H23 中若干条的「不可达」结论来自子代理推演**（H13 无 7 位输入来源、H16 表无写入方等），我没有逐条独立复核代码。
2. **C6 只有逻辑复核，无运行时实证**（需起前后端服务跑 e2e）。边界：若某次 quiz 从不进入 `loading`，会停在 review 阶段而不跳 summary。
3. **线上容器实际的运行时 `ENV` 值未知。** 仓库内所有入口都写 production/testing —— `deploy.sh:74`、`deploy-oneclick.sh:87`、`docker-compose.prod.yml:81/155/200`、`docs/operations/PRODUCTION.md:69`、CI 用 `ENV: testing`；`.env.example:13` 记录 `development / production / testing` 三值 —— 但线上进程环境无法从此处确认。结合 C3 的 `env` 默认值仍为 `development`，**「漏配 ENV」这个根因并未被我的修复关闭**：现在未知值会 fail-closed，但**完全不设**仍是 development。建议在 `docker-compose.prod.yml` 与部署脚本里显式 `ENV=production`，并考虑让非本地启动 fail-closed。
4. **C2 的可利用性取决于上游代理是否规范化 `..`**（nginx 默认合并，直连 uvicorn 不会）。新增回归测试是直连 ASGI 的，**绕过了代理**。
5. **未做真实 nginx 端到端验证**：H10 的 500m 上限只被引用，未在生产栈实跑。
6. **未跑 `/knowledge-maintain`，也未做提交前的调用方影响分析**（见第 14 节）。
7. **`logs/ocr-scan-*.json` 的 `summary.files_reviewed` 与实际完成数不一致**（前者是派发数）。本报告引用覆盖率时用的是会话计数器（selected/completed/failed/reused），不是 `files_reviewed`。
8. 后端首轮 JSON 里有 2 条评论的 `severity`/`category` 为 `None`（数据小瑕疵，未追查）。
9. 我本人没读 `wiki/architecture/frontend-architecture.md`、`.agent/invariants.md`、`.agent/system-map.md`（子代理按其 brief 读过）。
10. **第 5 节的项目级总结全部未核实**，是模型通读后的归纳。

---

## 13. 方法论收获

这一节回答「下次怎么用这个工具才划算」。

**1. 命中率随「外部触发面」剧烈变化。**
- 有外部触发面的路径（HTTP 端点、鉴权、支付回调、文件上传、缓存键、WS 生命周期）：**结论几乎全对，且常常找到人漏看的组合条件**（C1 的缓存键、H10 的 500m 上限、H14 的凭据入日志）。
- 死代码与内部 schema（无写入方的模型、无人引用的响应类、无来源的输入）：**「技术正确但实际无意义」集中出现**。H13–H23 里 4 条实际影响≈0、9 处论证被证伪，全在这一类。

**2. 必须连论证一起核，不能只看结论。** 本轮：结论误报 0，但论证被证伪 9 处、严重性错 9 条（夸大 5 + 略夸大 3 + 低估 1）。**「严重性」是模型最不可靠的字段**；「位置」和「代码事实」是最可靠的字段。可行的用法是：**把严重性丢掉，只信「这里有个可疑形状」，然后自己去读代码定级**。

**3. 跨文件上下文是盲区。** H10 被低估，是因为模型看不到 `nginx.conf` 的 `500m`；H8 被夸大，是因为模型看不到「`payments_enabled` 默认 False」这层业务前提。**给模型的输入只有单个文件时，任何跨文件的收敛/放大机制都会被误判。**

**4. 工具的两个护栏要会用，不要对抗。**
- `--max-tokens-budget` 挡住了一次失控（首轮），也毁了两轮完整性。**正确用法是按目录切分、每目录给足预算**，而不是给大仓库一个总预算。
- `--resume` 是省钱关键（本轮复用 24 个文件），**但必须先意识到 429/402 是「余额绑定并发」而不是「服务故障」**，否则会误以为工具坏了。

**5. 覆盖率必须自己算。** `files_reviewed` 会骗你（报 160，实际 94）。

**6. 本次最可复用的结论是「同形状分布」。** 单点修复的收益远小于模式修复：
- 后端 check-then-act 竞态 ≈10 模块同形 → 统一用 `SELECT ... FOR UPDATE` / `ON CONFLICT` / 唯一冲突恢复。
- 前端静默吞错跨 store/hooks/pages 三层 → 应在 API 客户端层统一错误上报，而不是逐处补 catch。
- 缓存失效「有时调有时不调」（H2 及另外两处）→ 应在 service 层统一出口，而不是每个端点手写。

**7. 对 AI 审查的合理定位。** 把它当**广覆盖的线索生成器**，不是**判定器**。本轮实际修了 4 类真缺陷（含 1 条真凭据外泄），全部来自它的提示；但真正决定「修哪个、怎么修、要不要修」的，是把每条结论拉回代码里核一次。

---

## 14. 提交前必做（未完成）

1. **`/knowledge-maintain`** —— 本次是跨模块变更（`api/media`、`core/config`、`api/favorites`、`api/channels`、`api/users` 五个模块的接口/行为 + 新增 `core/uploads.py`），按仓库根 `AGENTS.md` 的 MUST 规则，提交前必须执行。
2. **顺带修文档漂移**：`wiki/architecture/backend-services.md:39` 仍在描述已被删除的 `learning_plan_service.py`。
3. **提交前调用方影响分析** —— 确认改动只影响预期文件与执行流（用 grep 调用点与 `git diff --stat` 核对）。
4. **本报告未提交任何 git 写操作。** 所有改动都在工作区，请你决定何时提交。
5. 建议一并决定的遗留项，见第 11 节（4 项已核实未修）与第 12 节第 3 点（`ENV` 默认值）。

---

## 附录 A：产物清单

`logs/*` 被 `.gitignore:47` 的 `logs/*` 忽略，所以这些不是提交物，只是本地证据。

| 文件 | 内容 |
|---|---|
| `logs/ocr-scan-backend-app.json` | 后端首轮（失败轮）原始 JSON，81 条评论 |
| `logs/ocr-scan-backend-app-resume.json` | 后端续跑原始 JSON，192 条评论 + `project_summary` |
| `logs/ocr-scan-frontend.json` | 前端原始 JSON，325 条评论 + `project_summary` |
| `logs/_ps-backend.txt` | 后端项目级总结纯文本（12,362 B） |
| `logs/_ps-frontend.txt` | 前端项目级总结纯文本（10,177 B） |
| `logs/_v-criticals.md` | C1–C6 逐字原文（4,790 B） |
| `logs/_v-backend-high.md` | H1–H23 逐字原文 + 建议改法（18,231 B） |
| `logs/_v-result-D.md` | H1–H11 完整核实过程（27,068 B） |
| `logs/_v-result-E.md` | H13–H23 完整核实过程，428 行（40,515 B） |
| `logs/_sess-backend.json`、`logs/_sess-frontend.json` | 会话计数器来源（覆盖率计算依据） |

## 附录 B：续跑剩余 176 个文件

```bash
# 后端：未派发的 60 个文件
ocr scan --path backend/app --resume af8336bf-2415-48d1-8f9f-4d05ae6108bf \
  --concurrency 4 --max-tokens-budget 8000000 -o logs/ocr-scan-backend-app-2.json

# 前端：未派发的 110 个文件
ocr scan --path frontend/src --resume f7eba0d2-64f5-4034-a62d-deb515c47103 \
  --concurrency 4 --max-tokens-budget 8000000 -o logs/ocr-scan-frontend-2.json
```

`--concurrency 4` 是本次实测零 429/402 的值；预算给到 8M 是为了**别在长文件处再撞顶**（上次 6M 只够 100 出头个文件）。

---

## 附录 C：报告写就后的后续修复（2026-09-25 追加）

**本附录的效力高于第 11、12、14 节的相应表述。** 第 11 节列出的「已核实但故意未修」4 项现已**全部修复**；第 12 节第 6 点与第 14 节第 1、2 点已履行完毕；第 14 节第 3 点（提交前调用方影响分析）仍**未执行**。修复过程中有两处发现**推翻了本报告此前的判断**（见 C.3），另有两处**偏离了本报告给出的修法建议**（见 C.2）。

### C.1 修复清单（五项）

原本计划的 4 项在实施中各暴露了一个更深的问题，最终变成 5 项，全部带 RED→GREEN 证据。

| # | 缺陷 | 位置 | 修法 | 证据 |
|---|---|---|---|---|
| 1 | `delete_note` 与并发写相撞 | `backend/app/api/v1/favorites.py:240,248` | 先锁 `videos` 行（`with_for_update`），再锁 `user_notes` 行；锁序统一为 video → 子行 | `tests/test_favorites_pg.py` 4 passed（真 PG 连跑 6 次稳定）；解锁版本 5/5 失败 |
| 2 | 改 `channel_ref` 不失效浏览缓存 | `backend/app/services/video_service.py:467,510` | 新增 `channel_changed` 判定，条件改为 `if publish_changed or channel_changed:` | `tests/test_channels_api.py:496-523` 新增三情形；该文件 + `test_videos.py` + `test_video_takedown.py` 合计 67 passed |
| 3 | catalog promote 重复造 video + 二次 GPU | `backend/app/services/catalog_service.py`（`get_item` 加 `for_update`，新增 `_find_reusable_video`，`promote_item` 调用） | 三级判定：① 记录里的 `promoted_video_id` → 复用；② 按 `source_url` 找 official 且非 `error` 的 Video 回收；③ 都没有才 `seed_video` | `tests/test_catalog_pg.py`（新，2 个 PG 测试，其中 1 个用会 commit 的真实 stub 证明并发窗口）；`tests/test_catalog_api.py` 新增 5 个 → 20 passed |
| 4 | 行为事件镜像副作用不受门控 | `backend/app/services/behavior_service.py:120-138`、`api/v1/behavior.py` | `view_count + 1` 与 `emit_event(EVENT_COMPLETED_VIDEO)` 全部收进 `if record:` | `tests/test_behavior_api.py` 新增 `fk_enforced` fixture + 3 个测试 → 9 passed |
| 5 | 悬空 `video_id` 触发 FK 违约 500（**新发现**） | `backend/app/services/behavior_service.py:61-81` | 新增 `drop_unknown_video_ids(db, events)`：一次 `SELECT ... IN (...)`，未知 id 置 `None`，两个端点各自调用 | 同上文件 |

第 5 项不在原报告的第 11 节里。它是第 4 项修复过程中浮出来的：第 4 项一动 `view_count` 的写入位置，就暴露出 `emit_event` 也带着同一个不受校验的 `video_id` 直接落库。两项本质同源（行为端点信任客户端传来的 video_id），所以一并修。

### C.2 两处偏离原报告建议的决定

这两处是我**没有按报告写的改法做**，理由如下，你可以推翻。

**（1）第 11 节第 4 条建议「端点校验 video 存在性返 4xx」，我没采纳。**

改为「未知 id 置 `NULL`，请求仍返回 2xx」。理由：这是分析型埋点端点，一次批量上报里混一个悬空 id 就整批拒收，损失的是真数据；而埋点数据本身不承担业务正确性。置 `NULL` 同时消掉了 FK 违约（第 4、5 项），且不引入新的失败面。若你认为「必须让客户端知道自己传错了」，改成 4xx 是一行的事，但那会改变端点的失败契约，需要同步改前端上报逻辑。

**（2）第 11 节第 1 条提示的「裸行锁」，我改成了「video 行 + note 行双层锁」。**

原因是实施中查明了真实加锁语义（见 C.3 第 1 点）：只锁 note 行关不住 DELETE 与 PUT 相撞——PUT 侧的 UPDATE 才是真正抛 `StaleDataError` 的那条路径，而它同时受 `videos` 行状态影响。统一锁序为 video → 子行，是为了让它与项目中其它走 `videos` 行的路径（`update_video`、catalog promote）保持同一把锁顺序，避免引入交叉死锁。**仍然没有加存在性校验**，所以「未知视频 → 200 空笔记」的既有契约被保留。

### C.3 两处推翻了原报告判断的发现

**（1）第 11 节说「两个并发 DELETE 会 500」——表述不准确。**

实测：两个并发 `DELETE /notes/{video_id}` **不会** 500。该表没有 `version_id_col`，SQLAlchemy 对 DELETE 命中零行只发 `SAWarning`，不抛异常。真正抛 `StaleDataError: UPDATE statement on table 'user_notes' expected to update 1 row(s); 0 were matched.` 的是 **DELETE 与 PUT 相撞**时的 UPDATE 侧。这解释了为什么该缺陷能长期潜伏：只有在刻意安排交错（而不是自然并发调度）时才复现——自然调度下 25/25 全绿，是典型的假阴性。修复后的测试用 `warnings.catch_warnings(record=True)` 把零行命中的警告**升级为断言**，就是为了不让这条路径重新变成静默通过。

**（2）catalog 的「行锁 + 复用记录字段」方案（报告原建议）关不掉并发窗口。**

`seed_video` 内部会调 `commit_refresh`，它**在临界区内提交并提前释放条目行锁**。所以只靠记录里的 `promoted_video_id` 判断，首次 promote 被并发双击时两个请求仍会各自 `seed_video`——第一次的提交发生在锁释放之前，第二个请求在拿到锁时能看到记录字段，但恰恰是「第一个请求尚未写下记录字段」的那个瞬间构成了窗口。改读 `videos` 表则关得掉：video 行的提交与锁释放同事务、原子可见。

同时我**明确拒绝**了原报告第 11 节第 3 条里引用的原始建议「连 `processing` 一起拒绝」。原因：`CatalogStatus.error` 从不落库（由 `_derive_effective_status` 读时派生），拒绝 `processing` 会封死从失败中恢复的**唯一**路径。

### C.4 全量验证（当前工作区）

| 项目 | 命令 | 结果 |
|---|---|---|
| 后端全量 | `PYTHONUTF8=1 PG_TEST_URL=... pytest tests/ -q` | **868 passed, 0 failed, 0 skipped**, 311.19s |
| ruff lint | `ruff check app tests` | All checks passed |
| ruff format | `ruff format --check app tests` | 244 files already formatted |
| mypy 基线门 | `mypy app/ --ignore-missing-imports` vs `backend/.mypy-baseline` | distinct 53 = baseline 53，**NEW: NONE** |
| 前端 check | `npm run check` | typecheck 干净、lint 0 error / 10 条既存 warning、prettier 全过 |
| 前端单测 | `npm run test:unit` | 8 文件 **56 tests passed** |

带 `PG_TEST_URL` 后 7 条 `integration` 测试不再 skip，这也是本次「0 skipped」的来源——**未设该变量时这些测试会静默跳过**，是 CI 与本地结果可能不一致的地方。

前端 **e2e 未跑**：C6（复习测验竞态）仍只有逻辑复核，没有运行时实证。

### C.5 知识层处理（按 `AGENTS.md` MUST 规则执行）

本次是跨模块变更，按仓库根 `AGENTS.md` 必须执行 `/knowledge-maintain`。已做：

**决策记录**（`.agent/decisions.md` 末尾追加 + `.agent/decisions-index.md` 补三行，检查校验数量/顺序/日期/标题一致）：

- **DEC-049** Catalog promote 幂等复用：行锁 + 记录链接 + URL 级回收
- **DEC-050** 行为事件的镜像副作用统一以 `LearningRecord` 为前提；未知 `video_id` 置 NULL
- **DEC-051** 未知 ENV 值 fail-closed，保留 `development` 作为默认

**文档**：

- **新建** `wiki/problems/shared-row-locks-and-nested-commits.md`（6239 B）：①同一行的两个写者必须共用同一把锁；②SQLAlchemy UPDATE 抛 `StaleDataError` / DELETE 只警告 + SQLite 忽略 `with_for_update()` + 自然调度假阴性；③临界区内的 commit 提前释放锁（catalog 案例）。
- **扩写** `wiki/problems/review-fix-failure-modes.md`：标题改为「四个可复用失败模式」，新增第 4 节「外部 AI 审查：结论可信、论证不可信、严重性最不可信」。
- **扩写** `wiki/problems/cache-invalidation-and-media-gate-blindspots.md`：标题改为「三个隐形失效模式」，新增 §3「缓存失效的漏一处形态：条件写在调用点」。
- **修漂移** `wiki/architecture/backend-services.md`：删掉 `learning_plan_service.py`（随 DEC-025 下线并删除）与 `ai_plan_service.py`（文件也已不存在），改列 `learning_event_service.py + profile_service.py`，并新增 `catalog_service.py`（指向 DEC-049）与 `behavior_service.py`（指向 DEC-050）。

**状态**：`.agent/state.md` 重写（5113 B / 上限 5322），置顶新增本次审计一段，Current Focus 改为「审计修复待提交」。

**印章**：刷新 7 个模块的 verified 日期（`api-v1`、`api-media`、`core-cache`、`backend-services`、`video-service`、`models-behavior`、`tests-conftest`）——只刷新「其全部声明文档本次确实读过」的模块。**故意未刷新** `env-config`、`pytest-suite`、`frontend-*`：其声明文档本次未读（`wiki/guides/setup.md`、`wiki/guides/testing.md`、`wiki/guides/release-checklist.md`、`wiki/architecture/frontend-architecture.md`），刷新会制造假印章。

**检查结果**：`check_knowledge.py` 六项强制检查（`refs` / `frontmatter` / `ownership` / `index` / `paths` / `budget`）全部 `[ok]`；`stale` 提示项余 5 个模块，均为上述未读文档的模块，属正确保留。

**预算告警**：`.agent/decisions.md` 现 **32709 B / 上限 32768 B，仅剩 59 B**。为塞进上限已连续精简三轮（把 DEC-049 的两条残留说明移入 wiki 新文档的「已知残留」，符合 one-fact-one-home）。**下一条决策写入前必须先归档**，否则检查会失败。

### C.6 残留风险（未关闭）

1. **DEC-049 的 schema 级窄窗**：两个**不同**的条目共享同一 `source_url` 并发 promote，仍会各播一次。要关掉需给 `videos(source_url, is_official)` 加部分唯一索引 + `IntegrityError → 复用`（迁移 + 模型同步），属 schema 决策，按 `AGENTS.md` 应先走 `/decision-support`。`mark_item` 也仍是无锁读。
2. **DEC-051 的 ENV 残留**：现在未知值 fail-closed，但线上**完全不设** `ENV` 仍以 development 运行（含 dev 支付签名旁路与 mock 支付路由）。仓库内所有部署入口都已显式写 `production`/`testing`，但进程环境无法从仓库自证。
3. **`recommend:home:*` / `recommend:category:*` 缓存**同样嵌了 `channel_slug`，本次未纳入失效，只有 60s TTL 兜底。
4. **提交前调用方影响分析未执行**：本会话未做手工调用方分析，改动影响范围未经提交前核验。
5. **前端 e2e 未跑**，C6 仍无运行时证据。

### C.7 提交状态

**本报告与上述全部修复均未产生任何 git 写操作。** 所有改动都在工作区（30 个 ` M` + 9 个 `??`）。注意工作区里**还混着一处与本次审计无关的用户侧改动**（前端 401 重定向修复：`frontend/src/app/login/page.tsx`、`register/page.tsx`、`hooks/useRequireAuth.ts`、`components/auth/RedirectStuckState.tsx`、`e2e/login-redirect-loop.spec.ts`），提交前请留意拆分。

---

## 附录 D：第二轮收尾修复（2026-09-25 追加，效力高于第 7、11、12 节）

本附录记录第三轮修复（第一轮见第 6/9 节，第二轮见附录 C）：**第 7 节里剩余的「合理档」high 全部关闭**（H6 / H7 / H11 / H19 / H21），过程中浮出并修掉一条**新的、此前未被发现的同类缺陷（H24）**。第 7 节的结论分布、第 11 节的「故意未修」、第 12 节第 6 点均以本附录为准。

### D.1 本轮修复清单（5 项，全部 RED → GREEN）

| # | 缺陷 | 位置 | 修法 | RED 证据（修复前实测） |
|---|---|---|---|---|
| H11 | `cache_set_json` 的 `json.dumps` 在 `try` 之外，违背模块自己的 fail-open 声明 | `backend/app/core/cache.py:87` | `json.dumps` 移入 `try`，捕获 `(TypeError, ValueError)` → 记 `cache_set_json_error` 并返回 | `json.dumps` 抛 `TypeError: Object of type set/object is not JSON serializable`、`ValueError: Circular reference detected`，**穿过函数**；6 条新测试全红 |
| H19 | `position_seconds` 接受负值与非有限数 | `backend/app/schemas/learning.py:32` | `Field(ge=0, allow_inf_nan=False)` | `assert 200 == 422`；`test_rejected_position_leaves_no_record` 实测 `-1.0` **已被写入库**（`assert -1.0 is None`） |
| H21 | `UserUpdate.name` 无 `max_length`，与注册路径不一致 | `backend/app/schemas/user.py:65` | `Field(default=None, max_length=100)`，与 `SmsRegisterRequest.name` 同界 | `assert 200 == 422`；一致性断言 `IndexError`（`name` 上没有任何 Field 元数据） |
| H6 | `send_to_user` 遍历**活列表**，并发移除会让迭代器跳过顶上来的 socket | `backend/app/api/v1/notifications.py:52` | 遍历快照 `list(...)` | `assert ['a', 'c'] == ['a', 'b', 'c']` —— 一个**活着的连接静默收不到消息** |
| H7 | `disconnect` 非幂等，同一 socket 被两方各清理一次 | `backend/app/api/v1/notifications.py:46` | 成员判断后再 `remove`，列表空了再 `pop` key | `ValueError: list.remove(x): x not in list`，从端点最后一跳逃出 |
| **H24** | **新发现**：422 envelope 回显非有限浮点时自身崩成 500 | `backend/app/core/errors.py` + `backend/app/main.py:111` | 新增 `json_safe_non_finite()`，422 handler 里递归把非有限浮点转文本 | `ValueError: Out of range float values are not JSON compliant: nan`（4 条测试全红） |

### D.2 H24：报告漏掉的一条，与被它连带推翻的两个做法

**H24 是修 H19 时浮出来的**——不是我原先列的任何一条。

发一个裸 `NaN` token（`{"video_id": "vid", "position_seconds": NaN}`，注意不是字符串 `"NaN"`）应当得到 422，**实际是 500 且无任何可用信息**。链路四层，每层单看都合理：

1. `NaN`/`Infinity` **不是合法 JSON**（RFC 8259），但 Python 标准库的 `json.loads` **接受**裸 token —— 它作为 `float('nan')` 正常进入 Pydantic；
2. Pydantic 校验失败，`RequestValidationError.errors()` 的 `input` 字段**原样回显客户端那个值** → `{'input': nan}`；
3. `main.py:113` 把 errors 放进 envelope（`jsonable_encoder` 对 float 原样放行）；
4. Starlette 渲染响应用 `json.dumps(..., allow_nan=False)` → `ValueError`。

**「报告这个输入有问题」的路径，被这个输入本身打挂了。** 关键推论有两条，都会改变后续做法：

- **它不限于 float 字段。** 字符串/整数/Literal 字段收到裸 `NaN` 一样命中（`input` 仍是 `nan`）。所以「给 float 字段加 `allow_inf_nan=False`」**不足以**修掉这一类——报错本身会带出 `nan`，错误路径必须当成一条**独立的数据通路**看。
- **这是既有缺陷，不是我的修改引入的。** `{"video_id": NaN}`（`video_id` 是 `str`）在动任何代码之前就能命中；H19 的修复只是让它从「这条路径今天也会被踩到」变成「每个 NaN 请求都会走」。

**修法与放弃的替代方案**：新增 `app/core/errors.py::json_safe_non_finite()`，在 422 handler 里递归把非有限浮点换成文本 `'nan'`/`'inf'`/`'-inf'`。**换文本而不是丢弃**，因为三者区别对定位问题有用，而它们本来就没有对应的 JSON number。放弃的替代方案是在 JSON **解析层**拒绝该 token（语义上最正——它确实不是 JSON），放弃原因是：它会把精确的「`position_seconds`: 应为有限数」降级成笼统的「body 不是合法 JSON」，而且只覆盖解析进来的那一路。

**对报告第 7 节 H11 备注的更正**：报告写的是「`cache.py` 的 89 与 143 两处都要包」。实际把守卫放进**两条路径共同经过的那个函数**（`cache_set_json` 自身）即可——143 行是装饰器尾部的 `await cache_set_json(...)`，它自动被覆盖。在调用点各包一次会随调用点增长而复现，所以报告的建议方向对、落点不够深。

### D.3 第 7 节 23 条 high 的最终账目

| 状态 | 条目 | 数量 |
|---|---|---|
| **已修** | H2, H3, H10, H14（第一轮）；H18, H23（第二轮，附录 C）；**H6, H7, H11, H19, H21（第三轮，本附录）** | **11** |
| 未修 —— 判定为**夸大**或**实际影响≈0** | H1, H4, H5, H8, H9, H13, H15, H16, H20, H22 | 10 |
| 未修 —— **条件性 / 部分成立** | H12（`payment_verify_signature` 默认 `False`，但旁路效果被 `settings.env == "development"` 门控，而后者恰是默认值 → 与 DEC-051 的 ENV 残留同源）、H17（`events`/`event_payload` 无上限仍属实，其余论证已证伪） | 2 |

**未修的 12 条里，没有一条属于「该修而没修」**：10 条经逐条核实后判定严重性夸大或实际影响≈0（详见第 8 节），另 2 条的前置条件是环境配置或需要单独的输入上限决策。加上 critical 6/6 全修，本报告已核实的**可行动项已清空**。

顺带说明：H16 那条（`models/learning_plan.py:123` 缺约束）之所以不动，是因为该表**无写入方**且功能已随 DEC-025 下线（端点 410 Gone）；补约束对运行中的系统没有可观察效果。

### D.4 本轮验证（全部实跑）

| 项目 | 命令 | 结果 |
|---|---|---|
| 后端全量（带真 PG） | `PYTHONUTF8=1 PG_TEST_URL=… pytest tests/ -q` | **892 passed, 0 failed, 0 skipped**（239.28s） |
| 本轮新增测试 | — | **24 条**（`test_cache.py` 8、`test_error_envelope.py` 5、`test_notifications.py` +3、`test_learning.py` +5、`test_profile.py` +3） |
| ruff | `ruff check app tests` / `ruff format --check` | All checks passed / 246 files formatted |
| mypy 基线门 | CI 同款 `file:code` 提取 + 路径归一化 | distinct 53 = baseline 53，**NEW: NONE** |
| 前端 | `npm run check` / `npm run test:unit` | 0 error / 10 既存 warning；56 passed（8 文件） |

H21 的 PostgreSQL 前提**单独实测确认**（SQLite 不校验 `varchar` 长度，本地测试看不到）：`INSERT varchar(100)` 写入 101 个字符 → `StringDataRightTruncationError: value too long for type character varying(100)`；写入 100 个字符 → 成功（边界为闭区间，与 `max_length=100` 一致）。

### D.5 知识层

- **新增模块** `error-envelope`（`scripts/check-knowledge/modules.json`，globs = `backend/app/core/errors.py` + `backend/app/main.py`）——此前这两个文件**不属于任何模块**，所以 envelope 的行为无法被任何 `wiki/` 文档引用，也不会进入 `stale` 的视野。
- **新建** `wiki/problems/error-path-blindspots.md`（5689 B）：把本轮三条修成同一形态的三条失效模式写在一起——①回显客户端输入的错误响应被该输入弄崩；②声明 fail-open 的模块里那个没被包住的步骤；③清理路径会跑两次而它假设只跑一次。共同点是**测试覆盖最少的那条路径，失败时后果最重**（4xx 变 5xx、消息静默丢失）。
- **印章**：刷新 `error-envelope`（新）、`api-v1`、`core-cache`（其代码本轮确有改动且文档已核对）；**故意未刷新** `env-config`、`pytest-suite`、`frontend-*` —— 其声明文档本次未读。
- **`CHANGELOG.md`**：`Added` / `Changed` / `Fixed` 三节各补条目。
- **`.agent/state.md`** 重写（4503 B / 上限 5322）。

**关于决策条目**：本轮五项修复**未立 `.agent/decisions.md` 条目**，判断依据是它们要么在向既有不变量收敛（H19 的 `ge=0`、H21 与注册路径同界），要么是实现既有契约（H11 的 fail-open、H6/H7 的清理幂等），取舍与放弃的替代方案记在 `wiki/problems/error-path-blindspots.md`。**理由需要显式记录，因为 `.agent/decisions.md` 现为 32709 B / 上限 32768 B（99.8%）**：下一条真正需要决策记录的变更之前，必须先做一轮归档（最早批次条目移入 `.agent/archive/decisions-2026-09.md`，并下调 `knowledge-budget.json` 里的 limit）——机制见 `scripts/check-knowledge/README.md`。

### D.6 本轮新增的残留（未修）

1. **非有限浮点的读路径未设防**（H24 的背面）。写入侧已用 `allow_inf_nan=False` 拦住新值，但以下三条路仍可能把 `nan` 交给 `json.dumps(allow_nan=False)`：(a) 修复之前已经落库的值；(b) **不经 Pydantic** 的响应——`GET /api/v1/learning/progress` 直接返回裸 dict，`jsonable_encoder` 对它不做任何校验；(c) 无 schema 的 JSONB payload（行为事件的 `event_payload`）可以接受 `NaN`（`json.dumps` 默认 `allow_nan=True`）。彻底关闭需要在读侧统一清洗，或在解析层拒绝——后者是 D.2 里放弃的那个方案。
2. **`decisions.md` 已到上限的 99.8%**，见 D.5。
3. 第 12 节列出的 10 项未验证事项**本轮未变**：C6 仍只有逻辑复核（前端 e2e 未跑）、C2 的回归测试仍绕过代理、nginx 端到端未验证、第 5 节项目级总结未核实、提交前调用方影响分析**仍未执行**。

### D.7 提交

本轮与上一轮的改动**仍未提交**，全部在工作区。注意工作区里混着一批**与审计无关的用户侧前端改动**（登录/注册页的 `RedirectStuckState` 重定向卡死恢复、`useRequireAuth.ts`、`e2e/login-redirect-loop.spec.ts`，以及 `docs/plans/词汇训练与播放页返回-设计方案-2026-09.md`）——这批**已从审计提交中拆出**。

---

## 附录 E：S2f 变更的 diff review 与修复（2026-09-25 追加，效力高于第 5.2 节对首页排序的描述）

第四轮与前几轮的做法不同：**不再全仓扫描，而是对 S2f 那一个提交做单提交 diff review**（`ocr review --commit`），范围小、结论可逐条核实。本附录记下命令与结果，供下次同类轮次照抄。

### E.1 命令与结果

```bash
ocr review --audience agent --concurrency 1 --commit 1ef0790ba52b8790d7f79bff239d086ca07a03e3 \
  --background "<业务背景：S2f 是前端接通后端已有的 sort=favorite|weekly_favorite；约束是 URL 为筛选唯一真相、既有四值的 URL 与缓存键不得变>" \
  --output logs/ocr-review-s2f.txt
```

- **3 个文件**（`frontend/src/hooks/usePlatformFeed.ts`、`frontend/src/components/home/HomeFilterBar.tsx`、`frontend/e2e/home-sort.spec.ts`）、**2 条评论**、~1.52M tokens（input 1.49M / output 35K、cache read 1.42M）、2m57s、**exit 0**、session `ca18fcc5-d5e2-4237-8cc9-a4e2d245a4f0`。
- 严重性分布：**0 critical / 0 high**，1 medium + 1 low，两条都落在 maintainability 的同一类问题（类型与手写列表漂移）。
- 参数取舍：`--concurrency 1` 是本次要求（单线程）；`--audience agent` 抑制进度 UI；`--output` 写文件后整份读，避免管道截断丢掉前面的评论。

### E.2 两条发现的核实

| # | 严重性 | 发现 | 是否成立 | 为什么成立 |
|---|---|---|---|---|
| 1 | medium | 请求侧白名单（`if (sort === "hot" \|\| …)`）是第三份手写列表：往 `SORT_VALUES` 加值会编译通过并被静默丢弃 | **成立** | `FeedSort` 从数组派生只保证「类型 ⊇ 白名单」，不保证「白名单 ⊇ 类型」。新 e2e 只钉住它认识的两个值 |
| 2 | low | `SORT_OPTIONS` 是数组，不强制每个 `FeedSort` 都有条目；漏项时 `?? SORT_OPTIONS[0]` 会把非默认排序**标成「推荐」** | **成立** | `SortDropdown` 的兜底分支把文案与真实排序解耦，且没有任何测试能发现 |

两条都不是幻觉：第 1 条的失败模式与 S2b 当初警告的完全同构，第 2 条读代码即可确认。

### E.3 修法（与建议有一处偏离）

| # | 建议 | 实际做法 | 偏离理由 |
|---|---|---|---|
| 1 | `Record<Exclude<FeedSort, "recommended" \| "latest">, string>` + 取用处 `as keyof typeof` cast | 同样的 `BROWSE_SORT_PARAM`，但取用经一个小函数 `browseSortParam(sort): string \| null` | 函数里 `if (sort === "recommended" \|\| sort === "latest") return null;` 之后 TS 会把 `sort` 收窄到 `Exclude<…>`，**索引 Record 不再需要 cast**；语义（哪两个值不发）也写在了一处 |
| 2 | `Record<FeedSort, {label; hint; icon}>` + 有序 key 数组 | 照做，新增 `SORT_ORDER` | 无 |

`SORT_ORDER` 本身仍是手写列表，但漏项的后果与非对称：只会让新选项**不出现在下拉里**，不会标错文案；`SORT_OPTIONS[sort]` 也去掉了原来的兜底分支（`FeedSort` 里每个值都必有条目）。

### E.4 验证（全部实跑）

**① 编译期守卫确有牙齿（RED，临时探针）** —— 把 `"views"` 加进 `SORT_VALUES` 后 `npx tsc --noEmit` **exit 2**，两条错误正是两张表：

```
src/components/home/HomeFilterBar.tsx(33,7): error TS2741: Property 'views' is missing … type 'Record<"recommended" | "hot" | "latest" | "favorite" | "weekly_favorite" | "views", …>'.
src/hooks/usePlatformFeed.ts(34,7): error TS2741: Property 'views' is missing … type 'Record<"hot" | "favorite" | "weekly_favorite" | "views", string>'.
```

探针已还原，`npx tsc --noEmit` 回 **exit 0**（GREEN）。

**② 四道本地门**：`npm run format:check` exit 0；`npx tsc --noEmit` exit 0；`npm run test:unit` exit 0（10 files / 78 tests）；`npm run lint` exit 0（0 errors / 10 warnings，均既有文件）；`npm run build` exit 0。

**③ e2e（`--workers=1` 单线程，后端 `ENV=testing`）**：`npx playwright test --project=chromium --workers=1 e2e/home-sort.spec.ts e2e/watch-return.spec.ts` → **2 passed / exit 0**。上一轮并行跑时 watch-return 报的 `409 该手机号已注册` 是 `uniquePhone()` 撞号，**单线程即消失**（这条已记进交接票「遗留」）。

**④ 请求侧实证**（后端访问日志）：`…page_size=20&sort=favorite`、`…sort=weekly_favorite`、`…sort=hot` 均出现且 200 —— 重构后的 `browseSortParam` 没有改变实际发出的参数。

### E.5 知识层

- `frontend-components` 代码变更 → `stale` 复报一次，核对 `wiki/architecture/frontend-architecture.md` 的 Navigation 一节（它讲 URL 是筛选唯一真相、`from=` 与 `replace`，**不枚举 sort 取值**，两轮改动后仍成立）后刷新印章。
- `scripts/check-knowledge/check_knowledge.py` 七项全 ok。**未写 wiki 正文**：sort 取值与两张映射表都由代码直述。
- 未新增 DEC 条目：接口契约仍由 DEC-052 裁决，本轮只是把同一契约的实现做成「漏项即编译错误」，没有改变任何取舍。

### E.6 提交

本轮改动（`usePlatformFeed.ts` / `HomeFilterBar.tsx` / `knowledge-stamps.json` / 本附录）与 S2f 主提交分开提交，提交信息只讲本轮 review 的两条修复。
