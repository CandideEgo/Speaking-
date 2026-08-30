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
