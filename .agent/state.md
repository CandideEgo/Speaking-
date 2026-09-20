# Project State

> Forward-looking only: what is in flight, what is next, what is broken. Completed work belongs in
> `decisions-index.md`, `CHANGELOG.md` or `archive/`. Keep this file small — it is read every
> session, and `knowledge-budget.json` caps it.

## Last Updated

Date: 2026-09-20

- **多 Agent 协作协议落地**（`owners.md` + `handoffs/`，2026-09-20 基线）；原"未提交改动"已提交，脱敏结论见 Known Issues
- **内测上线四件套全部落地**（DEC-037）：主页排行 / 词汇学习闭环 / 内测免费开放 / 内容存储三态。验证：735 passed、冒烟 31+18+24 全过、前端全绿（tsc/eslint/vitest/build）。三处行为变更：① `mastered` 退出复习队列（三态语义）② 匿名拒访问非 `is_demo` 视频的媒体/详情/跟读 ③ Pro 与解锁额度 UI 全移除
- **知识层重构启动**：上下文层按易变性分层 + 新增可执行检查层（`scripts/check-knowledge/`），Phase 0/1 完成、Phase 2 进行中

## Recently Completed

Newest first, one line each. Prune the tail into `CHANGELOG.md` when this list gets long — the
authoritative reasoning for each is the cited decision entry.

- 内测上线四件套：排行 / 词汇学习闭环 / 免费开放 / 存储三态（DEC-037，2026-09-19）
- 知识层重构 Phase 0/1：GitNexus 索引重建、四项可执行检查、冻结文档归档（2026-09-19）
- 免费化影响评估报告（`docs/progress/FREE-TIER-ASSESSMENT-2026-09.md`，2026-09-18）
- YouTube anti-bot：POT provider + 代理中继（DEC-030，2026-09-09）
- 批量驱动与 worker 必须服务化托管（NSSM）（DEC-031，2026-09-09）
- 上线验证判据确立：feed 排名不算、mp4 404 才算（DEC-032，2026-09-09）
- 视频候选池 Catalog 后端 MVP（DEC-036，2026-09-08）
- 翻译引擎统一为火山引擎 ARK（DEC-029，2026-09-08）
- 频道升级为全量作者页 Auto-Channel（DEC-035，2026-08-30）
- 产品设计规划-2026-08 Phase 0-3 完成 + §10 四项拍板（DEC-034，2026-08-30）
- D12 可访问性浅层落地（DEC-033，2026-08-30）
- 两天 26 提交深度审查 + 5 项修复（DEC-021，2026-08-30）
- D10 跟读体验增强（DEC-028，2026-08-30）
- D9 周报：不可变快照（DEC-027，2026-08-29）
- D6 提醒调度（DEC-026，2026-08-29）
- D0b 产品瘦身：下线 AI 助手 / 评论 / UGC / 学习计划（DEC-025，2026-08-28）
- D0 会员模型：登录墙 + Free 解锁制（DEC-024，2026-08-28）
- 全站功能与设计审查补齐（2026-08-13）／真题考试体系重建（2026-08-08）／原型驱动全栈重构（2026-08-04）
- UX 设计方向落地（Apple HIG + Material + Linear）
- 内测前加固 Phase 0-3：GPU 凭据隔离、发布双路径统一、转写/翻译质量安全网（DEC-011/012）

## Current Focus

- **知识层重构**（2026-09-19 起，进行中）：Phase 2 按易变性切分上下文层；随后 Phase 3 把可机械化的不变量变成检查，Phase 4 让治理可移植
- **多 Agent 协议已落地**（`owners.md` + `handoffs/`）；部署密钥均为 env / `.env` 引用，未见硬编码
- **内测上线收尾**：proxy 代理播放实现（需求 §5.4 优先级 3）、海报视觉稿（运营物料）、内测反馈收集渠道

## Next Steps

1. 知识层重构 Phase 3/4：不变量机械检查（ruff banned-api + 架构测试）、skill 收进仓库
2. 生产部署：按序跑三个迁移（`published_at` → `vocab_sets` → `storage_mode`），跑完再验证三支冒烟
3. **Catalog Phase 2/3（DEC-036 / ADR-0017）**：admin「内容目录」前端页（浏览/筛选/一键处理上线）；部署 seeword.top（迁移 + 导入 772 条 + 端到端验证一条 promote）；重抓脚本从 `.lr-scrape/` 收进 `backend/scripts/`；promote 前评估 embed vs download 的版权路径
4. 视频存储收尾：确认稳定后删源站文件 + Docker cache prune（释放 ~17.5GB）
5. 集成测试 / Playwright e2e 覆盖新页面（/weekly-report、收藏、CoachMark、ShareCard）
6. Recommendation 深度个性化 P2（ADR-0011）
7. ICP 解封后项：payment、前端单测、e2e 覆盖

## Known Issues

- **本地 dev SMS 发送 502**：`requirements.txt` 已补 Dypnsapi SDK，待 `.venv` / 云端镜像重装后复测；CI / 无凭据环境回退 dev-fake 码 `1234`，E2E 依赖此路径
- **E2E coverage 不完整**：CI e2e 已 seed 核心旅程（不再整体跳过），但播放 / 词汇复习 / 考试等关键流程仍缺 e2e
- **ICP compliance**：等个体营业执照才能全量部署（payment 因此保持禁用）
- 遗留 2 个 Low（已评估可接受）：token 镜像 cookie 缺 `Secure`（生产 HTTPS 补）、`stats_heatmap` 用服务器本地日期
- 部署文件脱敏已抽查（2026-09-20）：compose / deploy 脚本中的密钥均为环境变量或 `.env` 引用，未见硬编码，关闭
- **本地 master 领先 origin 47 个提交，从未经过 CI**。上次真实运行（2026-08-27）三个 job 全挂，三处已本地修复（ruff format / alembic `prepend_sys_path` / next→16.3.5 消 audit），**均待 CI 验证**。流程与已知坑见 `wiki/guides/release-checklist.md`
