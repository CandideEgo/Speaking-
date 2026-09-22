# Project State

> Forward-looking only: what is in flight, what is next, what is broken. Completed work belongs in
> `decisions-index.md`, `CHANGELOG.md` or `archive/`. Keep this file small — it is read every
> session, and `knowledge-budget.json` caps it.

## Last Updated

Date: 2026-09-22

- **已提交待部署**（09-22）：发现→频道 + 词汇本→单词训练改版（DEC-046：`daily-session` 端点、`/vocabulary` 今日/词库两段视图、drill 两段式百词斩流程、播放页 `ChannelEntry` 频道入口卡）；同日早些时候：iOS 播放态修复 + 点词分级渲染
- **已提交待部署**（09-22）：iOS Safari 播放态/字幕同步修复（`isPlaying` 单一事实源 + seek 健壮化）+ 点词分级渲染（`/gloss/static` + `/gloss/enrich`，旧 `/gloss` 转休眠）；含头像 404 门控与登录白屏修复；另含看门狗 `classifying` 超时、回填脚本单视频缓存失效、脏 difficulty 清洗范围三处修复
- **生产已更新**（09-21 19:42 镜像 `d2cc67d47073`/`cab8d974e4e1`：iOS playsinline + 分级颜色目标优先 + LLM 视频分类），部署源为未提交工作区；部署后必须 `nginx -s reload`（RUNBOOK §1.1 步骤 4.5）。存量 49 支视频 `topic_tags` 已回填（回填前备份 `/root/backups/videos_before_classify_20260921194521.sql.gz`）
- **DEC-043 难度校准待部署**：`difficulty_service` 改用「习得级别 + 超纲率」（原 max-order p75 使 49 支全为 C2）；部署后需 `backfill_difficulty.py --recompute`（先 `--dry-run`）把存量 C2 换成实算值

## Recently Completed

Newest first, one line each. Prune the tail into `CHANGELOG.md` when this list gets long — the
authoritative reasoning for each is the cited decision entry.

- 默认头像跟随用户性别 + `/users/me` 状态收敛为 `profileStore`（DEC-048，2026-09-22，**已提交待部署**）
- 发现→频道 + 词汇本→单词训练改版（DEC-046，2026-09-22，**已提交待部署**）
- 榜单页改版：TopPodium 领奖台 + RankingRow 重写（DEC-045，2026-09-21）
- iOS 播放态单一事实源 + 点词分级渲染（两级 gloss 端点）（DEC-044，2026-09-21，**已提交待部署**）
- 视频难度校准：习得级别 + 超纲率（DEC-043，2026-09-21，**待部署 + 待重算存量**）
- LLM 视频自动分类与分级 + 分级颜色目标优先 + iOS playsinline 修复（DEC-042，2026-09-21，**已部署 + 存量已回填**）
- 首页排行块并入筛选栏排序（DEC-041，2026-09-20）
- 知识层归档机制 + `stale` 提醒检查（DEC-040，2026-09-20；09-22 第二轮归档 DEC-029..036）
- 内测上线四件套：排行 / 词汇学习闭环 / 免费开放 / 存储三态（DEC-037，2026-09-19）
- 生产部署链路加固（DEC-039，2026-09-20）
- 知识层重构 Phase 0/1（2026-09-19）
- 免费化影响评估报告（`docs/progress/FREE-TIER-ASSESSMENT-2026-09.md`，2026-09-18）

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

- **iPhone 真机验证待办**：内联播放 / 滚动 PiP / 字幕同步（09-21 播放态轮询修复未在真机确认）
- **本地 dev SMS 发送 502**：`requirements.txt` 已补 Dypnsapi SDK，待 `.venv` / 云端镜像重装后复测；CI / 无凭据环境回退 dev-fake 码 `1234`，E2E 依赖此路径
- **E2E coverage 不完整**：CI e2e 已 seed 核心旅程（不再整体跳过），但播放 / 词汇复习 / 考试等关键流程仍缺 e2e
- **ICP compliance**：等个体营业执照才能全量部署（payment 因此保持禁用）
- 遗留 2 个 Low（已评估可接受）：token 镜像 cookie 缺 `Secure`（生产 HTTPS 补）、`stats_heatmap` 用服务器本地日期
- **"本地绿"不等于绿**：09-20 前积压的提交曾整批未过 CI（现已双绿）；提交前按 `wiki/guides/release-checklist.md` 过四道本地门
