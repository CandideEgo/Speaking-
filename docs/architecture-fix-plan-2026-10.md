# SeeWord 架构缺陷修复方案（2026-10）

**方案范围**：后端分层与契约、管线流程表达、前端状态归属。结论基于 `master` 当前代码（`fc82b23`）。

**本文性质**：一次性修复方案，**不是常驻规则**。规则类事实仍以三层 `CLAUDE.md` 与代码为准；这里只记录「缺口在哪、按什么顺序补、每步怎么验收」。

**来源**：由一次静态阅读得出（`docs/` 下同期的架构缺陷评审结论）。本文是那份结论的施工版——缺陷描述已在评审里说过，这里不重复，只给施工细节。

**统一的施工约定**：

- 每批**独立提交、独立回滚**，不跨批合并。
- 每批改动后必跑：`backend/` → `pytest tests/ -v` + `ruff check app/ tests/`；`frontend/` → `npm run check`。
- 涉及响应形状的批次必跑 `npx playwright test --project=chromium`（e2e 前置见前端 `CLAUDE.md`：先迁库到 head，再 `python scripts/seed_e2e.py`）。
- **不为过门禁放宽任何检查器、基线或豁免**（根 `CLAUDE.md` 常驻规则）。本方案不含任何新增白名单。

---

## 0. 结论提要

| 批 | 目标 | 一句话 | 波及面（实测） | 风险 |
|---|---|---|---|---|
| **0** | 契约快照 | 先让「改了什么契约」可见，否则后面全是盲改 | 新增 1 个测试文件 | 零 |
| **1a** | 兜底 handler | 装一张网，同时**测出**哪些 `ValueError` 正在漏成 500 | `main.py` 1 处 | 零 |
| **1b–1d** | 领域错误类型 | 89 处 `ValueError` → 分域异常；状态码不再由消息散文决定 | 15 个 service + 9 个 router | 低 |
| **2** | 卡片 projector | 同一张卡片现在有 4 个手写点和 4 套字段集，收敛成 1 处 | 4 个序列化点 + 9 个 `dict` 端点 + 3 处前端本地类型 | 中（有产品可见变化） |
| **3** | 管线步骤声明化 | 步骤的「存在」有家，「顺序」没有——搬进一个 `STEPS` 元组 | `pipeline_helpers.py` + `finalize_video` 300 行 | **高** |
| **4** | `word_levels` 收敛 | 一个字段三种形状，且分叉已经发生 | 5 个写入点 + 1 个校验器 | 低（需先量化） |
| **5** | 化石清理 | 6 张 0 引用表 + 5 个 410 桩路由 + 1 个 relationship | 1 个迁移 | **不可逆**（需授权） |
| **6** | 考试层级单一来源 | 「keep in sync」从注释祈使句变成会失败的检查 | `exam_levels.py` + `examLevels.ts` | 低 |
| **7** | 会话写入原子化 | 「已登录」有四个定义，且三处能改它 | `authHelpers` + 1 条检查 | 低 |
| **8** | 观看页拆分 | 1656 行 = 页面 + 控制器 + 版式引擎 + 引导器 | 3 个新 hook | **高**（反对一次重写） |

**推荐执行序**：

```
0 → 1a → 1b → 1c → 1d → 2 → 4 → 6 → 3a → 7 → 5 → 3b → 8
      └零风险      └低风险      └收敛契约   └低风险  └高     └需授权 └高
```

理由：`0`/`1a` 零风险且立刻产生情报；`2`/`4`/`6` 是纯收敛，收益大风险小；`3b`/`5`/`8` 触碰不可逆或高回归面的东西，放后面且单独立项。

---

## 1. 批 0 — 契约快照（设施）

### 为什么必须最先做

`tests/` 里有 **198 处**断言错误码或状态码，但**没有任何一处钉住「某端点返回哪些字段」**。本方案有 3 批会改响应形状（1、2、5），没有这层网就只能靠肉眼 review。

### 前置

无。

### 改动点

新增 `backend/tests/test_response_contract.py`：

- 覆盖对象：9 个 `response_model=dict` 端点 + 4 个卡片端点（`/videos/public`、`/browse/feed`、`/videos/rankings`、`/videos/favorites`）。
- 断言形式：把 `sorted(body.keys())` 与 `(status_code, body["code"])` 存成字面量。
- **它记录的刻意是「当前的混乱」**——用处就是把现状变成可 diff 的东西。

### 验收口径

```
cd backend && pytest tests/test_response_contract.py -v
```

全绿。此后每批的 `git diff` 里，契约变化只可能来自这个文件，且必须逐行解释。

### 回滚

删除文件即可，无副作用。

---

## 2. 批 1 — 错误契约

### 现状（实测）

| 层 | 计数 |
|---|---|
| `raise ValueError`（services，15 个文件） | **89** |
| `raise HTTPException`（api） | 175 |
| `raise AppError` | **8**（`payments.py` ×3、`video_url_guard.py` ×5） |
| `except ValueError`（routers，9 个文件；`videos.py` 占 24） | 43 |
| **完全没有 `except ValueError` 的 router 文件** | 17 |

`main.py` 只注册了 5 个 handler（`RateLimitExceeded` / `AIServiceError` / `AppError` / `HTTPException` / `RequestValidationError`）——**没有 `ValueError`，也没有兜底 `Exception`**。所以任何一个措辞对不上、或 router 忘了 try 的 `ValueError`，会变成 500 + 通用文案。

而 `core/errors.py` 已经把正确的东西造好了（`AppError` + `ErrorCode`），**最大的那个模块没有用它**，而是让服务层抛自由文本（中英混杂：`"该视频还没有生词…"` 与 `"Round is closed"` 并存），再让路由层反解：

```python
# backend/app/api/v1/videos.py:296 / 338 / 450
if "not found" in msg.lower():     → 404
if "offline" in msg.lower():       → 503
if "already processing" in msg:    → 409
```

### 1a — 兜底 handler（零风险，先做）

**改动点**：`backend/app/main.py` 加一个 `Exception` handler → 500 + `ErrorCode.INTERNAL_ERROR`，日志打全栈 + 原始 message。

**这一步的真正价值不是「堵住 500」，而是产生情报**：上线后日志会直接列出**哪些 `ValueError` 现在正在漏成 500**。跑一周再动 1b，就不需要靠猜。

**验收口径**：批 0 快照不变（500 响应体多出 `code` 字段这一项应被策略性接受或事先确认）。

**回滚**：删 handler。

### 1b — `DomainError` 家族

**改动点**：`backend/app/core/errors.py` 增补，紧挨已有的 `AppError`：

```python
class DomainError(AppError): ...          # 继承以获得 status + code + message
class NotFound(DomainError):    # 404
class Conflict(DomainError):    # 409
class Forbidden(DomainError):   # 403
class Invalid(DomainError):     # 400
class Unavailable(DomainError): # 503
```

**收敛**：15 个 service 文件、89 处 `raise ValueError` → 换成对应子类。**逐文件提交**，不要求一次改完。优先 `videos.py` 依赖的 `video_service.py` / `video_seed_service.py` / `subtitle_edit_service.py`。

**风险点**：`ValueError` 也被 pydantic validator 使用（如 `schemas/video.py:321` 的 `start_time must be less than end_time`）。**validator 里的 `ValueError` 不要动**——它由 422 handler 接住，语义不同。

### 1c — router 侧收敛

**改动点**：43 处 `except ValueError` → `except DomainError`（一档）。`videos.py` 的 24 处里，`if "not found" in msg.lower()` 这类子串判断**全部删除**。

**验收口径**：

- 新增测试 `test_no_message_sniffing`：`app/api/` 下不得出现针对异常消息的子串判断。
- 批 0 快照中的错误码**必须不变**。如果变了，说明映射写错了状态码——这正是快照存在的意义。

### 1d — 认证原语

**现状**：`backend/app/api/dependencies.py:52-126`，`get_current_user` 与 `get_optional_user` 是同一段校验链的两份拷贝（token 类型、黑名单、`password_changed_at`、封禁、user 缺失），只在最后一步分叉成 `raise` 与 `return None`。

**改动点**：抽出 `_authenticate(credentials) -> User | None`，两个依赖各取所需。

**为什么值得做**：现在**每次给登录校验加一条规则都要改两处**，漏一处不报错，只会让可选鉴权端点静默地少一道门。

**验收口径**：批 0 快照不变；`pytest tests/ -v` 中鉴权相关用例全绿。

### 回滚

逐文件提交，`git revert` 单文件即可。`DomainError` 继承 `AppError`，所以全局 handler 无需改动——这是选择继承而非并列的原因。

---

## 3. 批 2 — 卡片 projector

### 现状（实测）

同一张卡片在四处手写，字段集已经分叉：

| 位置 | 独有字段 |
|---|---|
| `backend/app/api/v1/browse.py:188 _video_to_dict` | `description` |
| `backend/app/services/ranking_service.py:158 _serialize` | `published_at`、`metric` |
| `backend/app/api/v1/videos.py:983`（内联在 router 里） | `storage_mode`、`note_excerpt`、`favorited_at` |
| `backend/app/services/video_service.py:705` | `storage_mode` |

同一个字段的三种写法，是漂移的物证：

```python
# browse.py:203
"video_source": v.video_source.value if v.video_source else None,
# ranking_service.py:173
"video_source": (v.video_source.value if isinstance(v.video_source, VideoSource) else v.video_source),
# videos.py:1003
"storage_mode": getattr(v, "storage_mode", "local") or "local",
```

`isinstance` 兜底与 `getattr` 默认值都是**对形状不确定的自白**——有人踩过一次才加的。

**前端已经放弃共享类型了**：`favorites/page.tsx:36`、`components/ui/VideoCard.tsx:30`、`lib/adminData.ts:234` 各自声明了本地 interface。这是 union 类型的典型终局，也是本批修复的靶心。

### 便宜之处

`backend/app/schemas/video.py::VideoResponse` **已经是 45 字段的现成目的地**，7 个端点已在用它。四处手写 dict 只是绕过了它。

### 改动点

1. 新增 `backend/app/services/video_card.py`：

```python
def serialize_video_card(v, *, channel_slug=None, scope: Scope) -> VideoResponse
```

`scope ∈ {"feed", "card", "detail", "admin"}`——把现在**隐式散在 4 个文件里的字段集**，变成**一个函数里 4 个显式分支**。差异从「偶然」变成「声明」。

2. `VideoResponse` 补 3 个字段：`metric`、`note_excerpt`、`has_note`（及 `favorited_at`）。
3. 4 个手写点改为调用它；9 处 `response_model=dict` → `PaginatedResponse[VideoResponse]` 等。
4. `isinstance` / `getattr` 兜底全部删除——形状统一后它们没有存在理由。
5. 前端：`Video` 拆成 `VideoCard` / `VideoDetail`，删除上述 3 处本地重复声明。

### 前置确认（产品可见变化，需拍板）

`components/ui/VideoCard.tsx:158` 会渲染「已下架」角标，条件是 `video.storage_mode === "offline"`。而 `browse.py` 与 `ranking_service.py` **现在不返回 `storage_mode`**。

统一之后，**浏览页与排行榜会对已下线视频开始显示角标**。这大概率是**正确**的（需求 §5.3 要求标注），但它是产品可见变化，且 `storage_mode` 在 `VideoResponse` 里的默认值是 `"local"`（`# 默认 local 让历史缓存 JSON 与旧客户端仍可解析`）——**统一后的实际取值需要逐端点确认**，不能默认继承 schema 的默认值。

### 验收口径

- 批 0 快照的 diff **逐条 review**（这次是**故意**的变更）。
- `npx playwright test --project=chromium` 覆盖首页 / 浏览 / 排行榜 / 收藏 四个 spec。
- **缓存**：`browse.py:36` 走 `@cached(ttl=300)`。改字段后确认旧 JSON 能自然过期，或显式失效。

### 回滚

`video_card.py` 是新增文件；4 个调用点各自 `git revert`。前端类型拆分单独提交。

### 与批 1 的关系

批 1 与批 2 **没有依赖**，可以并行。但批 2 **依赖批 0**——否则契约变更不可见。

---

## 4. 批 3 — 管线步骤声明化

**本批收益最清晰，风险也最高。** 必须拆成 3a / 3b 两次合并。

### 现状

`backend/app/tasks/pipeline_helpers.py:27-57` 里，步骤名已经有了单一来源，且注释明确说了防漂移意图：

```python
STEP_PROGRESS = {...}          # 步骤名 = 进度
def get_step_timeouts(): ...   # 步骤名 = 超时
# 「Kept beside the progress map so ... cannot drift apart」
```

三处**已经**靠在一起了。但**顺序**在哪？只在 `finalize_video` 那 300 行 if 序列里：

```python
if not await is_step_done(video_id, "translating"): ... else: logger.info("skipping")
if not await is_step_done(video_id, "annotating"):  ... else: logger.info("skipping")
if not await is_step_done(video_id, "prewarm_notes"): ...
if not await is_step_done(video_id, "classifying"): ...
if not await is_step_done(video_id, "downloading"): ...
if not await is_step_done(video_id, "transcoding"): ...
```

八个形状相同的块。加一个步骤要改三处：map、timeout map、在正确的位置插一段。

### 3a — 只声明，不改行为（低风险）

**改动点**：`pipeline_helpers.py` 新增：

```python
@dataclass(frozen=True)
class Step:
    name: str
    timeout_attr: str
    run: Callable[[Ctx], Awaitable[None]]

STEPS: tuple[Step, ...] = (...)
STEP_PROGRESS = {s.name: p for ...}            # 现有两处变成 STEPS 的视图
def get_step_timeouts() -> dict[str, int]: ...
```

**收益**：`tests/test_pipeline_watchdog.py:168-183` 那条「每个步骤都有预算」的测试，从**维护型约定**升级成**结构保证**。

### 3b — 搬运（高风险）

**改动点**：把 `finalize_video` 的 8 个 if 块逐个搬进 `Step.run`。**一次搬一个步，搬完就提交。**

**必须承认的难点**：现在有三个东西跨步骤流动——

1. `current_step`（错误标记，`commit_error_state` 依赖它）
2. `video_path`（`downloading` → `transcoding`）
3. `quality_blocked` 那条**提前终止整条链**的 return 路径

所以 `Ctx` 需要一块可变黑板，且「步骤可提前终止链」必须是一等能力，不是特例。**这不是纯机械搬运。**

**验收口径**：每搬一步，`pytest tests/test_pipeline_resume.py tests/test_pipeline_watchdog.py -v` 全绿。
最终 `finalize_video` 函数体 < 80 行。

**回滚**：逐步提交，`git revert` 单步即可回到 if 形态。

### 本批不碰

不要顺手改锁语义（`acquire_lock` / `release_lock` / `is_lock_held` 的三个 Redis key）。那三处看起来粗糙，但每一处的不优雅都是被真实事故逼出来的，注释里都留了原因。

---

## 5. 批 4 — `word_levels` 收敛

### 现状

一个字段，三种形状：

| 角色 | 形状 | 位置 |
|---|---|---|
| 写入（管线） | `dict[str, list[str]]` | `backend/app/services/ecdict.py:317 annotate_text` |
| 读入（管理端编辑） | 有 `field_validator` 校验 level key | `backend/app/schemas/video.py:333` |
| 落库 | SQLAlchemy `JSON` 列，**绕过上面一切校验** | `backend/app/models/subtitle.py:31` |
| 消费 | 必须兼容 `list` 与 `str` 两种取值 | `backend/app/api/v1/videos.py:1150-1157` |

那个 `elif isinstance(levels, str)` 就是**分叉已经发生的证据**。五个写入者（管线、管理员编辑、回滚、重断句、recompute）各自假设一种形状，而 `JSON` 列不拦任何东西——**一个没有 schema 的字段，配一份只在一个入口生效的校验器**。

### 顺序不能反：先量化，再迁数据，最后删分支

**步骤 1（前置确认，先跑，不改代码）**：

```sql
SELECT count(*) FROM subtitles
WHERE word_levels IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_each_text(word_levels) e
    WHERE jsonb_typeof(e.value::jsonb) <> 'array'
  );
```

这个数决定后面是「写 backfill 脚本」还是「直接改」。**仓库内无法得知此数，必须在运行中的库上确认。**

**步骤 2**：把 `videos.py:1150` 的防御逻辑收进 `backend/app/core/exam_levels.py` 的一个纯函数 `normalize_levels(value) -> list[str]`，**所有读写方共用**。

**步骤 3**：backfill 把历史 `str` 值规范成 `list`。

**步骤 4**：删掉 `elif isinstance(levels, str)` 分支；并把 `schemas/video.py:333` 的 validator 提成可复用的 `WordLevels` 类型，挂在**写入侧**（`ecdict.annotate_text` 的返回值 + 列的 `TypeDecorator`），而不只是管理员编辑那一个入口。

### 验收口径

- `normalize_levels` 有单测覆盖两种历史形状。
- backfill 后步骤 1 的 SQL 返回 0。

### 回滚

backfill 前先备份受影响行（`COPY (SELECT ...) TO` 到 repo 外）。分支删除是单行改动，`git revert` 即可。

---

## 6. 批 5 — 化石清理

### 现状（实测）

| 已砍的功能 | 遗留物 | `models/` 之外引用数 |
|---|---|---|
| 社区 UGC / fork-PR（ADR-0012） | `subtitle_change_proposals`、`subtitle_mergeable_updates` 两表 + FK + 唯一约束 | **0** |
| 视频评论 | `video_comments`、`video_comment_stats` | **0** |
| AI 学习计划（2026-08-27） | `learning_plans`、`learning_plan_items` + `User.learning_plans` relationship + `learning_plan.py` 里 **5 个恒返回 410 的桩路由** | **0** |

`alembic upgrade head` 会在生产建这些表。**`app/models/` 已经不等于领域模型**——照它读，会读到一个比产品大得多的系统。

这些模型的 docstring 还指向 `docs/plans/PIPELINE-RESUME-DEDUP-AUDIT.md`、`ADR-0006` 等**已删除的文件**。

### 这是唯一不可逆的一批

**前置，顺序不能省**：

1. **先在生产库确认这些表是空的**。0 代码引用 ≠ 0 数据——历史行可能存在。（仓库内无法得知，必须实测。）
2. **drop 前 `pg_dump -t` 到 repo 外**。仓库已有教训：`db-wipe-incident-2026-07`——volume 重建致数据全失，从 dump 恢复。备份放 repo 外是那次的结论。
3. **迁移只由 backend 容器跑**（`entrypoint.sh` 的 `RUN_MIGRATIONS`）；`celery` 与 `celery-beat` 都是 `RUN_MIGRATIONS=0`。这是既有约定（三容器并发迁移会在同一 revision 上竞争），别绕。
4. `op.drop_table` 在本仓库 **30 个迁移里有先例**，不是新操作。

**改动点**：

- 新增 1 个迁移 drop 6 张表。
- 删 `backend/app/models/__init__.py` 的 re-export、`User.learning_plans`、以及 `learning_plan.py` 里 5 个 410 桩路由（前端已无引用，桩的存在理由——「让旧客户端有清晰信号」——已过期）。

**反向检查**：`backend/tests/test_architecture_invariants.py:82-89` 已有「已删路由不得复活」的思路。**同方向的测试应为表也加一条**：这 6 个表名不得再出现在 `Base.metadata.tables` 里。

### 验收口径

- `pytest tests/test_architecture_invariants.py tests/ -v` 全绿。
- 迁移 `alembic upgrade head` 后 `\dt` 确认表已消失；**`alembic downgrade -1` 能重建结构**（数据不保证，那是 dump 的事）。

### 回滚

`alembic downgrade -1` 恢复结构；数据从 dump 恢复。**这正是为什么备份必须先做。**

---

## 7. 批 6 — 考试层级单一来源

### 现状

`backend/app/core/exam_levels.py::display_level` 的 docstring 写着：

> Mirrors frontend `displayLevel` in `frontend/src/lib/examLevels.ts`.

`frontend/src/lib/examLevels.ts:1-3` 写着：

> Mirror of backend/app/core/exam_levels.py — **keep in sync**.

8 个考试层级的 `order`/`label`/`color` 表，加 `maxLevel` / `shouldDisplay` / `displayLevel` 三条规则，在 Python 与 TypeScript 里各写一遍。还有只在前端存在的例外（`TARGET_LEVEL_OPTIONS` 排除 zhongkao/toefl）。

**同一条事实两个家，靠两行注释互相提醒。**

### 决策点先定：源在哪一侧

**建议 Python 侧为源**——因为 `EXAM_LEVEL_KEYS` 正在被 pydantic validator 当**权限清单**用（`backend/app/schemas/video.py:340-342`），那是权威校验位置。颜色留在前端（Tailwind token 是前端的事）。

### 改动点

复用仓库已验证的模式——`frontend/scripts/check-design-system.mjs` 证明了「机器执行的不变量」在这个仓库跑得通：

1. 一次性脚本从 `core/exam_levels.py` 生成 `frontend/src/lib/examLevels.generated.ts`（8 行 taxonomy + `maxLevel` / `shouldDisplay`）。
2. 生成物头部标注 `// GENERATED — do not edit`。
3. CI 加一条：重新生成后 `git diff --exit-code`，不一致即失败。

「keep in sync」从**注释里的祈使句**变成**会失败的检查**。

**留在 TS 侧不生成**：`displayLevel` 的 target-priority 规则（它是渲染决策，不是领域规则）与全部颜色。

### 验收口径

- `npm run check` 全绿。
- 人为改乱 `examLevels.generated.ts` 一个字符 → CI 步骤必须失败（自证检查有效）。

### 风险

低。**收益**：消灭一个必然漂移的重复。

---

## 8. 批 7 — 会话写入原子化

### 现状

「已登录」有四个定义：

1. Zustand/`localStorage` 里的 token（**真身**）
2. cookie `seeword_token`（镜像，供 `frontend/src/proxy.ts` 读）
3. 服务端 DB 里的 user 行（JWT 解出来才查）
4. `proxy.ts` 的「**cookie 存在即算登录**」

登录墙是 default-deny + presence-only：正确性 100% 依赖每一次 auth 转折都记得调 `syncAuthCookie`。任何绕过它的路径，都会让用户处于「看着已登录、每个请求 401」的状态。

**问题不是墙，是有多个地方能改会话。**

### 改动点

- 把「写 localStorage + 写 cookie」封成**唯一的原子对** `setSession()` / `clearSession()`；`syncAuthCookie` 降为私有实现细节。
- 加一条 lint 级检查（沿用 design-system 脚本的思路）：除 `lib/authHelpers.ts` 外，`src/` 不得出现写 `seeword_token` 的 `document.cookie`。

### 明确不改

`proxy.ts` 的 presence-only 保持原样——边缘不查库是**合理**设计，不要为了「架构好看」去动它。

### 验收口径

`npm run check` 全绿；人工检查登录 / 登出 / 刷新 / 401 四条路径的 cookie 与 localStorage 同步。

---

## 9. 批 8 — 观看页拆分

**最后做，且明确反对一次重写。** 仓库已有教训：`watch-page-layout-broken-lesson`——勿整体重写 flex 高度链；改前先 commit。

### 现状

`frontend/src/app/(main)/watch/[id]/page.tsx`：**1656 行，16×`useState`、17×`useEffect`、13×`useRef`、13×`useCallback`**。同一个组件里住着——

- 播放器双后端适配（HTML5 / YouTube 轮询）
- 深链解析（`?sub` / `?word` / `?t`，含 `deepLinkAppliedRef` 去重）
- 字幕跟随的**两套滚动几何**（桌面滚内层容器、移动滚壳容器 `main#main-scroll`）
- 跟读状态机接线（经三个 ref 绕过前向引用）
- 教练引导的四个推进点
- 与壳（顶栏 `⋯` / 底栏）的双向同步

`stores/watchStore.ts` 只装了下游展示态（字幕模式 / 面板宽度 / 选中考试层级）；真正的状态全在组件内。

### 改动点：先抽 3 个无 UI 的 hook

| hook | 从哪抽 | 约行数 | 单测落点 |
|---|---|---|---|
| `useDeepLink(searchParams, video, player)` | `page.tsx:489-517` | ~30 | 纯函数化后可测 |
| `useSubtitleFollow(...)` | `page.tsx:412-447` | ~36 | 几何计算可单测 |
| `useWatchChrome(...)` | `page.tsx:764-846` | ~80 | store 交互可 mock |

**目标**：`page.tsx` 1656 → < 700 行，且每个 hook 有独立测试。

### 验收口径

- `npm run check` + `npm run test:unit` 全绿。
- **每条抽完之后手动过一遍移动端字幕跟随**——那段几何逻辑目前没有自动化覆盖，这是本批唯一无法自动验收的部分。

### 回滚

逐个 hook 提交，`git revert` 单个即回到内联形态。

---

## 10. 明确不建议做的

- **不要为「架构好看」动 `frontend/src/proxy.ts` 的登录墙**。presence-only + 边缘不查库是正确取舍；批 7 修的是「多处能改会话」，不是墙本身。
- **不要改 `lib/createApiClient.ts` 的缓存与重试策略**（GET-only 重试、去重、TTL 的取舍都在注释里写明了理由）。
- **不要改 `pipeline_helpers` 的三个 Redis key 语义**（锁 / steps 集合 / DB status 三视图）。那是有意为之的必要复杂度。
- **不要在没有 dump 的情况下 drop 任何表**（批 5）。
- **不要一次重写观看页的 flex 高度链**（批 8）。
- **不要复活** `VideoComment` 等残留模型所代表的社区 UGC 方向——维持 ADR-0012。

---

## 11. 本次方案的局限

- **全部结论来自静态阅读**，未执行任何测试、门禁或迁移；文中所有计数（89 处 `ValueError`、43 处 `except`、9 处 `response_model=dict`、4 个卡片序列化点、6 张 0 引用表、74 个迁移中 30 个含 `drop_table`）均由 grep 实测得出，但**未做运行时验证**。
- **三项必须在动手前用运行中的系统确认**，仓库内无法得知：
  1. 批 2 —— `storage_mode` 统一后的产品可见变化是否可接受（需拍板）。
  2. 批 4 —— `word_levels` 历史 `str` 形状的实际行数（决定 backfill 规模）。
  3. 批 5 —— 6 张表的实际数据量（决定 drop 是否安全）。
- **工作量未估**：批 3b 与批 8 的实际人日取决于搬运过程中的意外耦合，本方案只标了风险等级，没有排期。
- **批 2 的前端部分有两条路**（手工拆分 `Video` 类型 vs 从 OpenAPI 生成）。方案里选了前者（低风险、可分批）；后者收益更大但会牵动构建链，未展开。
- **「0 引用」按名称 grep 得出**：若某处通过字符串别名动态引用，会漏计。批 5 动手前应以 `git grep` + 运行库双向复核。
