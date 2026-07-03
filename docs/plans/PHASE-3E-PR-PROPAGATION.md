# Phase 3e 实施计划：PR Propose-Back + 按行传播

> 范围：SubtitleChangeProposal (PR) 模型 + 决议 8 PR 状态机 + 决议 2 按行传播 + 标准版本体 admin-only 权限闸。
> 前置：Phase 2（标准版 + forked_from）+ Phase 3a-d（SubtitleRevision 审计）已实施。

## 核心设计

### "动过"判定（决议 2 的关键）
fork 创建时从标准版复制字幕（同 `sentence_index`），此时无 revision。之后：
- fork 用户编辑某行 → 写 `SubtitleRevision(scope="fork")`
- 标准版 PR 合并改某行 → 传播到 fork 时：
  - fork 该行**无** `scope="fork"` revision → 未动过 → **自动同步**标准版新值，写 `SubtitleRevision(scope="sync")`
  - fork 该行**有** `scope="fork"` revision → 动过 → 写 `SubtitleMergeableUpdate` 标记，UI 提示"有可合并更新"

**需扩展 `SubtitleRevision.scope`**：在现有 `"fork"|"standard"` 基础上加 `"sync"`（标准版传播来的同步）。判定"动过"只看 `scope="fork"`——避免一次同步后该行被误判为"动过"导致后续传播都标冲突。

### v1 限制（决议 A4）
- 传播只流向 `forked_from = standard_video_id` 的**直接 fork**（用 `ix_videos_forked_from` 索引）。fork-of-fork 不自动传播，提供手动「拉取标准版更新」入口（后续）。
- **同步传播**（在 merge API 内，非 Celery）。UGC 早期 fork 数量少；fork 数量大时改 Celery 任务。

## 新模型

### 1. SubtitleChangeProposal（PR）
```
id: str (PK)
standard_video_id: str (FK videos.id)      # 提议的目标标准版
source_url: str                              # 冗余，便于按 URL 查 PR
submitted_by: str (FK users.id)             # fork 持有者
title: str
body: str | None
changes: JSON                                # [{sentence_index, before:{field:old}, after:{field:new}}, ...]
status: str                                  # pending | merged | rejected | withdrawn
reviewed_by: str | None (FK users.id)
reviewed_at: datetime | None
rejection_reason: str | None
merged_at: datetime | None
created_at: datetime
```
- 按批粒度（一 PR 多行，`changes` 是 list），diff/merge 逐行（决议 8）
- 状态机：`pending → merged | rejected` + `withdrawn`（提交者可撤回；无 draft——fork 未提交的编辑即草稿）
- `changes` 的 before/after 是字段 delta（同 SubtitleRevision 格式），合并时逐行写回标准版本体

### 2. SubtitleMergeableUpdate（fork 可合并更新标记）
```
id: str (PK)
fork_video_id: str (FK videos.id)
fork_subtitle_id: str (FK subtitles.id)
sentence_index: int                          # 冗余，便于查询
standard_revision_id: str (FK subtitle_revisions.id)  # 触发的标准版编辑
proposal_id: str | None (FK subtitle_change_proposals.id)
created_at: datetime
UniqueConstraint(fork_video_id, fork_subtitle_id)      # 一行一个待合并标记
```

### 3. SubtitleRevision.scope 扩展
- 现有 `"fork"|"standard"` → 加 `"sync"`
- `"sync"` = 标准版 PR 合并传播来的自动同步（edited_by=None）
- 仅 model 注释 + migration 无需改（scope 是 String 列，值不受约束）

## migration
`w4x5y6z7a8b9_add_proposals_and_mergeable_updates`（head `v3w4x5y6z7a8`）
- create_table subtitle_change_proposals + 索引 (standard_video_id, status, submitted_by)
- create_table subtitle_mergeable_updates + 唯一约束

## API（8 个）

### PR 提交（fork 持有者）
- `POST /videos/{fork_video_id}/propose` — body: `{title, body, subtitle_ids: [str]}`
  - 校验 fork_video_id 属于 current_user 且是 fork（forked_from != None）
  - 找该 URL 的标准版（`_find_standard_for_url`）
  - 对每个 subtitle_id：对比 fork 当前值 vs 标准版同 sentence_index 当前值，生成 changes delta
  - 创建 PR（status=pending）

### PR 审批（admin）
- `POST /admin/proposals/{id}/merge` — admin 合并
  - 逐行写回标准版本体（按 sentence_index 找标准版 subtitle）+ 写 `SubtitleRevision(scope="standard")`
  - 触发传播（见下）
  - PR status=merged, merged_at=now
- `POST /admin/proposals/{id}/reject` — body: `{reason}` — admin 驳回

### PR 撤回（提交者）
- `POST /videos/proposals/{id}/withdraw` — 提交者撤回自己的 PR（仅 pending 可撤回）

### PR 列表
- `GET /admin/proposals?status=pending` — admin PR 队列（分页）
- `GET /videos/proposals/mine` — 我的 PR（分页）

### 可合并更新（fork 持有者）
- `GET /videos/{fork_video_id}/mergeable-updates` — fork 待合并列表
- `POST /videos/{fork_video_id}/mergeable-updates/{id}/apply` — 应用某个可合并更新
  - 把标准版该行当前值同步到 fork + 写 `SubtitleRevision(scope="sync")` + 删除 MergeableUpdate 标记

## 权限闸（标准版本体 admin-only，决议 5）
- `update_own_subtitle` / `update_own_subtitles_batch`：加检查——如果 video 是标准版本体（`video_standards.canonical_video_id == video_id`）→ 403 "标准版本体编辑请提 PR"
- 落在 `_require_editable_own_video`（已有 helper）内：标准版视频不可直接编辑
- admin 通过 `update_admin_subtitle` 仍可直接改（admin 通道）

## 传播流程（merge 时，在 proposal_service 内）
```
async def _propagate_to_forks(db, standard_video, merged_changes, proposal_id):
    # 1. 找直接 fork
    forks = SELECT * FROM videos WHERE forked_from = standard_video.id
    # 2. 对每个 fork，对每个 merged_change（按 sentence_index）
    for fork in forks:
        for change in merged_changes:
            fork_sub = SELECT subtitle WHERE video_id=fork.id AND sentence_index=change.sentence_index
            has_user_edit = EXISTS SubtitleRevision WHERE subtitle_id=fork_sub.id AND scope="fork"
            if not has_user_edit:
                # 未动过 → 同步标准版新值
                apply change.after to fork_sub
                write SubtitleRevision(scope="sync", edited_by=None, before=fork旧值, after=change.after)
            else:
                # 动过 → 标记可合并
                upsert SubtitleMergeableUpdate(fork_video_id=fork.id, fork_subtitle_id=fork_sub.id, ...)
```

## 文件清单
| 文件 | 改动 |
|------|------|
| `backend/app/models/subtitle_change_proposal.py` | 新增 PR 模型 |
| `backend/app/models/subtitle_mergeable_update.py` | 新增标记模型 |
| `backend/app/models/subtitle_revision.py` | scope 注释加 "sync" |
| `backend/app/models/__init__.py` | 注册 2 个新模型 |
| `backend/migrations/versions/w4x5y6z7a8b9_add_proposals_and_mergeable_updates.py` | 新表 migration |
| `backend/app/services/proposal_service.py` | **新** — PR 提交/合并/驳回/撤回 + 传播逻辑 |
| `backend/app/services/subtitle_edit_service.py` | （权限闸在 endpoint 层，service 不改） |
| `backend/app/api/v1/videos.py` | 8 个 endpoint + `_require_editable_own_video` 加标准版检查 |
| `backend/tests/test_proposal_propagation.py` | 新测试 |

## 测试用例
1. fork 持有者提交 PR（changes delta 正确）
2. admin 合并 PR → 标准版本体更新 + `SubtitleRevision(scope="standard")`
3. 合并传播到**未动 fork** → fork 该行同步 + `SubtitleRevision(scope="sync")`，无 MergeableUpdate
4. 合并传播到**动过 fork** → fork 该行不动 + MergeableUpdate 标记存在
5. fork 持有者应用 MergeableUpdate → fork 该行同步 + 标记清除
6. 提交者撤回 PR（pending → withdrawn）
7. admin 驳回 PR（pending → rejected）
8. 权限闸：owner 编辑标准版本体 → 403
9. 非Owner 不能提交别人的 fork 的 PR → 403
10. `cd backend && pytest tests/ -v` + `gitnexus_detect_changes`

## 验证
- 断点续传 + 标准版 + 审计既有测试不破
- 全量 pytest 通过
- detect_changes 确认改动触及预期 symbol（update_own_subtitle 权限闸 + 新 proposal/mergeable 模型未索引）
