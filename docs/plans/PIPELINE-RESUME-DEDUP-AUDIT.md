# 架构改进方案：视频管线断点续传 + 标准版去重 + 编辑审计

> 状态：方案已设计，待实施。"标准版"8 项边界全部由 grilling 确认（5 承重 + 3 较低风险）。扩展 A/C/E/H 均已设计。
> 日期：2026-07-03
> 更新：2026-07-03 — 引入"标准版 (Standard Version)"概念，重构 Phase 2；grilling 确认 5 项承重边界 + 扩展 A 设计

## 问题概述

### A. 管线无法断点续传

视频处理到 70% 失败后，`retry_video()` 从 0 重新开始，浪费 GPU 时间。已完成的转录、翻译结果全部丢弃。

**根因**：
- `retry_video()` 无脑清空 Redis 步骤集 + 重置状态为 `pending_processing`
- `process_video`（head）总是无条件发转录任务，不检查 DB 是否已有字幕
- callback 接口无条件 `delete(Subtitle)` 再插新字幕
- `_is_step_done()` 只查 Redis，不查 DB（但 Redis 步骤集被清空了）

**已有的基础设施可复用**：
- `_is_step_done()` + `video:steps:{id}` Redis set 已实现步骤级跳过
- `finalize_video` 每步都检查 `_is_step_done()` 并跳过已完成步骤
- 只需保留步骤集、让 head 检查 DB 字幕即可实现续传

### B. 同一 source_url 重复消耗 GPU（无"标准版"概念）

当前去重是**按 Video 行**而非**按 source_url**：

- `submit_video()` 对 ready 视频做去重（复制元数据到新行），**但不复制字幕** → 第二个用户得到 "ready" 视频却没有字幕
- `seed_user_video()` **完全不做去重** → 同一 URL 创建多个空行，每个都可能再触发一次 GPU
- `source_url` 列无唯一约束，无索引
- 没有命名"该 URL 已处理过一次"这一事实，导致后续提交无法可靠地复用既有产物

**根因**：缺少"标准版"概念——同一个 URL 的处理产物（字幕 + 练习题 + 元数据）应当是共享起点，而非每个用户各跑一次管线。

### C. 编辑无审计/回滚

- 字幕编辑是原地覆盖，无审计日志、无版本历史、无回滚能力
- 视频元数据编辑同上
- `published_snapshot` 仅保留一代已审核状态，非通用回滚机制
- `subtitles` 表无 `updated_at` 列
- `videos` 表无 `updated_at` 列

---

## 核心概念：标准版 (Standard Version)

> ✅ 此概念经 grilling 已确认全部 8 项边界（见下文"Grilling 决议"）。术语已写入 `docs/GLOSSARY.md`。

**定义**：同一个 `source_url` 只走一次 GPU 管线。处理产物（字幕 + 练习题 + 元数据）即该 URL 的**标准版**，作为所有后续用户编辑的共享起点。

**触发**：当某个链接被"推荐"（首次提交并处理至 `ready`）后，该 URL 的标准版出现。

**用户行为**：
- 用户在标准版基础上**fork** 出属于自己的副本（独立 `Video` 行 + 复制来的字幕/练习题），对自己的副本微调。
- 其他用户提交同一 URL 时，同样 fork 自标准版，**不再触发 GPU**。

**与现有模型的关系**（已确认）：
- 标准版 = 该 `source_url` 第一个达到 `ready` 的 `Video` 行（用标志位标识为 canonical），**不是**新建一张表。首处理即标准版，无独立 promote 动作。
- 后续同 URL 提交 → fork：新建用户 `Video` 行，从标准版复制字幕 + 练习题快照 + 元数据，直接 `ready`、不触发 GPU。
- 标准版与 `is_official` 正交：UGC 视频首处理亦可成为该 URL 标准版（标准版是"该 URL 的去重基线"角色，不等于 official）。
- `published_snapshot`（行级，审核用）与标准版（URL 级，去重用）是两个正交维度，互不替代。

**价值**：GPU 一 URL 一跑；用户拿到可微调的初始版而非空壳。

### Grilling 决议（2026-07-03）

经 grilling 已确认 5 项关键边界：

1. **编辑模型 = Fork + 提议回写** — 用户 fork 独立副本微调；额外提供向标准版提 PR 的通道，合并后惠及未来 fork。需要 `SubtitleChangeProposal` 模型 + 合并流程。
2. **传播策略 = Git 式按行传播** — PR 合并后，未动过该行的已 fork 副本自动同步该行；动过的副本标"有可合并更新"，用户在创作者中心手动决定。需逐行 diff + 冲突检测。
3. **触发 = 首处理即标准版** — 某 URL 第一个提交并处理至 `ready` 的视频自动成为该 URL 标准版。"推荐"≈引入该链接。无独立 promote 动作。
4. **练习题 = Fork 快照可编辑，无 PR** — fork 时复制标准版练习题快照，用户可改自己的副本；练习题不走 propose-back（仅字幕有 PR）。字幕 PR 合并 → 标准版练习题重生；已 fork 副本的练习题快照不动。
5. **治理 = 管理员独占** — 仅管理员可直接改标准版本体 + 审/合/驳 PR。与 ADR-0004 一致，匹配当前单人运营。

已确认（2026-07-03 grilling 续）：

6. **标准版的标识与查找 = `video_standards` 表** — 单独表 `video_standards(source_url PK, canonical_video_id FK, created_at)`。`source_url` 为 PK → DB 层保证"一 URL 一标准版"（防并发 finalize 重复）。查找标准版 = PK 查询。替换 = 原子 repoint `canonical_video_id`。标准版是"角色"非视频固有属性，与 videos 表解耦。`forked_from` 仍在 videos 表（溯源，正交）。
7. **删除/替换 = Repoint + 旧标准保留 + 不 rebase** — 替换 = repoint `video_standards.canonical_video_id` 到更好的视频（如高质量 fork）；旧标准降为普通视频（有 fork 则保留媒体 + lineage，无 fork 可清）。有 fork 存在时禁硬删标准版（保护共享媒体，见 E1）。现有 fork 不 auto-rebase（与 A4 一致：propagation 只流向直接 fork 自当前标准版的副本；旧 fork lineage 指向旧标准，不自动同步新标准）。未来 fork 用新标准。
8. **PR 生命周期 = 按批 + pending→merged|rejected+withdrawn + fork 持有者提交** — 单 PR 粒度按批（一 PR 含多条字幕修改），diff/merge 仍逐行（与决议 2 propagation 一致）。状态机 `pending → merged | rejected` + `withdrawn`（无 draft——fork 未提交的编辑即草稿）。提交者 = 该 URL 标准版的 fork 持有者（admin 直接改标准版不需 PR）。

---

## Phase 1：管线断点续传 ✅ 已实施

> **状态（2026-07-03）**：已实施并测试通过（`tests/test_pipeline_resume.py` 4 用例 + 全量 313 passed）。改造点：`retry_video` 智能续传（以 DB 字幕存在性为判据）+ `process_video` head 发转录前查字幕跳过 + callback 不删已有字幕 + 新增 `video_service.count_subtitles`。续传基础设施 `is_step_done()` / `video:steps:{id}` 在 `pipeline_helpers.py`，`finalize_video` 本就是续传的——Phase 1 的关键是不再清空步骤集。
> **设计偏离**：用 DB 字幕存在性而非计划原文的 `processing_step in ("extracting","transcribing")` 分支——因为 error 路径（callback 失败、watchdog）会把 `processing_step` 清成 None，依赖它做分支判断不可靠；字幕存在性是 ground truth。
>
> 与"标准版"正交：续传解决"单次管线失败不重来"，标准版解决"同一 URL 不重跑"。两者组合后，单次 GPU 运行可断点续传，且每个 URL 只会有一次这样的运行。

### 1a. 改造 `retry_video` — 智能续传

**文件：** `backend/app/services/video_seed_service.py`

核心原则：**不清空已有的完成记录，让 `_is_step_done()` 发挥作用。**

```python
async def retry_video(db, video_id):
    video = ...
    # 只清 processing lock，不清 Redis 步骤集
    r.delete(f"video:processing:{video_id}")

    # 根据失败位置决定重置到哪个状态
    if video.processing_step in ("extracting", "transcribing"):
        # 转录阶段失败 → 检查 DB 是否已有字幕
        subtitle_count = await _count_subtitles(db, video_id)
        if subtitle_count > 0:
            # 字幕已存在 → 跳到 finalize（保留步骤集）
            video.status = VideoStatus.ready_subtitles
            video.error_message = None
            await commit_refresh(db, video)
            finalize_video.delay(str(video.id))
        else:
            # 无字幕 → 从头开始（这种情况才清步骤集）
            video.status = VideoStatus.pending_processing
            video.error_message = None
            video.processing_step = None
            video.processing_progress = 0
            r.delete(f"video:steps:{video_id}")
            await commit_refresh(db, video)
    else:
        # 翻译/标注/下载/转码失败 → 保留已完成步骤，重跑 finalize
        video.status = VideoStatus.ready_subtitles
        video.error_message = None
        await commit_refresh(db, video)
        finalize_video.delay(str(video.id))
```

### 1b. 改造 `process_video` — 跳过已有字幕

**文件：** `backend/app/tasks/video_processing.py`

发转录任务前检查 DB：

```python
subtitle_count = await _count_subtitles(db, video_id)
if subtitle_count > 0:
    logger.info("Video %s: subtitles exist (%d), skipping transcription", video_id, subtitle_count)
    finalize_video.delay(str(video.id))
    return
```

### 1c. 改造 callback — 不删除已有字幕

**文件：** `backend/app/api/v1/internal.py`

当前无条件 `delete(Subtitle)` → 改为先检查：

```python
existing_count = await db.scalar(
    select(func.count()).select_from(Subtitle).where(Subtitle.video_id == payload.video_id)
)
if existing_count > 0:
    logger.info("Subtitles already exist, skipping insertion")
else:
    # 插入新字幕（现有逻辑）
```

### 1d. 辅助函数

```python
async def _count_subtitles(db: AsyncSession, video_id: str) -> int:
    from sqlalchemy import select, func
    from app.models.subtitle import Subtitle
    result = await db.scalar(
        select(func.count()).select_from(Subtitle).where(Subtitle.video_id == video_id)
    )
    return result or 0
```

---

## Phase 2：标准版与按 URL 去重（重构） ✅ 已实施

> **状态（2026-07-03）**：已实施并测试通过（`tests/test_standard_fork.py` 6 用例 + 全量 319 passed）。新增 `VideoStandard` 模型（`source_url` PK）+ `videos.forked_from` 列 + `ix_videos_source_url` 索引 + Alembic migration `u2v3w4x5y6z7`。`finalize_video` 收尾 `_register_standard`（INSERT ON CONFLICT DO NOTHING，first-ready-wins）。`submit_video`/`seed_user_video` 命中标准版时 `_fork_video_from` 完整复制字幕+练习题+元数据，直接 ready 不触发 GPU。`POST /videos/{id}/fork` API（扩展 A4）。决议 6 落地采用 `video_standards` 表。决议 7（替换 repoint）/8（PR 生命周期）留 Phase 3。

> 原 Phase 2 仅"复制字幕到新用户行"。现重构为"标准版 fork"模型：首个 ready 视频成为该 URL 的标准版，后续提交 fork 自它（字幕 + 练习题 + 元数据），且绝不触发 GPU。
>
> 承重边界已由 grilling 决议 1/3/4 确认（fork+提议回写、首处理即标准版、练习题 fork 快照）；决议 6（标识方式）仍待选定，下方按倾向方案（`video_standards` 表）落笔。

### 2a. 标准版的建立 — 首个 ready 视频成为该 source_url 的标准版

**文件：** `backend/app/tasks/video_processing.py`（finalize 收尾处）/ `backend/app/models/video.py`

- `finalize_video` 将视频置为 `ready` 时，若该 `source_url` 尚无标准版，则将该行标记为标准版。
- 标识方式（决议 6 已定）：单独的 `video_standards(source_url PK, canonical_video_id FK, created_at)` 表——DB 层保证"一 URL 一标准版"，利于"标准版替换"（决议 7）与多副本共存。
- 对 `seed_video`（official）：official ready 视频天然即为该 URL 的标准版。

### 2b. 同 URL 后续提交 — fork 自标准版

**文件：** `backend/app/services/video_seed_service.py`（`submit_video` / `seed_user_video`）

命中标准版时，不再走"复制元数据但不复制字幕"的旧逻辑，而是完整 fork：

```python
standard = await _find_standard_for_url(db, source_url)  # 该 URL 的标准版 Video
if standard is not None:
    user_video = Video(
        user_id=current_user.id,
        title=standard.title,
        source_url=source_url,
        video_source=standard.video_source,
        thumbnail_url=standard.thumbnail_url,
        duration=standard.duration,
        difficulty_level=standard.difficulty_level,
        video_url_480p=standard.video_url_480p,
        video_url_720p=standard.video_url_720p,
        video_url_1080p=standard.video_url_1080p,
        processing_mode=standard.processing_mode,
        status=VideoStatus.ready,           # 直接 ready，跳过 GPU
        forked_from=standard.id,            # 新列：fork 溯源（扩展 A4；可指向任意 Video）
    )
    db.add(user_video)
    await commit_refresh(db, user_video)

    # 复制字幕（含 word_levels / grammar_note 等全部列）
    await _copy_subtitles(db, source_video_id=standard.id, target_video_id=user_video.id)
    # 复制练习题快照（决议 4：fork 快照可编辑，不走 PR）
    await _copy_practice_questions(db, source_video_id=standard.id, target_video_id=user_video.id)
    return VideoResponse.model_validate(user_video)

# 无标准版 → 走现有 pending_processing 流程（等管理员触发首次处理，处理完即成标准版）
```

`_copy_subtitles` / `_copy_practice_questions` 为新增辅助函数，逐行复制（注意 `VideoPracticeQuestion` 的 `(video_id, exam_level)` 唯一约束在新行上仍成立）。

### 2c. `seed_user_video` 加上去重

加入与 `submit_video` 相同的标准版查找 + fork 逻辑，不再无脑创建空行。

### 2d. `source_url` 索引与标准版查找

- 新增 `ix_videos_source_url` 索引（标准版查找高频）。
- `source_url` **不**加全局唯一约束——因为同一 URL 会有标准版 + 多个 fork 副本共存在 `videos` 表中。唯一性只作用于"标准版"层面（若用 `video_standards` 表，则 `source_url` 为 PK，天然唯一）。

---

## Phase 3：编辑审计与回滚（更新 — 区分标准版编辑 vs fork 编辑） ✅ 3a-3d 已实施

> **状态（2026-07-03）**：3a-3d 已实施并测试通过（`tests/test_subtitle_revisions.py` 5 用例 + 全量 324 passed）。新增 `SubtitleRevision` 模型（subtitle_id/video_id FK + edited_by FK + scope: fork|standard + before/after JSON）+ migration `v3w4x5y6z7a8`。`subtitle_edit_service.update_subtitle`/`update_subtitles_batch` 加 `edited_by` 参数，提交前 `_snapshot`+`_diff` 写审计（只存改变字段）；scope 由 `_determine_edit_scope`（视频是否标准版）判定。回滚 `POST /admin/{id}/subtitles/{sid}/rollback/{rid}` 从 `before` 恢复 + 写新审计。历史 `GET /admin/{id}/subtitles/revisions` + `GET .../{sid}/revisions`。
> **3e 已实施（2026-07-03）**：`SubtitleChangeProposal`(PR) + `SubtitleMergeableUpdate` 模型 + migration `w4x5y6z7a8b9`。`proposal_service`：propose / merge（写标准版 `scope="standard"` revision + 传播）/ reject / withdraw / list + mergeable-updates list/apply。传播（决议 2）：`forked_from=standard` 直接 fork，未动行（无 `scope="fork"` revision）自动同步写 `scope="sync"` revision，动过行写 `MergeableUpdate` 标记。`SubtitleRevision.scope` 加 `"sync"` 值。8 endpoint + `_require_editable_own_video` 加标准版 admin-only 权限闸（owner 编辑标准版→403）。v1 限制：传播只流向直接 fork（fork-of-fork 手动）；同步传播。测试 `test_proposal_propagation.py` 8 用例，全量 332 passed。决议 7（标准版替换 repoint）未实施，低优先。

> 引入标准版后，编辑审计需区分两类动作：① 用户编辑自己的 fork（私有，仅影响自己）；② 编辑标准版本体（影响所有未来 fork 的起点）。决议 1/5 已定：标准版本体仅管理员可直接改，普通用户走 propose-back（PR）。

### 3a. 新增 `SubtitleRevision` 模型

**文件：** `backend/app/models/subtitle_revision.py`

```python
class SubtitleRevision(Base):
    __tablename__ = "subtitle_revisions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid4()))
    subtitle_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    video_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    edited_by: Mapped[str | None] = mapped_column(String, nullable=True)
    scope: Mapped[str] = mapped_column(String, nullable=False)  # "fork" | "standard"（决议 1/5）
    before: Mapped[dict] = mapped_column(JSON, nullable=False)  # 只存被修改的字段前值
    after: Mapped[dict] = mapped_column(JSON, nullable=False)   # 修改后的值
    created_at: Mapped[datetime] = mapped_column(default=func.now())
```

### 3b. 字幕编辑时写入审计记录

**文件：** `backend/app/services/subtitle_edit_service.py`

在 `update_subtitle()` 中，提交前对比 before/after，写入 `SubtitleRevision`（`scope` 由当前编辑的是 fork 副本还是标准版本体决定）。需要修改路由传 `current_user` 到 service。

> 实现不变量：PR 合并 + 按行传播都走 `subtitle_edit_service`，自动继承 `word_levels` 重算（该 service 已在 `text_en` 变更时调 `annotate_text()`）。

### 3c. 新增回滚 API

```
POST /admin/{video_id}/subtitles/{subtitle_id}/rollback/{revision_id}
```

从 `SubtitleRevision.before` 读取前值写回字幕行。

### 3d. 新增查看编辑历史 API

```
GET /admin/{video_id}/subtitles/revisions?page=1&page_size=50
GET /admin/{video_id}/subtitles/{subtitle_id}/revisions
```

### 3e. 标准版本体编辑的权限/PR 模型（决议 1/5 已定）

- **治理**：标准版本体仅管理员可直接编辑（决议 5）；普通用户只能改自己的 fork。
- **propose-back**：新增 `SubtitleChangeProposal`（PR）模型——fork 持有者提交字幕修改建议，管理员审/合/驳；合并后写回标准版本体，并按决议 2（Git 式按行传播）流向已 fork 副本。
- **PR 生命周期**（决议 8 已定）：粒度按批（一 PR 多行，diff/merge 仍逐行）；状态机 `pending → merged | rejected` + `withdrawn`（无 draft——fork 未提交编辑即草稿）；提交者 = 该 URL 标准版的 fork 持有者。

---

## Phase 4：前端配合

### 4a. 管理面板续传状态提示

**文件：** `frontend/src/app/(admin)/admin/(shell)/videos/VideoDetailRow.tsx`

retry 时显示："已有 XX 条字幕，将从翻译步骤继续（无需重新转录）"

### 4b. 字幕编辑历史 UI

**文件：** `frontend/src/app/(admin)/admin/(shell)/videos/[id]/page.tsx`

字幕编辑器旁添加"历史"按钮 → 弹出编辑记录列表 → 一键回滚。

### 4c. 标准版 fork 提示（新增）

**文件：** `frontend/src/app/(main)/my-videos/[id]/page.tsx` 及创作者中心

当用户的视频是 fork 自标准版时，UI 标注"基于标准版"，并区分"我的修改"与"标准版基线"。按决议 2，未动过的行自动同步标准版更新；动过的行提示"有可合并更新"，提供"拉取标准版最新更新"入口。

---

## 扩展方向（grilling 2026-07-03）

标准版概念落地后牵出的扩展线。A/C/E/H 均已设计完成（C/E/H 含未深 grill 的较低风险项，已给推荐值）。

### A. 标准版目录 / 浏览入口 ✅ 已设计

1. **fork 门槛**：标准版到 `ready` 即可被 fork，与 UGC `review_status` 无关。两条可见性轴拆开——"可 fork"（ready）vs "社区 feed 可见"（published）。处理一个 URL = 接受其字幕成为共享基线。
2. **目录收录范围**：仅 published 标准版（official published + UGC published）可被浏览发现。draft 标准版不上架（保护 owner 草稿），但仍可经提交同 URL 被 fork（submit-path）。
3. **目录形态**：不新建独立目录面。在首页/社区 feed 的视频详情页加「Fork 到我的视频」按钮。发现复用现有流量，无内容重复。submit 流处理"已知 URL"；观看页按钮处理"看到喜欢的想 fork"。
4. **fork 溯源**：fork 你正在看的视频（可能是标准版，也可能是别人 fork 后发布的），`forked_from` 记录溯源，允许 fork-of-fork。dedup 仍生效。propose-back 始终指向该 URL 的标准版（根）。

**实现影响（反馈到 Phase 2/3）**：
- `forked_from` 列可指向任意 Video（不限于标准版），需建索引。
- propagation（决议 2）的 fork-of-fork 场景需规则：v1 可限定"标准版 PR 合并的按行传播仅流向直接 fork 自标准版的副本；fork-of-fork 副本提供手动「拉取标准版更新」"，避免继承祖先编辑的逐行基线判定复杂度。后续可深化。
- 新增「Fork」按钮 API：`POST /videos/{video_id}/fork`，复制该 video 的字幕 + 练习题快照 + 元数据到新 user Video 行，`forked_from=video_id`，`status=ready`，不触发 GPU。

### C. 贡献者声誉 / XP ✅ 已设计

1. **分数构成**：分数 = 累计 merged PR 数。首提 attribution 与 fork 数为展示型元数据，不计分——激励干净：改进内容才涨分。先独立计数 + 徽章，XP 系统落地后并入（代码库现无 XP 模型，community-platform-plan Phase 3 规划）。
2. **贡献者展示**：标准版页面显首提者（attribution 标签）+ PR 贡献者列表（按贡献数排序）。社交证明"社区维护"。fork 带出"基于 X 人贡献的标准版"。
3. **个人 profile**（推荐，未深 grill）：显累计 merged PR 数 + 贡献过的标准版列表 + 徽章。无 functional 解锁（单人运营，admin 审批是唯一闸）。
4. **防 farming**（推荐）：admin-only 审批是主闸（决议 5）；加软上限——每用户 pending PR 数上限（如 5），防垃圾提交堆积。rejected PR 不扣分（无负声誉）。
5. **attribution 持久性**（推荐）：首提者 attribution 为永久元数据，标准版被替换（决议 7）或提升为 official（扩展 H）时保留。

### E. Link rot / 媒体失效 ✅ 已设计

> 代码事实：finalize 下载+transcode 到本地 `/media/{id}_*.mp4`（rot-proof）；transcode 可优雅失败 → ready 但 `video_url` 为 null（处理失败，非 rot）；thumbnail 远程 YouTube URL（会 rot）；`video_url` 始终本地或 null，从不指远程。

1. **媒体共享**：fork 复制标准版的 `video_url` 字符串值，共享同一份本地媒体文件（省磁盘）。代价：删标准版会断所有 fork 播放 → 决议 7 需守护（有 fork 存在时不删媒体文件，或媒体引用计数）。
2. **检测面**：thumbnail rot（远程）+ 源 URL rot（re-localization 能力）+ 本地媒体文件丢失（单点，所有 fork 共享，lazy 检查）。本地媒体本身 rot-proof，无需周期查。
3. **降级响应**：失败统一标 `media_degraded`。降级标准版**仍可 fork**（字幕/练习题照常复制），fork 继承 `media_degraded`。UI 显"源失效，字幕可用"，fork 前提示。标准版价值锚点 = 字幕/练习题，非媒体。
4. **检查调度**（推荐，未深 grill）：beat 周期查 thumbnail + 源 URL 可达性（如每日）；本地媒体文件存在性 lazy 查（访问时）。不自动 re-localize（消耗 GPU/带宽，源失效时无效）。
5. **补源**（待定，未来扩展）：媒体失效后 fork 用户/管理员补新源 URL 重新 localize。v1 不做。

### H. UGC → official 提升 ✅ 已设计

> 代码事实：`update_video` 已支持 admin 设 `is_official`；homepage 过滤 `is_official+published`，community feed 过滤 `is_official=False+published` → 提升 = 移出 community feed、进 homepage。无需新机制。

1. **触发**：admin 手动提升 + 信号辅助。管理面板提供"高互动 UGC 标准版"候选列表（fork 数 / merged PR 数 / likes 排序）。admin 决定提谁。与决议 5 一致。
2. **副作用**：提升只改可见性（`is_official=True` → 上 homepage、移出 community feed）。`user_id`/attribution 不变；字幕编辑权不变（标准版本体仍 admin-only via PR，决议 5；owner 也走 PR）；owner 保留下架权（`is_published=False`）。
3. **标准版标志不变**：提升后仍是该 URL 的标准版（标准版与 `is_official` 正交）。
4. **同意与可逆**（推荐，未深 grill）：UGC 提审条款写明"高质量作品可被提升为 official"，无需逐次同意；owner 保留下架权（demote = admin 设 `is_official=False` 回 UGC，可逆）。
5. **候选信号**（推荐）：fork 数 + merged PR 数 + likes 综合排序，admin 面板"提升候选"视图。

---

## 关键文件清单

| 文件 | Phase | 改动 |
|------|-------|------|
| `backend/app/services/video_seed_service.py` | 1,2 | retry_video 续传 + submit_video/seed_user_video fork 自标准版 |
| `backend/app/tasks/video_processing.py` | 1,2 | process_video 跳过已有字幕 + finalize 收尾标记标准版 |
| `backend/app/api/v1/internal.py` | 1 | callback 不删除已有字幕 |
| `backend/app/models/video.py` | 2 | `forked_from` 列（决议 A4） |
| `backend/app/models/video_standards.py` | 2 | 标准版标识表（决议 6：source_url PK + canonical_video_id FK + created_at） |
| `backend/app/models/subtitle_revision.py` | 3 | 新增模型（含 `scope`） |
| `backend/app/models/subtitle_change_proposal.py` | 3 | PR 模型（决议 1 propose-back） |
| `backend/app/models/__init__.py` | 3 | 注册新模型 |
| `backend/app/services/subtitle_edit_service.py` | 3 | 编辑时写审计记录（区分 scope）；PR 合并/传播走此 service 继承 word_levels 重算 |
| `backend/app/api/v1/videos.py` | 2,3 | `POST /videos/{id}/fork` + 回滚 + 历史查询 API |
| `backend/migrations/versions/xxx.py` | 2,3 | 新增列 + 新表 migration |
| `frontend/.../VideoDetailRow.tsx` | 4 | 续传状态提示 |
| `frontend/.../videos/[id]/page.tsx` | 4 | 编辑历史 UI |
| `frontend/.../my-videos/[id]/page.tsx` | 4 | 标准版 fork 标注 + 拉取更新入口 |
| `frontend/.../watch` 视频详情页 | A | 「Fork 到我的视频」按钮 |

## 验证

1. **断点续传**：视频转录完成 → 手动设 error → retry → 确认只跑 finalize（跳过转录）
2. **标准版 fork**：用户A提交 URL → 处理至 ready（成为标准版）→ 用户B提交同 URL → 确认 B 直接 ready 且有字幕+练习题、未触发 GPU
3. **练习题复制**：fork 后 B 的 `VideoPracticeQuestion` 行存在且与 A 一致
4. **编辑审计**：编辑字幕 → revisions API → before/after 正确、scope 正确 → 回滚 → 字幕恢复
5. **PR propose-back**：fork 持有者提字幕 PR → 管理员合并 → 标准版本体更新 → 未动该行的 fork 自动同步、动过的标"可合并更新"
6. **word_levels 联动**：PR 合并改 text_en → 标准版与同步到的 fork 该行 word_levels 重算
7. `cd backend && pytest tests/ -v`
8. `cd frontend && npx tsc --noEmit`
