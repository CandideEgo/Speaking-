# Project State

> Forward-looking only: what is in flight, what is next, what is broken. Completed work belongs in
> `decisions-index.md`, `CHANGELOG.md` or `archive/`. Keep this file small — it is read every
> session, and `knowledge-budget.json` caps it.

## Last Updated

Date: 2026-09-22

- **已修待部署**（09-22，未提交）：头像上传 404（media 门控误伤子目录 uuid 文件名，已收敛为仅根目录 + 回归测试）+ 首次登录白屏（登录/注册页 authenticated 后 `return null` → `FullPageSpinner`，新增 `app/global-error.tsx`）
- **生产已更新**（09-21 19:42 镜像 `d2cc67d47073`/`cab8d974e4e1`：iOS playsinline + 分级颜色目标优先 + LLM 视频分类），部署源为未提交工作区；部署后必须 `nginx -s reload`（RUNBOOK §1.1 步骤 4.5）。存量 49 支视频 `topic_tags` 已回填（回填前备份 `/root/backups/videos_before_classify_20260921194521.sql.gz`）
- **DEC-043 难度校准待部署**：`difficulty_service` 改用「习得级别 + 超纲率」（原 max-order p75 使 49 支全为 C2）；部署后需 `backfill_difficulty.py --recompute`（先 `--dry-run`）把存量 C2 换成实算值

## Recently Completed

Newest first, one line each. Prune the tail into `CHANGELOG.md` when this list gets long — the
authoritative reasoning for each is the cited decision entry.

- 视频难度校准：习得级别 + 超纲率（DEC-043，2026-09-21，**待部署 + 待重算存量**）
- LLM 视频自动分类与分级 + 分级颜色目标优先 + iOS playsinline 修复（DEC-042，2026-09-21，**已部署 + 存量已回填**）
- 首页排行块并入筛选栏排序（DEC-041，2026-09-20）
- 知识层归档机制 + `stale` 提醒检查（DEC-040，2026-09-20）
- 内测上线四件套：排行 / 词汇学习闭环 / 免费开放 / 存储三态（DEC-037，2026-09-19）
- 生产部署链路加固（DEC-039，2026-09-20）
- 知识层重构 Phase 0/1（2026-09-19）
- 免费化影响评估报告（`docs/progress/FREE-TIER-ASSESSMENT-2026-09.md`，2026-09-18）
- YouTube anti-bot：POT provider + 代理中继（DEC-030，2026-09-09）
- 批量驱动与 worker 必须服务化托管（NSSM）（DEC-031，2026-09-09）
- 上线验证判据确立：feed 排名不算、mp4 404 才算（DEC-032，2026-09-09）
- 翻译引擎统一为火山引擎 ARK（DEC-029，2026-09-08）
- 频道升级为全量作者页 Auto-Channel（DEC-035，2026-08-30）
- 产品设计规划-2026-08 Phase 0-3 完成 + §10 四项拍板（DEC-034，2026-08-30）
- D0b 产品瘦身：下线 AI 助手 / 评论 / UGC / 学习计划（DEC-025，2026-08-28）
- D0 会员模型：登录墙 + Free 解锁制（DEC-024，2026-08-28）
- 内测前加固 Phase 0-3：GPU 凭据隔离、发布双路径统一、转写/翻译质量安全网（DEC-011/012）

## Current Focus

- **知识层**（2026-09-19 起）：Phase 0-3 主体已落地（易变性分层、六项检查 + `stale` 提醒、归档机制、skill 入库），余项见 Next Steps 1
- **多 Agent 协议已落地**（`owners.md` + `handoffs/`）；部署密钥均为 env / `.env` 引用，未见硬编码
- **内测上线收尾**：proxy 代理播放实现（需求 §5.4 优先级 3）、海报视觉稿（运营物料）、内测反馈收集渠道

## Next Steps

1. 知识层 Phase 3/4 剩余：把 `invariants.md` 里 10 条 review-only 与 1 处 known gap（INV-013）逐条变成机械检查（ruff banned-api / 架构测试 / skill 入库 / `stale` 提醒均已完成）
2. 下次部署补做端到端冒烟：09-20 切换后未复跑三支冒烟
3. **Catalog Phase 2/3（DEC-036 / ADR-0017）**：admin「内容目录」前端页（浏览/筛选/一键处理上线）；部署 seeword.top（迁移 + 导入 772 条 + 端到端验证一条 promote）；重抓脚本从 `.lr-scrape/` 收进 `backend/scripts/`；promote 前评估 embed vs download 的版权路径
4. 视频存储收尾：确认稳定后删源站文件 + Docker cache prune（释放 ~17.5GB）
5. 集成测试 / Playwright e2e 覆盖新页面（/weekly-report、收藏、CoachMark、ShareCard）
6. Recommendation 深度个性化 P2（ADR-0011）
7. ICP 解封后项：payment、前端单测、e2e 覆盖

## Known Issues

- **待部署**：09-22 两个用户反馈修复（头像 404 门控误伤 + 登录白屏 spinner/global-error）在工作区未提交，下次部署一并带上
- **DEC-042/043 待办**：iPhone 真机验证（内联播放 / 滚动 PiP / 字幕同步）
- **本地 dev SMS 发送 502**：`requirements.txt` 已补 Dypnsapi SDK，待 `.venv` / 云端镜像重装后复测；CI / 无凭据环境回退 dev-fake 码 `1234`，E2E 依赖此路径
- **E2E coverage 不完整**：CI e2e 已 seed 核心旅程（不再整体跳过），但播放 / 词汇复习 / 考试等关键流程仍缺 e2e
- **ICP compliance**：等个体营业执照才能全量部署（payment 因此保持禁用）
- 遗留 2 个 Low（已评估可接受）：token 镜像 cookie 缺 `Secure`（生产 HTTPS 补）、`stats_heatmap` 用服务器本地日期
- **"本地绿"不等于绿**：09-20 前积压的提交曾整批未过 CI（现已双绿）；提交前按 `wiki/guides/release-checklist.md` 过四道本地门
