# 免费化影响评估 — 注册即用（砍 Pro 会员）

> 日期：2026-09-18
> 方向：用户拍板「不要 Pro 会员，用户注册就能用全部功能」
> 状态：**评估完成，待用户拍板后实施**（本报告不包含代码改动）
> 依据：代码核实（git f855613 + 当前工作区），文档见 `.agent/archive/handover-d0b.md`、`.agent/context.md`

---

## 一、背景与目标

产品当前为 **D0 解锁制会员模型**（Free 月 3 解锁额度 / Pro 兑换码 / 登录墙）。用户目标：**注册即用全部功能**，降低使用门槛、利于免费运营冷启动。

本报告回答三个问题：
1. 免费化的成本风险是什么（唯一需要控制的面）
2. 代码要动哪些地方（文件级清单）
3. 建议以什么顺序落地

---

## 二、现状盘点（已核实事实）

### 2.1 功能面（f855613 / D0b 清理后）

| 面 | 状态 |
|----|------|
| 双语字幕 + 点词 gloss | 活跃：ECDICT 本地词库 + 真题例句 + **预生成** AI 词注释，**无实时 LLM** |
| 考试词标注（CET/gaokao） | 活跃，本地 ECDICT |
| SM-2 词汇复习 / 词汇书 | 活跃 |
| 真题练习 / 错题本 | 活跃 |
| 跟读 Shadowing（录音持久化） | 活跃，owner-only JWT 回放 |
| 学习档案（streak/里程碑/掌握度） | 活跃（`/plan/profile|milestones|mastery-trend`） |
| 推荐系统 / 频道 / catalog 候选池 | 活跃（catalog admin 前端页未做，Phase 2） |
| 每日学习计划 / AI 学习计划 | **已下线**（端点 410） |
| 用户提交 URL / UGC / 评论 / AI 助手 | **已删除**（f855613） |
| 会员体系（解锁/Pro/兑换码） | **仍在**（D0 解锁制） |

### 2.2 AI 成本面（免费化的关键）

**运行时 AI 调用仅发生在视频处理管线**：
- 翻译（`tasks/video_processing.py::_translate_subtitles` → `services/translation/*`）
- 词注释预热（`prewarm_video_notes` → `ai_service.generate_word_notes_bulk`）

**用户路径零 AI 成本**：点词（gloss 纯查库）、复习、练习、跟读、档案聚合均无实时 LLM。

**处理入口现状**：`POST /videos/seed`、`POST /videos/seed-full` 均为 **admin-only**（`get_admin_user`），另有 catalog promote（admin）。**用户面无任何触发处理的入口**。

→ **结论：免费化后 GPU/LLM 成本天然受控——只有运营能触发视频处理，成本 = 运营内容节奏，与用户量解耦。** 这是免费化可行性的第一基础。

### 2.3 会员/门控面（免费化要动的面）

**后端门控**：
- 媒体流：`api/v1/media.py` — `_video_media_allowed`（D0 membership gate：Pro 或解锁行；**仅正向缓存**）
- 字幕/详情：`api/v1/videos.py` — `GET /{video_id}`、字幕接口（43d69be 修复过 shadowing-sentences 门控）
- 解锁端点：`POST /videos/{id}/unlock`、`GET /videos/unlocked`、`GET /videos/unlocked-ids`
- 兑换码：`api/v1/redeem.py` — `/redeem-codes/redeem`（用户核销）+ admin 生成/列表/撤销
- Beat 任务：`downgrade-expired-pro`（每小时）、`expire-unused-redeem-codes`（每日）、`send-pro-expiring-reminders`（每日 01:00）
- 用户模型：`plan` / `plan_expires_at` / `plan_source`；`user_video_unlocks` 表

**前端 paywall 面**：
- 组件：`components/paywall/UnlockQuotaHint.tsx`、`components/paywall/UnlockPanel.tsx`
- Hooks：`hooks/useUnlockedIds.ts`、`hooks/useBoostUnlocked.ts`（首页「已解锁优先」开关）
- 页面：`app/upgrade/page.tsx`、`app/(main)/pricing/page.tsx`（→ redirect /upgrade）、`app/(main)/redeem/page.tsx`
- 入口：`components/layout/TopBar.tsx`（「Pro 会员」→ /upgrade）、`components/ui/VideoCard.tsx`（锁标三态角标）、`app/(main)/history/page.tsx`（已解锁 Tab）、`watch/[id]/page.tsx`（解锁交互）、`app/(main)/page.tsx`（额度提示/已解锁优先）
- 登录墙：`frontend/src/proxy.ts`（未登录 → /login；PUBLIC_PATHS 仅 login/register/terms/privacy/contact/forgot-password）

---

## 三、改动面清单（按优先级）

### A. 后端 — 解除门控（核心）

| # | 改动 | 文件 | 风险 |
|---|------|------|------|
| A1 | 媒体门控放行：所有已发布视频对登录用户开放；**保留草稿/未发布门控**（owner/admin）与 **shadowing 录音 owner-only 鉴权**（隐私，非付费） | `api/v1/media.py`（`_video_media_allowed`）、`services/video_access.py` | 中：涉及媒体路由，需回归门控测试 |
| A2 | 字幕/详情解锁检查放行 | `api/v1/videos.py`（`GET /{video_id}`、shadowing-sentences 等） | 中 |
| A3 | 解锁端点与额度逻辑停用（`/unlock`、`/unlocked`、`/unlocked-ids` 返回 200 空结果或下线） | `api/v1/videos.py`、`user_video_unlocks` 相关 service | 低 |
| A4 | beat 停用：`downgrade-expired-pro`、`expire-unused-redeem-codes`、`send-pro-expiring-reminders`（注释掉 schedule 即可，不删代码） | `tasks/celery_app.py` | 低 |
| A5 | 兑换码核销：保留 admin 生成/撤销（运营发福利码），用户端 `/redeem-codes/redeem` 保留（福利码仍可发 Pro 天数）或改为赠送解锁额度 | `api/v1/redeem.py`、`tasks/redeem_tasks.py` | 低 |
| A6 | 新注册用户 `plan` 直接置 `pro`（或忽略 plan 字段，门控放行后 plan 无实际作用） | auth 注册逻辑 | 低 |

### B. 前端 — paywall 清理

| # | 改动 | 文件 |
|---|------|------|
| B1 | 锁标/额度提示移除：VideoCard 三态角标、UnlockQuotaHint、首页额度提示、useUnlockedIds 引用 | `components/ui/VideoCard.tsx`、`components/paywall/UnlockQuotaHint.tsx`、`app/(main)/page.tsx`、`app/(main)/browse/page.tsx`、`app/(main)/channels/[slug]/page.tsx` |
| B2 | watch 页解锁面板移除（UnlockPanel、解锁 CTA、`useBoostUnlocked` 若保留则改为无意义开关） | `app/(main)/watch/[id]/page.tsx`、`components/paywall/UnlockPanel.tsx`、`hooks/useBoostUnlocked.ts`、`hooks/useUnlockedIds.ts` |
| B3 | TopBar「Pro 会员」入口移除（或改为「全部功能免费」标识） | `components/layout/TopBar.tsx` |
| B4 | `/upgrade`、`/pricing`、`/redeem` 下线（路由移除或重定向到首页）；`checkout` 页同步处理 | `app/upgrade/`、`app/(main)/pricing/`、`app/(main)/redeem/`、`app/(main)/checkout/` |
| B5 | history「已解锁 Tab」改全量列表（或移除 Tab） | `app/(main)/history/page.tsx` |
| B6 | 文案清理：types/planStore 中 plan 相关展示（planStore 保留 profile 不动） | 各处 |

### C. 成本护栏 — 现状已天然受控

- **用户面无提交入口**（已删），处理只由 admin seed / catalog promote 触发 → **无需新增配额机制**
- 若未来重新开放「提交 URL」给用户，才需要加每日配额（评估届时再做）；**当前免费化不需要配额**
- AI 词注释冷门词 cache miss 返回空 → 无成本，可接受
- 遗留 `GET /vocabulary/{id}/enrich`（无前端入口）建议删除或加 admin-only，防止未来被滥用产生实时 AI 成本

### D. 保留项（勿动）

| 项 | 原因 |
|----|------|
| shadowing 录音 owner-only 鉴权 | 隐私边界，非付费门控 |
| 草稿/未发布视频媒体门控 | 内容安全 |
| `RedeemCode` / `plan` / `user_video_unlocks` 表与字段 | dormant 保留，未来收费可复用；不删 |
| 登录墙（proxy.ts） | 仍要注册才可用（「注册即用」≠「免注册」） |
| `send-hourly-reminders`（词汇提醒） | 与 Pro 无关，保留 |

---

## 四、建议落地顺序

| 阶段 | 内容 | 预计工作量 |
|------|------|-----------|
| **P0（核心）** | A1–A3 + B1–B3：门控放行 + 前端 paywall 移除。用户感知「注册即用」 | 0.5–1 天 |
| **P1（清理）** | A4–A6 + B4–B6：beat 停用、页面下线、文案清理 | 0.5 天 |
| **P2（获客）** | 公开落地页 + 示范视频（`is_demo` 指向 1 个可授权视频）；把未登录 `/` 从登录墙改为落地页 | 1–2 天（另议） |
| **P3（运营）** | catalog admin 前端页（ADR-0017 Phase 2）+ 内容排期 | 1–2 天（另议） |

每阶段后跑：后端全量 pytest、前端 tsc/eslint、浏览器冒烟（首页/浏览/watch/词汇/练习全链路）。

---

## 五、风险与合规

1. **ICP 不变**：免费产品同样需要 ICP 备案 + 个体营业执照才能上线（流程免费，只是时间）
2. **版权**：catalog promote 下载自托管第三方内容，免费化不改变版权风险（ADR-0017）；运营上对敏感内容评估 embed vs download
3. **带宽/存储**：免费开放后观看量上升 → 视频媒体带宽与存储是**唯一随用户量增长的成本**（非 AI）。上线前确认服务器带宽与 media 卷容量，必要时走 OSS+CDN（有成本，现阶段可用流量观察后决定）
4. **跟读录音存储**：随用户量增长，`media/shadowing/` 需监控容量
5. **无收入**：免费化 = 收入为零，靠运营成本控制；若未来需要收入，dormant 的 Pro/兑换码体系可复用（决策需重新评估）

---

## 六、待拍板决策点

| # | 决策 | 选项 |
|---|------|------|
| 1 | 免费化的同时是否保留「注册墙」 | A) 保留注册墙（推荐：数据/档案需要账号） B) 匿名可看 |
| 2 | `/upgrade`、`/pricing`、`/redeem` 页面 | A) 直接下线 B) 改造成「全部免费」信息页 |
| 3 | `GET /vocabulary/{id}/enrich` 遗留实时 AI 端点 | A) 删除 B) 改 admin-only C) 保留 dormant |
| 4 | 兑换码 | A) 停用 B) 保留为运营福利码（推荐） |
| 5 | 是否同步做公开落地页（P2） | A) 一起做 B) 先只做免费化（P0/P1） |

---

## 七、参考

- `.agent/archive/handover-d0b.md` — D0b 清理完整清单（f855613）
- `.agent/decisions.md` — D0 会员模型（2026-08-28）/ D0b 瘦身（2026-08-28）
- `docs/adr/0007-redemption-code-lifecycle.md`、`docs/adr/0017-catalog-candidate-pool.md`
- `.agent/context.md` / `.agent/system-map.md` — 已同步的现状（2026-09-18）
