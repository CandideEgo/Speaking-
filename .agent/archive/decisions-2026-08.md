# Decisions Archive — 2026-08

> **Frozen snapshot — archived 2026-09-21.** DEC-021 … DEC-028, moved verbatim out of
> `.agent/decisions.md` when it reached its size ceiling. Nothing was edited, reordered or
> renumbered; `decisions-index.md` still lists all eight. Not maintained, not checked — and the
> markdown links below are written for their pre-move location in `.agent/`.

## 2026-08-14 — 全站审查修复：关键决策

**Problem**: 全站审查（docs/progress/REVIEW-2026-08-14.md，87 条发现）暴露 2 个可利用高危漏洞 + 系统性文档漂移。
**Options**: A) 只修高危；B) 按 P0/P1/P2 分批全量修复
**Decision**: B（12 批次当日完成，627 后端测试 + 前端 tsc/lint/vitest/build 全绿）
**Reason**: 安全漏洞（上传 XSS/SSRF）直接威胁账户与云凭证；文档漂移（Shadowing「复活」无记录）会误导后续 Agent。
**Trade-offs**: 限流在 Redis 故障时降级为 in-memory（限流弱化但不再 500，符合 fail-open 不变量）；媒体门控对草稿增加一次 DB 查询（60s TTL 缓存）。
**ADR**: [0013](../docs/adr/0013-shadowing-recording-persistence.md)

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
**ADR**: [0013](../docs/adr/0013-shadowing-recording-persistence.md)

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
**Decision**: B（提交 f855613，2026-08-28；完整清单见 `.agent/archive/handover-d0b.md`）
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

**ADR**: [0015](../docs/adr/0015-d10-sentence-shadowing-waveform.md)
