# Project State

## Current Focus

ADR-0012 实施完成：社区 UGC 已砍（6 表 + 后端代码 + 前端 UI 全删），VideoLike 迁出保留，video_likes 表 dormant。DB 迁移 b7c8d9e0f1g2 已应用，测试 409/0，tsc+lint 通过。下一步：转向 AI 学习计划（UserLearningProfile + LearningPlan + LearningEvent/WordMastery），推荐系统 P2。

## Completed Milestones

- **Phase 3: Pipeline Phase 4 frontend UI complete**
  - Resume status display: error retry with step-aware resume hint (transcribing vs post-transcribing)
  - Subtitle edit history viewer: already integrated (SubtitleHistory.tsx in VideoSubtitleEditorPanel)
  - Fork indicator on video cards: watch page, my-videos list, admin table
- Phase 1-10 all feature development (92 items, 100%)
- Frontend-backend unification P1-P4b (brand naming / visual / auth / error envelope + pagination)
- Frontend deep design development (dark mode / design system / visual polish)
- E2E Playwright CI gate (stabilized)
- mypy baseline gate
- ICP compliance Phase 1-3
- Actor-aware notification dedup (same actor → update timestamp, different actors → separate notifications)
- Engineering Context System Phase 1 deployed (meta: validates .agent/ context improves agent capability)
- **Phase 0: Pre-launch hardening complete**
  - WebSocket push error handling (distinguish disconnect vs unexpected errors)
  - GPU worker credential isolation guard (hard boundary, env var check)
  - auto_publish dual-path unified (shared `_publish_video` helper)
  - Dead User columns dropped (streak_count/longest_streak)
- **Phase 1: Screenshot matrix + visual polish complete**
  - Legacy color aliases replaced with semantic tokens (cream/navy/olive/teal → surface/ink/muted/success)
  - FormField component extracted
  - Admin mobile navigation drawer added
  - Playwright screenshot matrix updated (dynamic credentials, 52 screenshots)
- **Phase 2: Transcription/Translation Quality Safety Net complete**
  - Hallucination detection in transcription callback (repetition, nonsense, duration mismatch, empty ratio)
  - Translation batch retry with exponential backoff (3 retries, 2s base delay, permanent error detection)
  - Translation quality gate in finalize_video (coverage, short ratio, mixed CJK/Latin, length outliers)
  - Word-level score preservation during re-translation (annotating step preserves existing word_levels)
  - 11 new tests, all passing (433 total tests pass)
- **Phase 3: Pipeline resume + standard version + edit audit complete**
  - Resume status display with step-aware hint (transcribing vs post-transcribing)
  - Subtitle edit history viewer (SubtitleHistory.tsx in VideoSubtitleEditorPanel)
  - Fork indicator on video cards (watch page, my-videos, admin table)
  - Dead User columns dropped (streak_count/longest_streak)
- **ADR-0012: 砍社区 UGC，转向 AI 学习计划 complete**
  - 删 6 张社区表（posts/post_likes/user_comments/comment_likes/comment_reports/follows）+ 迁移 b7c8d9e0f1g2
  - 删后端：community 模型/service/API(15 路由)/schemas/admin 社区字段/community 测试
  - 删前端：community 组件/页面/导航/营销文案/creator 上传入口
  - 保留 VideoLike（engagement.py）+ video_likes 表 dormant + comment_service（视频评论评分）
  - 测试 409/0（-24 删除的 test_community.py）；tsc + lint 0 errors

## Known Issues

- docs/architecture/SYSTEM-MAP.md explicitly marked outdated — `.agent/system-map.md` is authoritative
- **3 unfixed risk items**: comment quality scoring (pure keyword matching), auto_publish dual path (partially fixed), E2E test coverage
- E2E test for critical user flows still unchecked in completion criteria
- ICP compliance: awaiting individual business license for full deployment

## Next Steps

1. 转向 AI 学习计划（ADR-0012 Decision 3）：UserLearningProfile + AI LearningPlan + LearningEvent/WordMastery 数据闭环，解锁推荐系统 behavior_events P0
2. Recommendation system P2 (ADR-0011)
3. ICP-unblocked items (video storage, payment, frontend unit tests, E2E coverage)

## Last Updated

Date: 2026-07-24
- ADR-0012 complete: 6 community tables dropped (migration b7c8d9e0f1g2) + backend/frontend community code removed
- Tests 409/0; tsc + lint 0 errors; DB at b7c8d9e0f1g2
