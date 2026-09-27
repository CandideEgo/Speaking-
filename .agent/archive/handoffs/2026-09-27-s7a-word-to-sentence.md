# Handoff: S7a 词→句链路（后端）

- Owner: `vocab-learning`
- Status: done
- Planner acceptance: 新加的词带 `subtitle_id`；回填脚本 dry-run 打印匹配/未匹配条数；`GET /api/v1/vocab-sets/{id}` 的单词能带出 `start_time`。

## 任务

过筛建词补写 `subtitle_id`（`vocab_set_service.py` 的 `_find_or_create_vocab`），并提供存量回填脚本（按 `(video_id, context_sentence)` 匹配 `subtitles` 表）。

## 已完成

- `services/vocab_set_service.py`：`_load_tokens` 改为返回 `(token, subtitle_id)`（首次出现句）；`_find_or_create_vocab` 增加 `subtitle_id` 参数，**仅在新建行时写入**——已有行不动，一词多视频不做多来源（设计文档 §7.4）。
- `services/vocab_set_service.py::get_set_detail`：外联 `Subtitle`，`words[]` 每项新增 `subtitle_id` 与 `start_time`（来源句被删或从未写入时为 `null`）。
- 新增 `scripts/backfill_vocabulary_subtitle.py`：默认 dry-run 打印候选/匹配/未匹配条数与匹配率；`--apply` 落库；精确匹配 `text_en` 优先，空白/大小写归一兜底；匹配不到的留 NULL（前端按钮隐藏）。

## 契约变更

- `GET /api/v1/vocab-sets/{id}` 响应 `words[]` 新增可选字段 `subtitle_id: string|null`、`start_time: number|null`（无 schema 文件，端点返回裸 dict；前端 `VocabSetWord` 已同步）。下游消费方：S7b/S8 的集合详情页。
- `backend/app/schemas/video.py`、`core/config.py`、`api/dependencies.py`、`frontend/src/lib/api.ts`：无。

## 关键决策

- 存量行不补写 `subtitle_id`：复用已有 Vocabulary 行时保持其原始来源句，避免一词多来源漂移；存量统一走回填脚本。
- 回填语义与设计文档一致：匹配不到 → 保持 NULL，不猜测。

## 遗留

- **回填脚本未在本地执行**：本机 Postgres/Docker 未运行（localhost:5432 拒连），dry-run 与 `--apply` 需在部署时于服务器执行（用户已确认要全量补）。
- `mypy app/` 在干净树上报 77 errors（基线曾为 53）：`.venv` 内 mypy 已升至 2.3.1，属环境漂移，与本次改动无关（本片文件 0 新增错误）——需要单独一轮基线决策。
- watch 页 `?sub=`/`?word=` 消费端见 S7b 交接条目。
