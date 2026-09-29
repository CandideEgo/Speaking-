# ADR-0002: 砍掉 AI 口语评分；录音改为纯回放

- **Status**: Accepted — 2026-07-03

## Context

调查发现：

- **后端 AI 评分 100% 活着**——`speaking_service.py`（evaluate_speaking / evaluate_free_speaking / check_daily_limit）、`ai_service.py`（pronunciation_feedback / pronunciation_feedback_rubric / free_speaking_feedback）、`speaking_alignment.py`（wav2vec2 forced alignment）、`rubrics.py` 路由（6 端点）、`speaking.py` 路由（4 端点）、`rubric.py` 模型、schemas、测试——全在，路由都注册了。
- **但前端从不调用评分接口**。grep `speaking/practice | free-practice | attempts` 全前端零调用点。watch 页录音流程是 录音→回放→下一句，全程零 API 调用。录音早就跟评分解耦了。
- **"跟读"模块没砍干净**（用户记忆里 Phase 3 "砍 shadowing" 是错的）：Phase 3 只砍了独立 `/speaking` 路由 + `shadowing` 模式枚举；watch 页的"跟读"按钮 + 录音面板（`watch/[id]/page.tsx:480-572`）和首页"跟读 Shadowing"chip 仍在。
- `useSpeakingRecorder.ts` 是纯 MediaRecorder 包装，零 API——这就是用户要保留的"录音功能"。

用户决策：**AI 评分全部砍掉，录音保留**。录音定位经两轮 grilling 确认为**纯回放，零留存**（不存历史）。

## Decision

**后端删除（彻底）**：
- `backend/app/services/speaking_service.py` — 整文件
- `backend/app/services/transcription/speaking_alignment.py` — 整文件（wav2vec2）
- `backend/app/services/ai_service.py` 中 `pronunciation_feedback`、`pronunciation_feedback_rubric`、`free_speaking_feedback` 三个方法
- `backend/app/api/v1/speaking.py` — 整文件（4 端点）
- `backend/app/api/v1/rubrics.py` — 整文件（6 端点）
- `backend/app/models/rubric.py` — `SpeakingRubric` + `RubricCriterion` 模型
- `backend/app/schemas/speaking.py` — speaking schemas
- `backend/app/main.py` 中 speaking/rubrics 路由注册
- `backend/tests/test_speaking_eval.py`、`test_ai_rubrics.py`

**保留**：
- `SpeakingAttempt` 表（`models/learning.py:10-34`）——历史数据冻结，停止新写入（录音不存）。
- `ai_service.py` 其余方法（translate_batch、gloss_word_context、generate_practice_questions 等非评分方法）。

**前端**：
- `useSpeakingRecorder.ts` + `AudioWaveform.tsx` 保留（录音 + 波形）。
- `SpeakingRecorder.tsx`（死代码）删除。
- watch 页录音面板保留，但**去掉"跟读/shadowing"标签**（见 ADR-0005 重命名）。
- 首页"跟读 Shadowing / 自由说 Free speaking"chip 删除/重做。
- 全站 speaking 死统计组件删除（dashboard 卡片、admin 趋势图、users 口语次数、profile/onboarding speaking goal 选项、community speaking_share post type）——见 ADR-0003。

## Consequences

- ~10 个后端文件删除，~15 个前端文件失去 speaking 死组件。
- 录音 = 录制→回放→下一句，零 API、零持久化。`SpeakingAttempt` 表冻结。
- 口语相关的 streak / 目标 / 统计失去数据源 → 见 ADR-0003。
- 免费 3 次/日限额（`FREE_TIER_DAILY_LIMIT`）随 speaking_service 删除而消失（无评分即无限额意义）。
- watch 页录音无反馈——用户自评对照原声。这是有意的（ADR-0001 定位）。
