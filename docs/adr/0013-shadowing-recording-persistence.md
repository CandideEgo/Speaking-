# ADR-0013: 跟读（Shadowing）录音持久化 — 推翻 ADR-0002「零留存」决策

- **Status**: Accepted - 2026-08-14

## Context

ADR-0002（2026-07-03）决策「录音 = 录制→回放→下一句，零 API、零持久化」，并冻结 `SpeakingAttempt` 表停止新写入。但 2026-07-25（Sprint 1，commit `b894422`）实现「跟读」功能时**没有记录决策**：

- 新增 `ShadowingAttempt` 表（`shadowing_attempts`）持久化每一条跟读记录（`audio_url`/`duration_ms`/`is_satisfied`）；
- 录音 blob 落盘到 `media/shadowing/{user_id}/`，经 `/media/shadowing/*` 以 `?token=` JWT 鉴权回放（owner-only）；
- 3 个端点 `POST/GET /shadowing/attempts`、`GET /shadowing/stats` 注册在 `main.py:264`；
- 写 LearningEvent（`shadowed_sentences`）并递增学习档案计数；前端 watch 页有完整录音面板 + 历史列表，学习计划含「跟读练习」项，里程碑含「初次跟读」。

这直接违背 ADR-0002 的「录音不存」隐私承诺，且 `.agent/context.md` 的 Cut Features 仍宣称「跟读/Shadowing 模式已移除」——文档与代码双向漂移。

## Decision

- **Shadowing 正式成为活跃特性**：无 AI 评分（沿用 ADR-0002 的口语评分删除），但**有持久化**，录音仅限本人经 JWT 鉴权回放。
- **ADR-0002 相应段落 superseded**：其「录音零留存 / SpeakingAttempt 冻结」仅对「旧 speaking 模块」成立；新 Shadowing 特性以本 ADR 为准。
- 隐私立场：录音是个人敏感数据，保持 owner-only 访问（`/media/shadowing/{user_id}/` + token 校验）、不上推荐/公开 feed、日志不记录录音内容；鉴权模式与 ADR-0002 的「不落盘」动机一致（不公开、不外泄）。

## Consequences

- 文档更正：`.agent/context.md` Cut Features 移除「跟读/Shadowing 已移除」条目；Domain Terms 增补 `ShadowingAttempt`；`docs/operations/SECURITY.md` 数据分类含 shadowing 录音。
- `SpeakingAttempt`（旧表）继续冻结；`ShadowingAttempt` 为唯一活跃的跟读表。
- 录音存储随媒体卷增长：运维需监控 `media/shadowing/` 容量（后续可加保留策略，不在本 ADR 范围）。
- 若未来接入 AI 评分，需新 ADR（本 ADR 不授权）。
