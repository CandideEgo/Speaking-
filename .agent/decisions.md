# Technical Decisions

## 2026-07-03 — Product positioning: video vocabulary + community UGC

**Problem**: Speaking scoring had low ROI, product direction unclear
**Options**: A) Continue investing in speaking scoring; B) Cut scoring, focus on video vocabulary + community UGC
**Decision**: B
**Reason**: Speaking scoring API cost high, accuracy unstable; video vocabulary loop clearer
**Trade-offs**: Lost speaking practice differentiation, but gained clearer product focus and lower operating cost
**ADR**: [0001](docs/adr/0001-product-positioning.md), [0002](docs/adr/0002-cut-ai-scoring-recording-playback.md)

---

## 2026-07-03 — Recording changed to playback-only

**Problem**: AI scoring pipeline complex and unreliable
**Options**: A) Keep AI scoring, switch models; B) Playback-only, zero API
**Decision**: B
**Reason**: Reduce complexity and cost, preserve basic practice experience
**Trade-offs**: No AI feedback on pronunciation, but eliminated unreliable API dependency
**ADR**: [0002](docs/adr/0002-cut-ai-scoring-recording-playback.md)

---

## 2026-07-03 — UGC pipeline admin-triggered

**Problem**: Auto-processing UGC has security and cost risks
**Options**: A) Auto dispatch on submit; B) Admin manually triggers
**Decision**: B
**Reason**: Control GPU cost, audit content quality, prevent malicious submissions
**Trade-offs**: Slower UGC turnaround, but safe from resource exhaustion attacks
**ADR**: [0004](docs/adr/0004-ugc-pipeline-admin-triggered.md)

---

## 2026-07-03 — Unified frontend component library

**Problem**: Component styles inconsistent, high maintenance cost
**Options**: A) Independent design per page; B) Unified component library with watch page as anchor
**Decision**: B
**Reason**: Reduce duplicate code, unify visual experience
**Trade-offs**: Less per-page creative freedom, but consistent UX and lower maintenance
**ADR**: [0005](docs/adr/0005-frontend-rebuild-unified-components.md)

---

## 2026-07-03 — Standard version + Fork + Propose-back

**Problem**: Same URL submitted by multiple users causes duplicate GPU processing
**Options**: A) Full processing every time; B) Standard version + fork + propose-back
**Decision**: B
**Reason**: Dedup saves GPU, shared editing reduces maintenance
**Trade-offs**: More complex data model (forked_from, propose-back PRs), but N× GPU cost savings
**ADR**: [0006](docs/adr/0006-standard-version-fork-propose-back.md)

---

## 2026-07-03 — Redemption code 4-state machine

**Problem**: Redemption code lifecycle unclear, no refund/revocation support
**Options**: A) Simple used/unused binary; B) 4-state machine (unused/redeemed/revoked/expired)
**Decision**: B
**Reason**: Prevent abuse, support refund revocation, proactive expiry
**Trade-offs**: More complex state management, but full audit trail and refund capability
**ADR**: [0007](docs/adr/0007-redemption-code-lifecycle.md)

---

## 2026-07-03 — Recommendation system planning

**Problem**: Homepage `created_at desc` sorting has no personalization
**Options**: A) Continue time-based sorting; B) learning_score + recommendation strategy
**Decision**: B
**Reason**: Improve content discovery efficiency
**Trade-offs**: Requires behavior collection infrastructure first (P0 blocker), but enables long-term engagement
**Status**: P1 scoring (scoring_tasks hourly/daily) + recommendation feed (/recommendations/home, /recommendations/category) + behavior_events 已落地；深度个性化待推进
**ADR**: [0011](docs/adr/0011-recommendation-system.md)

---

## 2026-07-20 — Frontend-backend unification

**Problem**: Naming/types/error formats/pagination inconsistent
**Options**: A) Gradual fixes; B) 4-phase systematic unification
**Decision**: B
**Reason**: Reduce maintenance cost, unify development experience
**Trade-offs**: Large coordinated change, but eliminates accumulated inconsistencies

---

## 2026-07-19 — Dark mode via CSS semantic tokens

**Problem**: Light mode only
**Options**: A) `dark:` variant per component; B) CSS semantic tokens + `.dark` variable block
**Decision**: B
**Reason**: One variable block cascades entire site, lowest maintenance cost
**Trade-offs**: Less per-component control, but 40+ fewer file changes and automatic dark mode for new components

---

## 2026-07-22 — Actor-aware notification dedup

**Problem**: Repeated actions by the same user (like→unlike→re-like) create duplicate notifications
**Options**: A) No dedup (status quo); B) Full dedup (same type+related_url → single notification); C) Actor-aware dedup (same actor → update, different actors → separate)
**Decision**: C
**Reason**: "Alice liked your post" and "Bob liked your post" are distinct events; only same-actor repeats should merge
**Trade-offs**: Non-atomic check-then-insert (rare concurrent duplicates possible), but avoids row-level locking on a high-write table; notifications are low-stakes so occasional duplicates are acceptable

---

## 2026-07-23 — Quality safety net: fail-fast vs fail-through

**Problem**: Transcription/translation quality issues silently enter production (repetition hallucination, empty translations, lost word_levels on re-run)
**Options**: A) Fail-fast (mark video error, stop pipeline); B) Fail-through (log warning, continue with degraded content); C) Hybrid (critical issues fail, minor issues warn)
**Decision**: C
**Reason**: Hallucination destroys user trust (repetitive nonsense subtitles), so it fails fast. Translation coverage issues may be transient (API rate limit), so they warn but continue — the per-item retry in `_translate_subtitles` may fill gaps on next run. Word_levels are compute-cheap to re-derive but expensive to manually curate, so they must be preserved on re-runs.
**Trade-offs**: More complex quality gate logic (3 thresholds × 2 actions), but appropriate severity handling for each issue type

---

## 2026-07-23 — Translation retry: exponential backoff vs circuit breaker

**Problem**: Translation APIs intermittently fail (network timeout, 5xx, rate limit)
**Options**: A) Circuit breaker (stop calling after N failures); B) Exponential backoff per-request (2s → 4s → 8s); C) Concurrent dual-engine with cancellation (already implemented)
**Decision**: B + C (layered)
**Reason**: Circuit breakers add complexity (state machine, half-open recovery) for a problem that transient retries solve. Exponential backoff is simple and effective for API hiccups. Concurrent dual-engine (primary + fallback) handles engine-level outages, while per-request retry handles transient network issues within a single engine.
**Trade-offs**: 3 retries × up to 8s delay adds latency, but only on failure paths; success path is unchanged. Permanent errors (4xx/auth) are detected and not retried.

---

## 2026-07-23 — Fork indicator display strategy: where and why

**Problem**: `forked_from` exists in the data model but users can't tell if a video is forked from a standard version
**Options**: A) Show everywhere (all video cards, lists, details); B) Show only in admin panel; C) Show in user-facing locations where lineage matters (watch page, my-videos, admin table)
**Decision**: C
**Reason**: Fork lineage matters most in three contexts: (1) watch page — learners should know if they're watching a fork or the original; (2) my-videos — creators need to distinguish their forks from originals; (3) admin table — admins managing the standard version ecosystem need visibility. Other locations (homepage feed, search results) don't need the noise — the badge adds cognitive load without value there.
**Trade-offs**: Inconsistent badge presence across pages, but lower visual noise where lineage is irrelevant. A reusable `ForkBadge` component makes the decision reversible — adding/removing from a page is one line.

---

## 2026-07-23 — Video status response: subtitle_count for resume hint

**Problem**: Admin retrying a failed video doesn't know whether transcription will be skipped
**Options**: A) Add `subtitle_count` to status response; B) Infer from `processing_step` (unreliable — error paths clear it to null); C) Add a separate `can_resume` boolean
**Decision**: A
**Reason**: `processing_step` is unreliable as a resume signal because error paths (watchdog, callback failure) clear it. Subtitle existence in DB is ground truth — if subtitles exist, `retry_video` skips transcription. Exposing the count (not just boolean) lets the UI show "已有 47 条字幕" for richer feedback.
**Trade-offs**: Extra DB query per status poll, but `count_subtitles` is a cheap indexed query. The alternative (inferring from `processing_step`) would create misleading UI when the step is null.

---

## 2026-07-23 — Word_levels preservation: compute-on-null vs always-recompute

**Problem**: Re-running finalize_video (retry/recover) overwrites manually curated word_levels
**Options**: A) Always recompute (simple, but destroys manual overrides); B) Compute only when null (preserves overrides, but may miss ECDICT updates); C) Versioned annotation (track ECDICT version, recompute when dictionary updates)
**Decision**: B
**Reason**: Manual word_levels overrides are the result of admin review time — far more valuable than auto-computed baseline. ECDICT updates are rare (annual CET syllabus changes); when they happen, a targeted backfill script is more appropriate than always-recomputing on every re-run.
**Trade-offs**: If ECDICT is updated and a video is re-processed for other reasons, the old word_levels remain. This is acceptable — the backfill script `recompute_word_levels` handles bulk updates when needed.

---

## 2026-07-24 — Video storage: HK VPS file server vs OSS vs source station local

**Problem**: Source station disk 78% full (29GB/40GB). Video files (1GB, growing) served through Python Range service consuming source station bandwidth+CPU. OSS not purchased.
**Options**: A) Buy Alibaba Cloud OSS + CDN (monthly cost, best CDN performance for mainland users); B) Use HK VPS as file server (39GB free, zero cost, 46ms latency from source); C) Keep on source station + clean Docker cache (temporary, doesn't solve growth)
**Decision**: B
**Reason**: HK VPS has 39GB idle, zero marginal cost. Source→HK latency 46ms acceptable for video streaming (bandwidth matters more than first-byte latency). OSS would add monthly billing for a pre-revenue product. Source station nginx caches 7d, reducing HK bandwidth consumption.
**Trade-offs**: Mainland users traverse source station→HK VPS for video bytes (vs direct CDN with OSS). New video files require manual SCP to HK VPS (not automated in pipeline). HK VPS is single point of failure for video playback (no replication). Can upgrade to OSS+CDN later if bandwidth/latency becomes an issue.

---

## 2026-07-24 - ADR-0012: Cut social community UGC, pivot to AI learning plan

**Problem**: Social community UGC doesn't solve the core English-learning problem (find content / understand video / remember vocab / sustain learning), yet brings moderation cost + system complexity (6 tables, 4 notification triggers, admin review block, creator center, propose-back PRs).
**Options**: A) Keep investing in community; B) Cut social community, keep VideoLike (feeds recommendation + watch-page like button), pivot to AI LearningPlan
**Decision**: B
**Reason**: Community doesn't serve the learning loop (goal -> plan -> watch -> vocab -> practice -> review -> adjust). The real long-term capability loop is AI-driven learning plans + spaced repetition, not social UGC. VideoLike kept because it feeds recommendation like_count / is_featured and the watch-page like button at near-zero ops cost.
**Trade-offs**: Sunk cost (Phase 4 community alignment, actor-aware dedup's community triggers) discarded; dedup mechanism retained for non-community notifications. 6 tables dropped (irreversible - pg_dump backup taken); video_likes + Video UGC columns kept dormant to reduce irreversibility. comment_service (video comment quality scoring) retained - independent of social community.
**ADR**: [0012](docs/adr/0012-cut-community-ugc-pivot-to-learning-plan.md)

---

## 2026-07-24 — LearningEvent vs BehaviorEvent: separate models

**Problem**: ADR-,12 needs structured learning events (completed_video, learned_words, etc.) for profile aggregation, daily goal tracking, and recommendation system. BehaviorEvent already exists for raw interaction logging.
**Options**: A) Add semantic event types to BehaviorEvent8; B) Separate LearningEvent model
**Decision**: B
**Reason**: Different query patterns (LearningEvent: daily aggregation, streak, cycle counting; BehaviorEvent: analytics, debugging, recommendation personalization), different retention policies (LearningEvent: long-lived for profile; BehaviorEvent: potentially high-write, shorter retention), different nullability (LearningEvent always has user_id; BehaviorEvent allows anonymous). Mixing would bloat BehaviorEvent with semantic events that have different access patterns.
**Trade-offs**: Two event tables to maintain. Event emission from existing services (practice, behavior, vocabulary) must be non-blocking (try/except, logged but never raised) to avoid disrupting existing flows. LearningEvent emission is a side-channel, not a replacement for BehaviorEvent.

---

## 2026-07-24 — WordMastery: enhance Vocabulary vs new table

**Problem**: ADR-0012 needs per-word mastery tracking (exam_level, first_seen_at, correct_count) for per-level mastery breakdowns and accuracy tracking. Vocabulary already has SM-2 fields (mastery_level, ease_factor, interval_days, review_count, next_review_at).
**Options**: A) Separate WordMastery table with FK to Vocabulary; B) Add columns to existing Vocabulary model
**Decision**: B
**Reason**: Vocabulary already has the user-word unique constraint and SM-2 fields. A separate WordMastery table would duplicate the (user_id, word) unique constraint, creating a two-source-of-truth problem and requiring JOINs on every vocabulary query. Three additional columns (exam_level, first_seen_at, correct_count) are lightweight and naturally belong on the same row.
**Trade-offs**: Vocabulary table grows wider (now 18+ columns). If mastery tracking needs fundamentally different semantics in the future (e.g., per-context mastery where the same word has different states in different videos), a separate model would be needed — but current SM-2 semantics are global per user-word.

---

## 2026-07-24 — UX design direction: Apple HIG + Material Design + Linear principles

**Problem**: Frontend UX had accumulated anti-patterns: information overload on watch page, 6-button decision paralysis in vocab review, jarring full-page spinners, mandatory onboarding, inconsistent labels, silent failures, fake load-more buttons, and no undo for destructive actions.
**Options**: A) Ad-hoc fixes as reported; B) Systematic UX audit against established design principles, then batch fix
**Decision**: B — adopt three design principle frameworks as ongoing guidance:
  - **Apple HIG**: Clarity (one focal point per screen), Deference (never block user from value), Depth (progressive disclosure)
  - **Material Design**: Feedback (every action has visible result), Reversibility (prefer undo over confirm), Continuity (skeleton over spinner)
  - **Linear**: Speed (keyboard shortcuts for high-freq ops), Cognitive load reduction (3 choices max for repeatable actions)
**Reason**: These three frameworks complement each other — HIG for hierarchy/focus, Material for interaction feedback, Linear for speed/efficiency. They provide objective criteria for future UX decisions rather than subjective taste.
**Trade-offs**: Some patterns require more code (undo toast > confirm dialog, skeleton > spinner). Watch page progressive disclosure adds one click to reach practice — acceptable because most viewing sessions don't need practice every sentence.
**Established patterns (follow in future work)**:
  - Destructive actions → optimistic delete + undo toast (5s window), NOT confirm dialog
  - Loading states → ShellSkeleton (layout-aware), NOT FullPageSpinner
  - High-frequency repeated actions → max 3 choices + keyboard shortcuts
  - Complex pages → progressive disclosure (collapsed CTA → expand on demand)
  - User-initiated saves → toast on failure, never silent catch
  - Navigation labels → identical across mobile TabBar and desktop Sidebar

---

## 2026-08-14 — 全站审查修复：关键决策

**Problem**: 全站审查（docs/progress/REVIEW-2026-08-14.md，87 条发现）暴露 2 个可利用高危漏洞 + 系统性文档漂移。
**Options**: A) 只修高危；B) 按 P0/P1/P2 分批全量修复
**Decision**: B（12 批次当日完成，627 后端测试 + 前端 tsc/lint/vitest/build 全绿）
**Reason**: 安全漏洞（上传 XSS/SSRF）直接威胁账户与云凭证；文档漂移（Shadowing「复活」无记录）会误导后续 Agent。
**Trade-offs**: 限流在 Redis 故障时降级为 in-memory（限流弱化但不再 500，符合 fail-open 不变量）；媒体门控对草稿增加一次 DB 查询（60s TTL 缓存）。
**ADR**: [0013](docs/adr/0013-shadowing-recording-persistence.md)

---

## 2026-08-14 — JWT 库从 python-jose 迁移到 PyJWT

**Problem**: python-jose 3.3.0 已停止维护且有 CVE-2024-33663/33664；PyJWT 已在依赖中但未被使用。
**Options**: A) 继续用 python-jose；B) 迁移 PyJWT
**Decision**: B
**Reason**: PyJWT 维护活跃；两库的 encode/decode 调用签名对本项目用法完全兼容（encode(payload, key, algorithm=)、decode(token, key, algorithms=[])，异常基类 InvalidTokenError 覆盖过期/签名错误）。
**Trade-offs**: 迁移仅涉及 security.py 与 2 个测试文件的 import + 异常类；旧 python-jose 签发的 token 可由 PyJWT 正常解码（HS256 同构）。
**Deferred**: fastapi 升级（本地镜像无新版，starlette CVE-2024-47874 在 pip-audit 显式 ignore 中，待 CI 可验证后升级）。

---

## 2026-08-14 — 跟读（Shadowing）录音持久化（正式化既有事实）

**Problem**: 2026-07-25 实现 Shadowing 时未记录决策，与 ADR-0002「录音零留存」冲突；文档声称已砍而代码活跃。
**Options**: A) 回退 Shadowing 到零持久化；B) 正式承认持久化特性
**Decision**: B（详见 ADR-0013）
**Reason**: 前端全链路（录音面板/计划项/里程碑）+ 3 端点 + 测试已上线，回退成本高；持久化录音 owner-only JWT 鉴权，隐私可控。
**Trade-offs**: 录音存储增长需监控（media/shadowing/ 容量）；「录音不落盘」的旧隐私承诺作废。
**ADR**: [0013](docs/adr/0013-shadowing-recording-persistence.md)

---

## 2026-08-28 — 会员模型：登录墙 + Free 解锁制（D0）

**Problem**: 产品设计规划-2026-08 要求登录墙 + 「Free 每月 3 视频」；需确定额度语义与执行位置。
**Options**: A) 按月租借（当月可看 3 个，次月失效）；B) 解锁制（每月 3 次解锁机会，解锁后永久可看）
**Decision**: B
**Reason**: 解锁制给用户积累感（永久资产），额度模型简单（`user_video_unlocks` 表 + 当月计数）；浏览/元数据不设限，只闸字幕与媒体流。
**Trade-offs**: 已解锁视频永久可看意味着长期内容成本上升，但种子期量小可接受；额度 3 是配置项（`free_monthly_unlock_quota`）可调。Pro 期间观看记录不写解锁表，降级后需重新解锁（已知体验代价，换取模型简单）。示范视频以 `videos.is_demo` 列标记，不消耗额度。
配套决策：① 注册即发 3 天试用（`plan_source='trial'`，到期由既有 `downgrade-expired-pro` beat 降级）；② 登录墙用 Next.js middleware，token 仍存 localStorage，登录/刷新时镜像写 `seeword_token` cookie 供 middleware 读取（不在 middleware 查 DB，会员/额度校验在后端 API）；③ 不做 streak 保护卡（断签归零，真实反馈）。

---

## 2026-08-28 — D0b 产品瘦身：下线 AI 助手 / 评论 / UGC / 学习计划（f855613）

**Problem**: 功能面过宽——AI 助手、评论、UGC 提交/fork/propose-back、AI 学习计划、每日学习计划与核心闭环（看→点词→复习→练习）无关，带来维护成本、GPU/LLM 成本风险与版权负担。
**Options**: A) 保留继续迭代；B) D0b 清理：全部下线，收敛为「运营精选内容 + 预生成词注释 + 学习档案」
**Decision**: B（提交 f855613，2026-08-28；完整清单见 `.agent/handover-d0b.md`）
**Reason**: 产品收敛后运行时 AI 调用只剩视频处理管线（翻译 + 词注释预热），成本可控且单一；内容由 admin seed + catalog promote 提供（与 ADR-0012 砍 UGC 的方向一致，进一步收口）。
**Trade-offs**:
- 删除 17 个后端文件 + 8 个前端文件 + 5400 行（含测试）；`learning_plan.py` 5 个端点返回 410（保留 profile/milestones/mastery-trend）；模型表（learning_plans/items、Video UGC 列）保留 dormant 未删
- **词卡实时 AI 释义下线**：gloss 端点只读预生成 `word_ai_notes`（管线预热 + `scripts/precompute_global_word_notes.py`），cache miss 返回空字段——点词零 LLM 成本，代价是冷门词可能无 AI 注释
- 前端 plan 组件（DailyProgressCard/PlanItemCard 等）删除，planStore 精简为仅 profile
- `ai_service.py` 残留 5 个死方法 + `GET /vocabulary/{id}/enrich` 无前端入口（dormant，可后续清理）
**Status**: 完成；后端 579 passed / 6 skipped，ruff 干净；**注意：本次提交后 `.agent` 文档长期未同步，2026-09-18 已全量对齐（context/system-map/state）**。

---

## 2026-08-29 — D6 提醒调度：单条每小时扫描 + 用户本地时间匹配（Phase 2）

**Problem**: 词汇提醒需按用户设定的提醒点（默认 20:00）触发，断签警告固定 21:00；用户 `reminder_timezone` 各不相同，Celery beat 不支持按用户动态调度。
**Options**: A) 固定 UTC 时间每日一次；B) 单条每小时 :00 扫描，逐用户按本地时区匹配小时数；C) 每用户动态注册定时任务
**Decision**: B（`reminder_tasks.send_hourly_reminders`）
**Reason**: C 在 beat 中不可行；A 对非北京时区用户提醒点漂移。B 用一条调度覆盖所有时区，实现与既有整点扫描任务同构。
**Trade-offs**: 每小时全表扫用户×偏好（种子期量小可接受，量大后可改为按提醒小时分桶索引）。去重不变量：Redis `SET NX EX 86400` 每日一键，**故障时 fail-open 照发**，靠 `create_notification` 的 (user, type, related_url) 未读去重兜底——宁可偶尔更新旧通知，不因 Redis 故障丢提醒或死锁不发。

---

## 2026-08-29 — D9 周报：不可变快照 + 周一 00:00 UTC beat（Phase 2）

**Problem**: 周报需要稳定的周聚合数据供分享卡片使用；生成时机与幂等性需定义。
**Options**: A) 请求时实时聚合；B) 周一生成不可变快照行（`weekly_reports`）
**Decision**: B（`generate_weekly_reports`，crontab 周一 00:00 UTC = 北京 08:00）
**Reason**: 分享卡片数据必须稳定（环比/亮点不能随后续活动变动）；UNIQUE(user_id, week_start) 使重跑幂等；口径复用 `stats_weekly`（LearningRecord 时长 + LearningEvent 计数）保证两处数据一致。
**Trade-offs**: `streak_at_week_end` 用当前 profile 值近似（不重建历史快照，换取实现简单）；环比首周为 `None`（UI 隐藏箭头而非显示 0%/∞）；无活动用户不生成行，前端以 404 → 「学习满一周后生成」空状态承接。
配套：分享卡片用 Canvas 手绘 + `qrcode` 包（新增前端依赖，`--legacy-peer-deps` 安装），固定品牌色不随暗色主题；热门搜索（D7）同样采用 Redis fail-open 不变量（ZSET 计数 best-effort，故障退回后端静态列表，绝不让计数拖垮搜索主流程）。

## 2026-08-30 — D10 跟读体验增强：逐句模式 + 波形对比 + 时间线（Phase 3）

**Problem**: 跟读需从"单句手动录"升级为更顺滑的逐句循环 + 视觉反馈 + 时间线回顾；不可引入 AI 评分（ADR-0002 红线）。
**Options**: A) 只做 UI 提示，不接系统状态机；B) 完整状态机 + 波形 + 时间线
**Decision**: B（详见 ADR-0015）
**Reason**: 单点改造价值低（用户仍需手动点"下一句"），完整闭环符合 D10 工作量（L=3-4 天）。
**Trade-offs**：
- 状态机用 ref 自稳避免 hook 依赖环，复杂度集中于 `useSentenceShadowing` 钩子；调用方集成成本小（1 状态 + 4 回调）。
- 波形对比是尽力而为（解码失败降级为只显示录音），YouTube 源无法解码就降级——不破坏 UX 而非阻塞。
- 进度条绿点 markers 复用现有 VideoControls 组件（`markers` prop），未引入新组件。
- `LearningEvent` 累计时长 + 后端 `include_subtitle_time` 查询参数是 D10 的数据支撑。
- 顺手修：MIME 参数解析（`audio/webm;codecs=opus` 之前返 415），`useSpeakingRecorder` 加 timer 选项。

**ADR**: [0015](docs/adr/0015-d10-sentence-shadowing-waveform.md)

---

## 2026-09-08 — 翻译引擎统一为火山引擎 ARK (ark-code-latest)

**Problem**: 翻译引擎 registry 中 `agnes`(走 deepseek)/`qwen`/`hy_mt2`/`glm` 的 API key 多数已删（2026-08-05 expired），只剩 agnes 实际可用但质量参差；火山引擎 ARK Coding 端点 `https://ark.cn-beijing.volces.com/api/coding/v3` 上线 ark-code-latest 声称 OpenAI 协议兼容（chat.completions + Responses API）。
**Options**: A) 新建 `BUILTIN_ENGINES['ark']` 条目 + `_resolve_engine` 分支 + Settings + 测试；B) 复用现有 `custom` 引擎条目只改 `.env`（`TRANSLATION_CUSTOM_*` 三个 env 已有），`ai_service._get_engine_client(name)` 复用 translation client，prewarm 同步切只需改 `PREWARM_ENGINES=custom`
**Decision**: B（详见 [ADR-0018](docs/adr/0018-ark-cody-translation-engine.md)）：`.env` 末尾追加 7 行（TRANSLATION_ENGINE=custom + TRANSLATION_FALLBACK_ENGINE= 空 + TRANSLATION_CUSTOM_BASE_URL/MODEL/API_KEY + PREWARM_ENGINES=custom + TRANSLATION_BATCH_SIZE=5）。代码零改动。
**Reason**: 零代码改动即接入，未来切换供应商也只需改 env 三行；端到端本地验证完整 pipeline 跑通：catalog promote → WhisperX 转录 35 段 → ark 翻译 35/35 → ark prewarm 词注释 → YouTube 下载 24.7MB → ffmpeg 720p 转码 → ready/published，整段 finalize 117s
**Trade-offs**:
- `TRANSLATION_FALLBACK_ENGINE` settings 默认 'hy_mt2'（无 key 会启动失败），**必须显式置空**
- API key 字段暂填 ARK endpoint ID（值见密码库，勿写入仓库；按用户指示），生产前做一次 promo 冒烟观察 5-10 分钟
- ark-code-latest 是 coding 命名（可能原意是代码模型），翻译/prewarm 是非典型场景；本地质量好，生产头两周需持续观察
- batch_size 5 偏保守（ark 单次响应 20-30s/批），后续可 benchmark 调高
- 旧 `TRANSLATION_ENGINE=agnes` 行（`.env:33`）已注释（dotenv 按文件顺序读，否则会覆盖新设置）
- celery 5.4.0 + Windows + `--loglevel=info` 有 bug（`tasks, accept, hostname = _loc` 报 "not enough values to unpack"，`_localized=[]`），**生产 Linux 不会遇到**，本地用 `--pool=solo` 绕开
---

## 2026-09-09 — YouTube anti-bot：POT provider + 代理中继（48 条批量上线）

**Problem**: catalog 批量 promote 全线失败。两个叠加症状：(1) metadata extract 报 `Sign in to confirm you're not a bot`；(2) cookies 换新后 extract 通了，但音频下载 34 次全部 600s 超时、一个字节都没下来。
**Options**: A) 频繁手工换 cookies（治标，YouTube 几分钟就轮换）；B) 部署 bgutil POT provider 提供 proof-of-origin token；C) 放弃自托管改 embed 播放（ADR-0017 已记的版权路线，但产品形态要改）
**Decision**: B。docker 起 `bgutil-ytdlp-pot-provider` + 一个 socat `proxy-relay` 容器；`extractor_args` 三项固定为 `player_client=web,android` + `youtubepot-bgutilhttp:base_url`；新增 `scripts/setup_pot_proxy.ps1` 自动发现宿主 LAN IP 并双侧验证。
**Reason**: 下载从 600s 超时变成 12MB/1-3 秒。一夜 48 条上线，3 条失败全是源视频真失效（private/deleted），零管线故障。

**Trade-offs / 非直觉约束（都是实测踩出来的）**:
- **代理地址不能用 `127.0.0.1`**。插件源码 `'proxy': request.request_proxy` 会把 yt-dlp 的 `--proxy` 值原样转发进容器请求体，容器里 `127.0.0.1` 指向自己 → `ECONNREFUSED` → 无 POT → YouTube 强制 SABR → 格式全跳过 → 下载空转。必须用宿主/容器同解的地址（socat relay 发布在全网卡）。
- **容器启动时那次 POT 会成功**（用自己 env），之后每次请求都失败。**只验一次会得到假阳性** —— 我第一轮就是这么误判的。必须两侧都测。
- `base_url` 必须显式传，否则插件访问自己默认的 `127.0.0.1:4416` 也走 proxy，每次 20s 读超时。
- `tv` player_client 对多数视频返回 `UNPLAYABLE`；带 cookies 时 `android` 会被跳过（不支持 cookies），实际只剩 `web`，而 web 强依赖 POT。
- `--net=host` 在 Windows Docker Desktop 不通；宿主 hosts 里的 `host.docker.internal` 可能是陈旧地址（本机指向已失联的 192.168.1.2）。
- 地址是 DHCP LAN IP，**不能写死**在 `.env`（该文件被 gitignore，换网络后静默失效）。由脚本重建。
- **PowerShell 改 `.env` 必须显式 UTF-8**：`Set-Content` 默认写 ANSI(GBK)，把 28 处中文注释的三字节 UTF-8 第三字节打成 `?`，python-dotenv 直接 `UnicodeDecodeError`，两个 worker 全起不来。脚本已改 `WriteAllText` + `UTF8Encoding($false)` 并在写后强制校验。
- **cookies 双向写回**：yt-dlp 的 `cookiefile` 是读写的（官方文档"read from and dump to"），anti-bot 响应带清 auth 的 `Set-Cookie`，会把 `LOGIN_INFO` 洗掉（实测 739KB → 377KB）。用 `disposable_cookiefile()` 传副本规避。
- **cookies 必须无痕窗口导出**：普通窗口导出的会被服务端几分钟内轮换；无痕导出后关窗口可用 3-5 天。有效性判据是 `LOGIN_INFO` 是否存在。

---

## 2026-09-09 — 批量驱动与 worker 必须服务化托管（NSSM）

**Problem**: celery worker 反复"消失"，任务卡在 `processing`。`nohup` 和 `Start-Process` 起的进程都在 bash 工具调用结束时被回收。
**Options**: A) 每次手工在前台窗口起（无法无人值守）；B) NSSM 服务托管（GPU worker 已用这套且能活）
**Decision**: B。新增 `scripts/run_celery_worker.ps1` 和 `run_batch_driver.ps1`，套用 `run_gpu_worker.ps1` 的 wrapper 模式。
**Reason**: 服务化后同一 PID 跨调用存活，6 小时无人值守跑完 48 条。

**Trade-offs**:
- **服务以 SYSTEM 运行，PATH 里没有 per-user 的 Python 和 console scripts**。这暴露了一个既有 bug：`_get_ytdlp_path()` 只探 `sys.executable` 同级目录，但 Windows 上 console script 在 `Scripts\` 下一层 → `[WinError 2]`。之前从交互式 shell 启动才没显形。已补 `Scripts`/`bin` 探测。
- 批量驱动是一次性的（队列空就退出），NSSM 需配 `AppExit Default Exit` 否则会被无限重启。
- 服务的 TEMP 不是 Administrator 的，token 路径不能用 `ADMINI~1` 短名，改绝对路径 `C:/tmp/`。

---

## 2026-09-09 — 上线验证判据：feed 排名不算、mp4 404 才算

**Problem**: 批量 4 条 error 里 **3 条是校验误报**，视频线上完全健康。逐条核实后才发现判据本身有问题。
**Decision**: 通过条件 = 详情端点 `is_published` + 封面 HTTP 200 + mp4 **非 404**；feed 位置只记录不判罚；媒体上传加 3 次重试。
**Reason**: 三种误判各有根因：
- **feed top20**：排名是排序结果不是发布事实，上线量一多新视频必被挤出，会随规模持续误杀。
- **wait timeout 900s**：1009s 的视频光 ASR+对齐+分批翻译就要 15 分钟。两条 539s/1009s 视频本地已出 115/229 条字幕却被判失败。改 2400s。
- **push 超时**：SQL 进了、媒体没进 → 站上可见但没封面播不了。**比单纯失败更糟，因为它能通过原校验**。mp4 有解锁门所以 **403 = 健康，404 = 文件没落地**，这是唯一能识别半推送的硬信号。

**Trade-offs**:
- 媒体文件名不能按 id 拼：低于 720p 的源跳过转码（`video_url_720p` 指向 `<id>.mp4`），封面新 `.webp` 旧 `.jpg`，磁盘上可能只有 `<id>_raw.mp4`。必须从 DB 读 + `_raw` 回退。
- SQL 导入必须 `cat ... | docker exec -i psql`。`docker cp` + `psql -f` 报 `INSERT has more expressions than target columns`，即使列数确认一致、同语句 `psql -c` 正常。原因未查明，疑似 `docker cp` 对 UTF-8 内容的处理差异。**RUNBOOK §6.7 3b 原先的 sed 删列指令已作废**（生产 schema 已有 `is_demo`/`is_auto`，照做反而出错）。

---

## 2026-08-30 — D12 可访问性：浅层落地（Lighthouse 96/100，超 90 达标线）

**Problem**: §4-D12 5 项（快捷键/形状区分/aria-label/focus ring/Lighthouse ≥ 90）。
**Options**: A) 引 axe-core + jest-axe 全量自动化；B) 手工浅层修复
**Decision**: B（详见 ADR-0016）
**Reason**: 工作量 M=2 天，全量 axe 集成超 1 周；当前全局 a11y 基础好（82 个 lucide 文件仅 1 处缺漏），手工足够到 96/100。
**Trade-offs**：
- 7 个 `WORD_COLOR_CLASSES` 加 `decoration-{color}-400 decoration-dotted`（色盲友好），不依赖颜色。
- 全局 `*:focus-visible` 已在 globals.css:320 覆盖大多数按钮，无须每按钮写。
- 唯一修：admin 后台 placeholder 铃铛（1 处 aria-label）。
- Lighthouse 3 页 96/100，**唯一未修**：brand-500/muted-soft 小字号对比度（牵全局设计，超 D12 范围）。
- **未引入新依赖**（无 axe-core/jest-axe）——CI 自动化 a11y 留给后续 Phase。

**ADR**: [0016](docs/adr/0016-d12-accessibility.md)

---

## 2026-08-30 — §10 待拍板 4 项（用户拍板）

**Problem**: 产品设计规划-2026-08 §10 列 4 项需用户拍板，影响 Phase 0/1/2/3 落地完整性。
**Decision**:

1. **#4 示范视频**：暂不弄（`videos.is_demo=true` 不指任何视频；D2 新手引导语需相应去掉"看示范视频"措辞，或后续再补）
2. **#5 周报分享卡片 slogan + 品牌色**：A. 沿用规划默认值（"用真实视频学英语" + coral #FF6B4A + 暖白 #FDF8F3）——已是 D9 现状，无需改动
3. **#6 首页统计行**：不加（维持 streak + 词汇数 + 视频数 3 项）
4. **#7 已解锁视频入口**：**重定义为首页「已解锁优先」开关**（不在 /history 加 Tab）

**#7 实施**（commit 8609847）：
- `useBoostUnlocked` hook：localStorage 持久化，per-device UI 偏好（不污染后端 UserPreferences）
- 首页筛选栏右侧（sm: 以上）加 peer 模式开关，Pro 用户（`unlockedInfo=null`）隐藏
- 排序逻辑：`useMemo` 把 videos 拆 unlocked + rest 拼接，**保持各自内部相对顺序**（不打乱后端推荐/分类/难度）
- a11y：aria-label + focus-visible ring（走全局 brand 描边）
- mobile 393px 下隐藏（节省空间）

**Trade-offs**：
- localStorage 而非 backend：开关是 UI 偏好非学习偏好；如未来需跨设备同步，再迁 `UserPreferences`。
- 移动端不显示：避免 393px 筛选栏拥挤；如用户反馈需要，再加 mobile popover 入口。

---

## 2026-08-30 - 频道升级为全量作者页 Auto-Channel（ADR-0014 修订）

**Problem**: ADR-0014 频道为策展制--只有管理员建档的作者才有主页；用户期望主流流媒体式的「每个作者都有主页，点作者名看本站该作者全部视频」。
**Decision**: 全量作者页（详见 [ADR-0014 修订](docs/adr/0014-video-channels.md)）：

1. ingest 自动建档：`ensure_channel_for`（find-or-create），按抓取 `channel_id` 未注册则建 `is_auto=True` 频道；策展频道优先不重复建
2. `channels.is_auto` 列 + `upstream_channel_id` 唯一索引（迁移 `e0f1g2h3i4j5`，先合并存量重复）
3. slug 规则：slugify(名) -> `upstream_id` 小写（中文名回退）-> hash 后缀兜底
4. 封面动态兜底：`cover_url` 空时用频道最新公开视频缩略图（yt-dlp 拿不到频道头像，不建 avatar 字段）
5. `GET /channels` 分页化：策展在前（sort_order）、自动在后（视频数 desc）；空频道隐藏；ChannelStrip 取前 12
6. 作者名入口：序列化补 `channel_slug`（browse/home/favorites/detail，browse 顺手补 `channel_name` 修卡片恒显 SeeWord 旧 bug）；VideoCard 频道名可点（span + router.push 避免嵌套 `<a>`）；watch 页 meta 行作者名替换写死 "SeeWord"
7. 回填脚本 `scripts/backfill_auto_channels.py`（--dry-run 支持）

**Trade-offs**:
- 频道数 = 作者数（可能数百）：靠排序 + 分页消化；自动频道观感依赖封面兜底，运营可在 admin 逐步装修
- 并发建档竞态交给唯一索引 + Celery 重试，不额外加锁
- 订阅/关注、频道内搜索、频道级统计维持一期不做

---

## 2026-09-08 — 视频候选池 Catalog（抓取发现与逐条策展解耦）

**Problem**: 官方视频只有硬编码 seed 脚本 + 单条 URL seed 两路，缺「批量发现候选 → 人工逐条筛选上线」中间层；竞品 Language Reactor 公开目录 API（`api-cdn.dioco.io/base_media_getMediaDocs_5`，无需鉴权）可批量拉元数据，但默认「全英语·按时间」池 ~80% 新闻/体育，不符合选材标准。
**Options**: A) 直接灌进 `videos` 表；B) 独立候选池表 + 复用现有 `seed_video` 管线逐条提升；C) 只做外部脚本不改后端
**Decision**: B（详见 [ADR-0017](docs/adr/0017-catalog-candidate-pool.md)）：新增 `catalog_items`（与 videos 解耦，`(source,upstream_id)` 唯一幂等，`promoted_video_id` FK→videos SET NULL）+ `catalog_service`（fit_score 数值筛 / 幂等导入 / 列表 join Video 派生 effective_status 免 beat / promote 复用 seed_video / mark）+ `/api/v1/admin/catalog*`（list/summary/get/promote/mark）+ `scripts/import_catalog.py`（--dry-run）。内容侧改按 LR 频道级 API `sortBy=views` 重抓 56 个英语教学/教育/谈话频道 672 条，import 按 category 加权（+18/+12/+8）使学习内容 fit 领先。
**Reason**: 解耦「发现」与「处理」不污染 videos 语义；复用久经测试的 seed 管线不重造轮子；候选池让管理员按 fit 排序 + 频道筛选逐条策展。
**Trade-offs**:
- promote 走完整管线=下载自托管，依赖服务器 YouTube cookies（失效 423 需重登）；embed 轻量模式暂未接入（现有轻量路径仅在 seed 脚本、未抽 service）
- **版权风险**：下载自托管第三方 YouTube 内容（含新闻媒体）= 侵权 + 违反 ToS；上线前对敏感内容应改 embed 或选可授权/CC 素材（已知会产品负责人决策）
- fit_score 是数值筛非主题判断；主题策展靠人工 promote + category 加权
- 未做：admin 前端页（Phase 2）、生产部署（Phase 3）、重抓脚本收进 backend/scripts

---

## 2026-09-19 — 内测上线四件套（排行 / 学习闭环 / 免费开放 / 存储三态）

**Problem**: 内测上线需要四块新能力，且彼此耦合：① 首页排行（最新/本周热播/本周收藏）② 词汇学习闭环（收词 → 集合 → 过筛 → 闭环）③ 内测期免费开放全功能、不引入 Pro 概念 ④ 内容存储三态与下线释放空间。需求见 `docs/requirements/REQUIREMENTS-launch-internal-test.md`（产品方逐项确认，为最高优先级输入）。

**Options**: 学习闭环状态机 A) 沿用 SM-2 四态 B) 新建独立三态体系 C) 三态对外 + SM-2 对内；收词数据 A) 复用 `Vocabulary` 平铺 + 按 `video_id` 聚合 B) 新建 `vocab_sets` 双表；下线 A) 物理删除 video 行 B) 行保留 dormant + 状态翻转。

**Decision**:
1. **排行**（[ADR-0018](docs/adr/) 无，实现见 commit d86fa2d）：新增 `videos.published_at`（回填 `COALESCE(reviewed_at, created_at)`，`_publish_video` 幂等写入）；`GET /videos/rankings?scope=latest|weekly_views|weekly_favorites`（各前 20）。热播 = `behavior_events` 的 play/complete 近 7 天按 `session_id` 去重计数；收藏 = `user_favorites.created_at` 近 7 天计数（需求 §3.1 指定，**无新埋点**）。Redis 快照读穿 + `snapshot-rankings` 每日 beat 刷新。
2. **学习闭环**（[ADR-0019](docs/adr/0019-vocab-set-quick-sieve-loop.md)）：`vocab_sets`（user×video×exam_level 唯一）+ `vocab_set_words`（引用 Vocabulary + position + 流程状态 pending/known/unknown/learned）。**掌握态仍归 Vocabulary**，集合只存引用与集合内进度；对外三态（reviewing 并入学习中展示，后端不迁数据）。收词只读 ECDICT（**禁用 `enrich_word`，那是 AI 路径**）。闭环需 `POST .../learned` 显式标记待学清单，`completed` = 无 pending 且无 unknown。配套行为变更：**mastered 退出复习队列**（due 过滤 4 处）。
3. **内测免费开放**（实施按 `docs/progress/FREE-TIER-ASSESSMENT-2026-09.md`）：媒体门对所有登录用户放行（匿名仅 `is_demo`）；详情不再遮蔽字幕/URL；`/unlock`、`/unlocked`、`/unlocked-ids` 退役为放行/空载荷（不写 `user_video_unlocks`）；停用 3 个 Pro beat；前端删 paywall 组件与 4 个 Pro 页（`/upgrade` `/pricing` `/redeem` `/checkout` → redirect）。**保留**登录墙、shadowing owner-only、`plan`/`RedeemCode` 表 dormant。
4. **存储三态**（[ADR-0020](docs/adr/0020-storage-modes-and-takedown.md)）：`videos.storage_mode`（local/proxy/offline，proxy 仅留值不实现 —— §5.4 优先级 3）。下线 = `is_published=False` + `storage_mode='offline'` + 清 URL + 删媒体（**缩略图保留**），**行保留 dormant** 以避开 `vocabulary`/`UserFavorite` 的 CASCADE；隐藏复用既有 `is_published` 过滤，仅媒体门/收藏夹/详情三处显式处理。

**Reason**: 排行复用既有字段与 BehaviorEvent，零新埋点即可上（但「最新」需补 `published_at`，因 Video 原本没有该列）。集合表只存引用让「集合 = 按视频聚合的视图」成立且可重建，掌握态单一事实来源不被污染。三态对外 + SM-2 对内让「闭环终点可定义」与「现有复习引擎不拆」同时成立。行保留式下线是唯一能同时满足「释放空间」与「学习记录不断链」的方案。

**Trade-offs**:
- **mastered 退出复习队列是行为变更**：存量已 mastered 的词不再日常复现。语义更诚实（已掌握 = 终点），但削弱长期间隔复现；Pro 二期高级复习算法需显式定义 mastered 的复现策略。
- 集合进度无冗余计数列，靠聚合查询（量级小，可接受）；换得集合可任意重建。
- 内测期免费 = 收入为零，唯一随用户量增长的成本是媒体带宽/存储（见 FREE-TIER-ASSESSMENT §五）。
- proxy 模式仅占位，未解决「不下载」的版权路径；ADR-0017 的版权风险不变。
- `_FakeRedis` 补 `scan_iter` 后才暴露/覆盖「缓存失效」路径；此前 fail-open 会静默吞掉 AttributeError。
- 验证：后端 735 passed（含 +15 排行 / +24 集合闭环 / +13 下线）；三支端到端冒烟 31+18+24 全通过；前端 tsc/eslint/vitest/build 全绿；mypy 77 基线。
- 未做：proxy 实现、公开落地页、海报视觉稿（运营物料）、Proxy 二期的 Pro 差异项。
