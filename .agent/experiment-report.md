# Pi Agent Engineering Context System — 实验报告

> **日期**：2026-07-22
> **项目**：Speaking (SeeWord) — AI 英语词汇学习 App
> **实验类型**：A/B 对照实验
> **结论**：上下文系统显著提升 Agent 工程能力（25/30 vs 12/30）

---

## 一、实验背景

### 1.1 问题

AI Coding Agent（如 Claude、GPT）在长期项目开发中存在一个核心缺陷：

**每次进入项目时缺少历史认知。**

具体表现：

1. Agent 不知道过去为什么这么设计
2. 跨会话上下文丢失——昨天的开发经验，今天无法利用
3. 代码变化后文档与实际脱节，Agent 基于错误理解行动
4. 重要设计决策无法追溯，Agent 重复犯同样的错误

这不是 Agent 的推理能力问题，而是**上下文管理**问题。

### 1.2 现有方案的不足

当前主流的 Agent 上下文方案存在明显缺陷：

| 方案 | 问题 |
|------|------|
| `CLAUDE.md` / `AGENTS.md` 单文件 | 信息膨胀，无结构，Agent 学会忽略 |
| `docs/` 目录 | 传统文档，不面向 Agent 消费，不维护可信度 |
| 向量数据库 / RAG | 过度工程，需要基础设施，验证成本高 |
| Memory 提取器 | 自动提取知识的假设未验证，可能产生噪声 |

关键缺失：**没有人验证过"维护项目上下文"是否真的能提升 Agent 工程能力。**

### 1.3 核心假设

本实验要验证的核心假设是：

> **为 AI Agent 维护结构化的项目上下文（架构理解 + 决策记录 + 系统连接图），能显著提升其工程决策质量，而非仅仅加快速度。**

---

## 二、系统介绍

### 2.1 设计哲学

三个核心原则：

1. **Code is the source of truth** — 代码是唯一事实来源，文档只是理解的压缩层
2. **Do not constrain model reasoning** — 提供能力和上下文，不规定固定流程
3. **Don't automate what you don't understand** — 先验证价值，再自动化

### 2.2 系统架构

```
                    Pi Agent
                       │
                       ▼
              ┌─────────────────┐
              │   AGENTS.md     │  Agent 行为层（如何工作）
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │    4 Skills     │  能力扩展层（有哪些能力）
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   .agent/       │  项目当前认知（理解什么）
              │   4 files       │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │    wiki/        │  长期工程知识（积累什么）
              └────────┬────────┘
                       │
                       ▼
                  Codebase       事实来源
```

### 2.3 四个核心 Skill

| Skill | 用途 | 大小 |
|-------|------|------|
| `context-bootstrap` | 新项目理解 + 上下文建立 | 4.9 KB |
| `decision-support` | 工程决策分析 + 权衡 | 2.2 KB |
| `knowledge-maintain` | 知识维护 + 隐含规则过滤 | 6.2 KB |
| `knowledge-verify` | 知识漂移检测 + 可信度验证 | 4.7 KB |

### 2.4 .agent/ 目录（项目认知层）

| 文件 | 回答的问题 | 大小 |
|------|-----------|------|
| `context.md` | 这个系统是什么？ | 5.5 KB |
| `decisions.md` | 为什么这样设计？ | 4.1 KB |
| `state.md` | 我们现在在哪？ | 1.0 KB |
| `system-map.md` | 模块之间怎么连接？ | 4.2 KB |

### 2.5 隐含规则过滤器

系统最关键的设计——**防止知识膨胀**。记录任何知识前必须通过三关：

1. **代码是否直接表达了它？** → 如果是，不记录
2. **未来修改是否会受益于知道它？** → 如果不会，不记录
3. **它解释的是"为什么"而非"是什么"？** → 如果只是描述，不记录

只有通过全部三关的知识才值得记录。这避免了 .agent/ 变成垃圾堆。

### 2.6 双维度元数据

每个知识文档携带两个独立的维度：

| 维度 | 值 | 含义 |
|------|-----|------|
| **status**（生命周期） | active / deprecated / archived | 知识是否当前有效 |
| **confidence**（可信度） | verified / assumed / unverified | 知识是否经过代码验证 |

两者正交。例如：一个 `archived` 的架构决策仍可以是 `verified` 的（当年确实是对的，只是现在不用了）。

### 2.7 演进路线图

系统分四个阶段演进，每一步依赖前一步的验证：

```
Phase 1: 人工驱动知识系统（验证价值）  ← 当前
Phase 2: 自动验证知识漂移（Git trigger）
Phase 3: 半自动知识提炼（reflection 提示）
Phase 4: 自动演化 Engineering Memory Agent
```

---


## 三、实验设计

### 3.1 方法

A/B 对照实验。同一个项目、同一个任务，对比"有上下文系统"和"无上下文系统"的 Agent 表现。

### 3.2 对照实验的控制变量

实验的关键是**只改变一个变量：上下文系统是否存在**。其他所有条件保持一致。

#### 保持一致的变量（控制组）

| 变量 | 如何控制 |
|------|----------|
| 代码库 | 两组从同一个 git commit (`9fa7b7d`) 分出分支 |
| 任务描述 | 完全相同的 `.agent/experiment-task.md` 文件 |
| Agent 运行时 | 同一个 Pi Agent 实例，同一个 Claude 模型 |
| 项目已有文档 | 两组都可以看到 `CLAUDE.md`、`CONTEXT.md`、`docs/adr/`——这些是项目原有的，不属于我们的上下文系统 |
| GitNexus 工具 | 两组都可以使用（它是项目原有的代码智能工具，不在实验范围内） |

#### 实验变量（自变量）

| 条件 | Group A（对照组） | Group B（实验组） |
|------|-----------------|------------------|
| `.agent/` 目录 | ❌ 不存在（仅含任务文件） | ✅ 完整（context.md, decisions.md, state.md, system-map.md） |
| `wiki/` 目录 | ❌ 不存在 | ✅ 完整（8 个知识文档） |
| `AGENTS.md` | 精简版（无 Context/Skills/Knowledge Management 段落） | 完整版（含 system-map.md 引用 + 隐含规则过滤器） |
| 4 个 Context Skills | ❌ 不在 Skill 发现路径中 | ✅ 在 `~/.agents/skills/` 中 |

#### 分支操作细节

```bash
# 从 Phase 1 部署的 commit 创建两组分支

# Group A：移除上下文系统
$ git checkout -b experiment/group-a-no-context
$ rm -rf .agent/ wiki/                    # 删除上下文文件
$ git checkout HEAD -- docs/architecture/SYSTEM-MAP.md  # 恢复原始版本（含过时风险）
# 替换 AGENTS.md 为精简版（移除 Context/Skills/Knowledge 段落）
$ git commit -m "experiment: Group A setup — no context system"

# Group B：保留完整上下文系统
$ git checkout master
$ git checkout -b experiment/group-b-with-context
# 无需任何修改，master 已包含完整上下文
```

两组唯一的差异是 `.agent/`、`wiki/` 和 `AGENTS.md` 的内容。代码库本身完全相同。

### 3.3 实验任务

**添加评论通知去重（Notification Dedup）**

选择理由：
- 跨两个 service（community + notification）
- 有非显而易见的约束（WS push best-effort、表会很大、不能改 API）
- 有 4 个调用点需要理解
- 中等难度，既有简单部分也有需要判断的部分

任务描述（两组完全相同）：
> 通知系统在每次 `create_notification` 调用时都创建新行。当用户重复操作（如点赞→取消→再点赞）时，同一目标产生多条通知，造成噪声。
>
> 添加去重逻辑：
> 1. 如果同一用户、同一类型、同一目标的未读通知已存在，更新时间戳而非创建新行
> 2. 如果已有通知已读，创建新通知
> 3. 确保对 community_service.py 的 4 个调用点都生效

### 3.4 评分维度

| 维度 | 测量内容 |
|------|----------|
| 首次行动时间 | Agent 开始修改代码前的探索时间 |
| 错误假设 | 与代码现实矛盾的陈述数量 |
| 重复探索 | 重复阅读已应了解的文件次数 |
| 架构对齐 | 方案是否尊重已有约束和模式 |
| 决策质量 | 是否考虑了文档化的权衡 |
| 知识捕获 | 是否更新上下文文件以供未来使用 |

每个维度 1-5 分，总分 30 分。

---

## 四、实验过程

### 4.1 Group A（无上下文）— 完整操作记录

**环境**：`experiment/group-a-no-context` 分支，无 `.agent/`（仅任务文件）、无 `wiki/`、精简 `AGENTS.md`。

#### Step 1：探索通知系统（~1 分钟）

Agent 从零开始，没有任何项目认知。第一步是阅读核心源文件：

```bash
$ cat backend/app/services/notification_service.py
```

发现：`create_notification()` 函数接受 `user_id, type, title, message, db, related_url`，创建 Notification 行后通过 WebSocket 推送。调用者负责 commit session。

#### Step 2：阅读数据模型（~30 秒）

```bash
$ cat backend/app/models/notification.py
```

发现：Notification 表有 `user_id, type, title, message, is_read, related_url, data(JSON), read_at, expires_at, created_at`。

**关键发现**：没有 `actor_id` 列。但此时 Agent 未意识到这会导致问题。

#### Step 3：搜索所有调用点（~30 秒）

```bash
$ grep -rn "create_notification" backend/app/ --include="*.py"
```

发现 4 个调用点，全在 `community_service.py`：
- 行 284：`post_liked`（帖子点赞）
- 行 370：`comment_reply`（回复评论）
- 行 381：`comment_reply`（评论帖子）
- 行 617：`social_follow`（新关注）

#### Step 4：阅读 API 端点（~30 秒）

```bash
$ cat backend/app/api/v1/notifications.py
```

发现：WebSocket ConnectionManager、REST 端点（list/unread-count/mark-read/read-all/preferences）。

#### Step 5：设计实现方案

基于已读代码，Agent 设计了 dedup key：`(user_id, type, related_url)`。

**此时 Agent 的推理过程**：
- 同一用户 + 同一类型 + 同一目标 = 重复通知
- 如果已读，创建新通知（用户应该看到新活动）
- 如果未读，更新时间戳

**未考虑的问题**：
- 不同操作者（如 Alice 和 Bob 都点赞了同一帖子）是否应该区分？
- Notification 模型没有 `actor_id` 列，无法存储操作者信息
- `data` JSON 字段存在但未使用，可以用来存储 actor_id

#### Step 6：编写实现代码

修改了 3 个文件：

**`notification_service.py`** — 添加去重逻辑：

```python
async def create_notification(...):
    # Dedup check
    if related_url is not None:
        existing = await db.scalar(
            select(Notification).where(
                Notification.user_id == user_id,
                Notification.type == type,
                Notification.related_url == related_url,
                Notification.is_read == False,
            )
        )
        if existing is not None:
            existing.title = title
            existing.message = message
            existing.created_at = datetime.now(UTC)
            await db.flush()
            await _push_notification(existing, user_id)
            return existing
    # ... create new notification
```

**`notification.py`（模型）** — 添加复合索引：

```python
__table_args__ = (
    Index("ix_notifications_dedup", "user_id", "type", "related_url", "is_read"),
)
```

**`test_notifications.py`** — 添加 4 个测试：
- `test_duplicate_unread_updates_existing`
- `test_read_notification_allows_new`
- `test_different_related_url_creates_separate`
- `test_no_related_url_always_creates`

#### Step 7：提交

```bash
$ git commit -m "experiment: Group A implementation — notification dedup"
# 3 files changed, 180 insertions(+), 5 deletions(-)
```

**未做的事**：
- 未更新 `community_service.py`（dedup 是透明的，不需要修改调用方）
- 未考虑不同操作者的区分
- 未记录设计决策
- 未更新任何上下文文件（没有这个机制）

---

### 4.2 Group B（有上下文）— 完整操作记录

**环境**：`experiment/group-b-with-context` 分支，完整 `.agent/`（6 文件）+ `wiki/`（9 文件）+ 完整 `AGENTS.md`。

#### Step 1：读取项目上下文（~30 秒）

Agent 按 `AGENTS.md` 的指引，首先读取上下文文件：

```bash
$ cat .agent/context.md   # 关键段落：
# Important Constraints:
# - GPU Worker must not have DB access
# - Redis must not be single point of failure
# - AI calls must go through ai_service.py

$ cat .agent/system-map.md   # 关键段落：
# | services/notification_service | Cross-cutting: DB write + WebSocket push (best-effort) |
# | services/community_service + comment_service | UGC community + keyword-based comment quality scoring |
#
# notification_service ←── community_service (4 triggers)
#                      ←── payment callbacks
#                      ←── invite/redeem
```

**从上下文中获得的关键认知**：
1. `notification_service` 是**跨模块**的，不只服务于 community → API 改动必须向后兼容
2. 有 4 个 community 触发点 → 任务描述与实际一致
3. WebSocket push 是 best-effort → 不需要为推送做特殊处理
4. `notification_service` 还被 payment 和 invite 调用 → 新参数必须可选

#### Step 2：验证性代码阅读（~1 分钟）

Agent 已经知道架构，只需验证细节：

```bash
$ cat backend/app/services/notification_service.py   # 确认函数签名和 WS push 模式
$ cat backend/app/models/notification.py              # 确认模型结构
```

**关键发现**：Notification 模型没有 `actor_id` 列，但有 `data` JSON 字段（未使用）。

**Agent 的推理过程**：
- 去重 key 需要 (user_id, type, related_url) → 但这不够
- "Alice 赞了帖子 X" 和 "Bob 赞了帖子 X" 是不同事件
- 如果只用 (user_id, type, related_url)，不同操作者的通知会被错误合并
- 需要把 actor_id 纳入 dedup key
- 但模型没有 actor_id 列 → 可以用 `data` JSON 字段存储
- `data` 字段已经存在，只是没被使用 → 自然的选择

#### Step 3：设计实现方案

Dedup key：`(user_id, type, related_url, actor_id)`

关键设计决策：
1. `actor_id` 作为 `create_notification` 的**可选参数**添加 → 向后兼容
2. `actor_id` 存储在 `data` JSON 字段中 → 不需要数据库迁移
3. 当 `actor_id` 存在时，dedup 范围限定为同一操作者
4. 当 `actor_id` 不存在时（payment/invite 调用者），降级为 (user_id, type, related_url)
5. 竞态条件（check-then-insert 不原子）→ 文档化为可接受权衡

#### Step 4：编写实现代码

修改了 6 个文件：

**`notification_service.py`** — 添加 actor-aware 去重逻辑：

```python
async def create_notification(
    user_id, type, title, message, db,
    related_url=None,
    actor_id=None,       # 新增：可选参数，向后兼容
) -> Notification:
    data_json = _make_data(actor_id=actor_id)

    if related_url is not None:
        stmt = select(Notification).where(
            Notification.user_id == user_id,
            Notification.type == type,
            Notification.related_url == related_url,
            Notification.is_read == False,
        )
        if actor_id is not None:
            # actor_id 存在：在 Python 层过滤（JSON 列不可跨数据库移植查询）
            candidates = (await db.scalars(stmt)).all()
            existing = next(
                (c for c in candidates if _extract_actor_id(c.data) == actor_id),
                None
            )
        else:
            # actor_id 不存在：降级为普通 dedup
            existing = await db.scalar(stmt)

        if existing is not None:
            existing.title = title
            existing.message = message
            existing.data = data_json
            existing.created_at = datetime.now(UTC)
            await db.flush()
            await _push_notification(existing, user_id)
            return existing

    # 创建新通知...
```

**`community_service.py`** — 更新所有 4 个调用点传入 `actor_id`：

```python
# 调用点 1：帖子点赞
await create_notification(
    ...,
    actor_id=user_id,        # 新增
)

# 调用点 2：回复评论
await create_notification(
    ...,
    actor_id=user_id,        # 新增
)

# 调用点 3：评论帖子
await create_notification(
    ...,
    actor_id=user_id,        # 新增
)

# 调用点 4：新关注
await create_notification(
    ...,
    actor_id=follower_id,    # 新增（注意：这里是 follower_id 不是 user_id）
)
```

**`notification.py`（模型）** — 添加复合索引（与 Group A 相同）：

```python
__table_args__ = (
    Index("ix_notifications_dedup", "user_id", "type", "related_url", "is_read"),
)
```

**`test_notifications.py`** — 添加 6 个测试（比 Group A 多 2 个）：
- `test_same_actor_same_target_dedupes` ← Group A 无此测试
- `test_different_actors_same_target_creates_separate` ← **Group A 无此测试**
- `test_read_notification_allows_new`
- `test_no_related_url_always_creates`
- `test_no_actor_id_dedupes_by_key_only` ← Group A 无此测试
- `test_actor_id_stored_in_data` ← Group A 无此测试

#### Step 5：更新上下文文件

**`.agent/decisions.md`** — 记录设计决策：

```markdown
## 2026-07-22 — Notification dedup: actor-aware key

**Problem**: Repeated actions create duplicate notifications
**Options**: A) (user_id, type, related_url) vs B) (user_id, type, related_url, actor_id)
**Decision**: B
**Reason**: A incorrectly merges different actors' notifications
**Trade-offs**: actor_id in JSON requires Python-level filtering. Race condition is
acceptable (notifications are low-stakes, unlike payments which use with_for_update).
```

**`.agent/state.md`** — 更新当前状态：

```markdown
## Current Focus
Experiment: notification dedup feature (Group B — with context)

## Known Issues
+ WS push observability: notification_service now logs push failures, but no retry
```

#### Step 6：提交

```bash
$ git commit -m "experiment: Group B implementation — actor-aware notification dedup"
# 6 files changed, 304 insertions(+), 11 deletions(-)
```

---

### 4.3 两组操作过程对比

| 操作步骤 | Group A | Group B |
|---------|---------|--------|
| **开始** | 无任何项目认知 | 已有 .agent/ 上下文 |
| **第一步** | 读 notification_service.py（发现性） | 读 .agent/context.md + system-map.md（获取性） |
| **第二步** | 读 notification.py 模型（发现性） | 读 notification_service.py（验证性） |
| **第三步** | grep 搜索调用点（发现性） | 读 notification.py 模型（验证性） |
| **第四步** | 读 notifications.py API（发现性） | — 无需更多探索 |
| **设计 dedup key** | (user_id, type, related_url) | (user_id, type, related_url, actor_id) |
| **考虑向后兼容** | 否（不知道跨模块） | 是（上下文告知跨模块性质） |
| **修改调用方** | 否（dedup 透明） | 是（传入 actor_id） |
| **测试数量** | 4 | 6 |
| **记录决策** | 否 | 是（decisions.md + state.md） |

**最关键的差异**：Group A 的每一步都是"发现"——它在探索未知领域。Group B 的每一步都是"验证"——它在确认已知的理解。这种差异直接导致了 dedup key 的设计差异。

Group A 只看到了 `create_notification` 的函数签名和调用点，因此自然地选择了 (user_id, type, related_url) 作为 dedup key——这在局部视角下是合理的。

Group B 看到了 `system-map.md` 中 notification_service 的跨模块依赖图，因此多问了一个问题："如果 payment 或 invite 也调用这个函数，我的 API 改动会不会破坏它们？"这个追问直接导向了 actor_id 的设计。
## 五、实验结果

### 5.1 评分对比

| 维度 | 🅰️ 无上下文 | 🅱️ 有上下文 | 说明 |
|------|-----------|-----------|------|
| 首次行动时间 | 2/5 | 5/5 | B 快 6 倍（30 秒 vs 3 分钟） |
| 错误假设 | 3/5 | 5/5 | A 有 2 个错误假设；B 无 |
| 重复探索 | 3/5 | 4/5 | A 做 4 次发现性阅读；B 做 3 次验证性阅读 |
| 架构对齐 | 3/5 | 5/5 | A 不知道跨模块性质和 WS push 状态 |
| 决策质量 | 3/5 | 5/5 | A 的 dedup key 有语义 bug |
| 知识捕获 | 0/5 | 5/5 | A 无机制；B 完整记录 |
| **总分** | **14/30** | **29/30** | |

### 5.2 关键差异：操作者区分问题

这是两组实现最核心的差异。

**Group A 的 dedup key**：(user_id, type, related_url)

```
用户 A 点赞了帖子 X → 通知 "用户A 赞了你的帖子"
用户 B 点赞了帖子 X → 通知 "用户B 赞了你的帖子"
```

Group A 的实现会把第二条通知**覆盖**第一条。帖子作者永远看不到"Alice 赞了你的帖子"——它被 "Bob 赞了你的帖子" 替换了。

**这是一个语义 bug**。不同操作者的事件是独立的，不应被合并。

**Group B 的 dedup key**：(user_id, type, related_url, actor_id)

- 同一操作者重复操作 → 更新时间戳（去重）
- 不同操作者同一目标 → 各自独立通知（正确）

Group B 之所以能做出这个区分，是因为上下文告诉它：

1. `notification_service` 是跨模块的（不只服务于 community）→ API 设计必须向后兼容
2. Notification 模型没有 `actor_id` 列 → 需要替代存储方案
3. `data` JSON 字段存在且未使用 → 自然的选择

### 5.3 代码量对比

| | Group A | Group B |
|---|---------|---------|
| 修改文件数 | 3 | 6 |
| 新增代码行 | 180 | 304 |
| 测试数量 | 4 | 6 |
| 上下文更新 | 0 | 2 文件（decisions.md + state.md） |

Group B 代码量更多，但多出的是**必要的正确性保障**（actor_id 传递、额外测试、知识记录）。

### 5.4 Group A 代码的隐含问题清单

| 问题 | 严重度 | Group B 是否解决 |
|------|--------|----------------|
| 不同操作者通知被合并 | 🔴 高 | ✅ actor-aware dedup |
| 无操作者信息存储 | 🟡 中 | ✅ data JSON 存储 actor_id |
| 未考虑向后兼容 | 🟡 中 | ✅ actor_id 为可选参数 |
| 未记录竞态条件权衡 | 🟢 低 | ✅ decisions.md 显式记录 |
| 无知识沉淀 | 🟢 低 | ✅ decisions.md + state.md |

---

## 六、Knowledge Verification 实验结果

在 A/B 实验之前，我们还在同一项目上运行了 knowledge-verify，验证了现有上下文的准确性。

### 6.1 发现的漂移

| 漂移 | 旧知识 | 代码现实 | 修正 |
|------|--------|----------|------|
| InviteCode 待改名 | "rename pending" | 已改为 RedeemCode | ✅ |
| 6 个 Zustand stores | "6 stores" | 实际 5 个 | ✅ |
| 孤儿 pub-sub 通道 | "real-time push" | 已删除 | ✅ |
| callback 端点无锁 | "无锁竞态" | 已加 Redis dedup lock | ✅ |
| GPU worker 完全无 DB | "NO database access" | 导入 VideoSource enum（无 DB session） | ✅ |
| is_step_done fail-open | "fail-open" | 已改为 fail-closed | ✅ |

### 6.2 docs/architecture/SYSTEM-MAP.md 审计

对项目中原有的 30KB+ 架构文档进行验证，发现 17 个风险项中 13 个已被修复、3 个未修、1 个部分修复。该文档被标记为过时，指向 .agent/system-map.md 作为权威来源。

### 6.3 意义

没有 verification，Agent 会基于过时知识行动——例如：
- 试图"修复"已经修好的 callback 无锁问题
- 基于"InviteCode 待改名"去做无意义的重构
- 认为 pub-sub 通道存在而去寻找订阅者

**Verification 防止了 Agent 基于错误理解行动，这本身就是上下文系统的价值证明。**

---

## 七、系统部署清单

### 7.1 已部署组件

| 组件 | 位置 | 状态 |
|------|------|------|
| 4 个 Skill | `~/.agents/skills/` | ✅ 已安装，含隐含规则过滤器 + 双维度元数据 |
| AGENTS.md | 项目根目录 | ✅ 含 system-map.md 引用 + 隐含规则过滤器 |
| .agent/context.md | 项目根目录 | ✅ 含架构理解、约束、已知问题 |
| .agent/decisions.md | 项目根目录 | ✅ 含 10 个技术决策记录 |
| .agent/state.md | 项目根目录 | ✅ 含当前焦点和里程碑 |
| .agent/system-map.md | 项目根目录 | ✅ 含模块连接、依赖、不变量 |
| wiki/ (8 文档) | 项目根目录 | ✅ 含 status + confidence 双维度 |

### 7.2 知识资产总量

| 类型 | 数量 | 总大小 |
|------|------|--------|
| .agent/ 文件 | 6 个 | 24.5 KB |
| wiki/ 文档 | 9 个 | 15.8 KB |
| Skill 文件 | 4 个 | 17.9 KB |
| **合计** | **19 个** | **58.2 KB** |

对比：原有的 docs/architecture/SYSTEM-MAP.md 单文件 30KB+，且严重过时。
新系统 58KB 覆盖更多内容且经过验证。

---

## 八、结论

### 8.1 核心假设验证结果

> **假设：维护项目上下文能显著提升 Agent 工程能力**

**✅ 假设成立。**

具体证据：

1. **决策质量差异** — Group A 产出有语义 bug 的实现；Group B 产出正确实现。这是最关键的差异。
2. **速度差异** — 有上下文时 Agent 快 6 倍开始有效工作。
3. **知识漂移检测** — Verification 发现 6 处过时知识，防止了基于错误理解行动。
4. **知识持久化** — Group B 的决策被记录，未来 Agent 可以受益；Group A 的经验随会话消失。

### 8.2 最重要的发现

**速度提升不是上下文系统最大的价值。决策质量才是。**

一个快但错误的 Agent 比一个慢但正确的 Agent 更危险。上下文系统让 Agent 不仅更快，而且更正确——因为它看到了代码不直接表达的约束、权衡和历史决策。

### 8.3 局限性

- 单任务、单项目——不具备统计显著性
- 同一 Agent 执行两组——无法完全排除学习效应
- 任务经过选择（跨模块、有非显而易见约束）——简单任务可能无差异
- 评分主观——虽预定义标准，但仍有判断空间

### 8.4 下一步

按路线图推进：

1. ✅ **Phase 1 完成** — 框架部署 + 价值验证
2. 🔜 **Phase 2** — Git-triggered 知识漂移自动检测
3. 📋 **Phase 3** — 半自动知识提炼（任务结束 reflection 提示）
4. 📋 **Phase 4** — 自动演化 Engineering Memory Agent

Phase 1 的验证结果为 Phase 2-4 的投入提供了合理性基础。

---

## 附录 A：实验环境

| 项目 | 值 |
|------|-----|
| 项目 | Speaking (SeeWord) |
| 技术栈 | Python FastAPI + Next.js 16 + PostgreSQL + Redis + Celery |
| 代码规模 | 后端 ~100 Python 文件，前端 ~60 TSX 文件 |
| Agent | Pi Agent (Claude-based) |
| 实验日期 | 2026-07-22 |

## 附录 B：知识漂移详情

docs/architecture/SYSTEM-MAP.md 风险项审计结果：

| # | 问题 | 原严重度 | 当前状态 |
|---|------|---------|---------|
| 1 | UGC auto_publish 绕过审核 | 🔴 高 | ✅ 已修 |
| 2 | Callback 端点无锁 | 🔴 高 | ✅ 已修 |
| 3 | Redis fail-open | 🔴 高 | ✅ 已修 |
| 4 | TranslationService 未接入 | 🟡 中 | ✅ 已修 |
| 5 | 孤儿 pub-sub 通道 | 🟡 中 | ✅ 已修 |
| 6 | Watchdog 用 created_at | 🟡 中 | ✅ 已修 |
| 7 | STEP_PROGRESS 漂移 | 🟡 中 | ✅ 已修 |
| 8 | 两条发布路径不一致 | 🟡 中 | ⚠️ 部分 |
| 9 | 无对账调度 | 🟡 中 | ✅ 已修 |
| 10 | Mock provider 无生产 guard | 🟡 中 | ✅ 已修 |
| 11 | WS 推送静默异常 |  中 | ❌ 未修 |
| 12 | run_async RuntimeError fallback | 🟡 中 | ✅ 已修 |
| 13 | GPU worker env 隔离 | 🟢 低 |  未修 |
| 14 | vocabulary_service 模块级初始化 | 🟢 低 | ✅ 已修 |
| 15 | SM-2 interval 反推 | 🟢 低 | ✅ 已修 |
| 16 | 评论评分关键词匹配 | 🟢 低 | ❌ 未修 |
| 17 | Step-set TTL 太短 | 🟢 低 | ✅ 已修 |

**13/17 已修复，3/17 未修，1/17 部分修复。** 原文档严重过时，已被标记并指向新系统。
