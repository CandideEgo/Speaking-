# Project State

## Current Focus

ADR-0012 实施：砍社区 UGC，转向 AI 学习计划。迁出前置已完成（VideoLike→engagement + video_like_service；发布逻辑→video_publish；schema→common，commit 0c67c6e），测试 433/0。下一步：pg_dump 备份 → 建删表迁移 → 删 6 张社区表 + community 模型/service/API/前端组件 → 同步文档。

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

## Known Issues

- docs/architecture/SYSTEM-MAP.md explicitly marked outdated — `.agent/system-map.md` is authoritative
- **3 unfixed risk items**: comment quality scoring (pure keyword matching), auto_publish dual path (partially fixed), E2E test coverage
- E2E test for critical user flows still unchecked in completion criteria
- ICP compliance: awaiting individual business license for full deployment

## Next Steps

1. **ADR-0012 删表主体**：pg_dump 备份 + 建迁移 drop 6 张纯社区表（posts/post_likes/user_comments/comment_likes/comment_reports/follows），保留 video_likes 与 Video UGC 列 dormant
2. 删后端社区代码：community.py、community_service.py、api/v1/community.py(15 路由)、admin_service 审核、notification 4 个社区触发点（保留 dedup 机制用于非社区通知）
3. 删前端社区/创作者组件：community/page.tsx、components/community/、components/creator/、导航入口
4. 同步 .agent 文档反映 ADR-0012 完成
5. Recommendation system P2 (ADR-0011)
6. ICP-unblocked items (video storage, payment, frontend unit tests, E2E coverage)

## Last Updated

Date: 2026-07-24
- Phase 0-3 checkpoint committed (hardening / quality safety net / pipeline resume+fork / frontend design system)
- ADR-0012 migration prep done (VideoLike + publish logic extracted); table drop pending
