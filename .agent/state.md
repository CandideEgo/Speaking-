# Project State

> Forward-looking only. Completed work belongs in `knowledge/decisions-index.md`,
> `knowledge/CHANGELOG.md` or `knowledge/archive/`; this file is a work queue, not a diary.

Last Updated: 2026-10-13

## Current Focus

- **前端缺陷清单余项已全量修复（BUG-03 ~ BUG-20）**：13 条一次收口、每个 BUG 一条提交
  （DEC-075 P1–P6 整批已先行落盘）。字幕模式新增单一来源 `frontend/src/lib/subtitleModes.ts`
  （双语/英文/中文/关闭），首页问候与日期改由后端 profile 下发 `local_date` / `local_hour`，
  「用户本地日」的三套回退口径收敛为 `backend/app/services/local_time.py`（默认 Asia/Shanghai，
  行为变更见 **DEC-079**），`videos.duration` 数据侧校正脚本
  `backend/scripts/backfill_video_duration.py` 默认 dry-run、写入要显式 `--apply`。
  **未执行的验收**：本机无 Postgres / Redis / 后端，e2e 与脚本的 DB 分支都没跑，需在带服务的
  机器上复跑（见 Next Steps）。三条继续改前端时要信的事实：① 14px 字号档叫 `text-copy`
  （不是 `text-body` —— `--color-body` 已是全仓在用的正文颜色）；② 页头移动档是
  `text-display-sm`（24px）；③ `--text-*` 必须带 `--text-*--line-height` 且用 rem，否则行高被换
  成 `normal`、大屏（≥1536 根字号 17px）字号停止跟随。设计系统门禁**还只在 `npm run check`
  里，没进 CI**（见 Next Steps）。
- **移动端播放页待真机复看和真媒体 e2e（DEC-073/074）**：本地静态检查、vitest 和
  构建曾通过，但仓库里的媒体是占位文件，相关 mobile e2e 会 skip。需要在有真实 mp4 的机器上
  跑 `mobile-transcript-scroll.spec.ts` 与 `mobile-current-sentence-card.spec.ts`，再按
  `docs/design/mobile/destination/device-acceptance.md` 做真机记录，并重出 touch-target rev7 基线。
- **产品重构排在视觉统一之后（DEC-078）**：watch 焦点面板与首页 IA 在 DEC-075 P1–P6 完成前
  不开工；「组件体系升级」已被 DEC-075 覆盖，不另立计划。首页 IA 的前置是修排序真相
  （BUG-01：UI 写「推荐」、后端默认 `latest`）。两页形态未定，P6 之后另立决策。

## Next Steps

1. **对象认知收尾未完成（阻塞，需人工先做范围复核）**：本轮改动覆盖 8 个尚无认知条目的对象
   （`lib/subtitleModes.ts`、`services/local_time.py`、`scripts/backfill_video_duration.py`、
   `schemas/common.py` 等）、3 个孤儿条目（本轮的 `components/subtitle/SubtitleList.tsx` +
   DEC-075 P5 删掉的 `ui/Eyebrow.tsx` / `ui/Grid.tsx`），以及一批更早轮次留下的过期条目
   （`.agent/*`、`AGENTS.md`、`backend/AGENTS.md`、skills、`check-design-system.mjs`）。工具判定
   阻塞：要先由人工复核托管范围里待确认的对象、并对孤儿条目的去留做显式裁决，机器才会签发创作
   批次。机器状态是「未对齐」，不要手改认知卷资产，也不要为让它变绿而改检查器或白名单。
   另有一项旧账：DEC-075 P6 改过的 `globals.css`，其条目仍写着已废弃的成分组件类。
2. 在带 Postgres / Redis / 后端的机器上跑 e2e：`watch.spec.ts` 的「关闭」档新用例、
   `mobile-current-sentence-card.spec.ts`、`mobile-inline-subtitle.spec.ts`（后者需真实 mp4，
   占位文件会 skip）；随后按 `docs/design/mobile/destination/device-acceptance.md` 做 iPhone 真机
   验收、重出 touch-target rev7 基线。
3. `backfill_video_duration.py` 先在有库的环境跑 `--dry-run` 看差异明细，确认后再决定是否
   `--apply`；生产执行不在本轮。
4. 决定要不要把 `frontend/scripts/check-design-system.mjs` 接进 CI：CI 的 frontend job 现在是逐条
   step（`format:check` / `tsc` / `test:unit` / `lint`），没跑 `npm run check`，所以这条新门禁
   今天还拦不住 PR。加它要么改 job 的 step 列表，要么让 job 直接跑 `npm run check`。
5. 若要给 CI 增加按端触发，先决定是拆 workflow 并调整 required checks，还是接受现有 workflow 级过滤；job 级 `paths` 在 GitHub Actions 中不存在。

## Known Issues

- **本机没有 npm**：`node` 在 `.cache/codex-runtimes/.../node/bin/node.exe`，npm 不在 PATH。
  前端检查直接跑 `frontend/node_modules/.bin/{tsc,eslint,prettier}.cmd`
  （= `typecheck` / `lint` / `format:check`），dev 与 e2e 用 `next.cmd` / `playwright.cmd`；
  设计系统门禁直接跑 `node frontend/scripts/check-design-system.mjs`（它不需要 node_modules）。
- **本地“绿”不等于 CI/生产绿**：提交前按 `knowledge/wiki/guides/release-checklist.md`
  跑后端、前端、e2e 和知识检查；后端必须使用 `backend/.venv/Scripts/python.exe`。
- **播放类 e2e 需要真文件**：`backend/media/<id>.mp4` 只有 7 字节占位时，需要真实播放的
  mobile e2e 会整条 skip；CI seed 的假 URL 也可能 404。
- **本地 e2e 注册可能被限流**：`/auth/sms/register` 为 3/minute/IP；看到 429 时清对应
  Redis limiter key 后重跑。
- **mobile-chrome 尚未进 CI**：本地曾跑 102 passed / 1 skipped，但 CI 目前只跑 chromium。
  加 mobile-chrome 约增 1.3 分钟，可补移动形态回归；这是待决的门禁选择。
- **E2E 覆盖仍不完整**：词汇复习、词表训练和桌面播放深流程缺少功能级 e2e；播放页与考试流程覆盖较多。
- **真机验收仍欠**：内联播放、滚动跟随、字幕同步、跟读录音和移动触控目标需要真机证据；
  局域网 HTTP 非安全上下文会限制部分录音量具。
- **横屏模式保持 deferred（DEC-068）**：现有断点和画框高度存在已知问题；要改先开票和做产品决策。
- **生产 `ENV` 漏配会退回 development 形态（DEC-051 残留）**：支付签名旁路、mock 支付路由、
  HSTS/CSP 缺失都可能出现；部署后必须显式核验。
- **支付仍因 ICP 合规保持禁用**：兑换码是唯一渠道；等个体营业执照完成后再评估在线支付。
- **Catalog 并发 promote 有窄窗（DEC-049 残留）**：共享 `source_url` 的条目并发 promote 仍可能各播一次。
- **非有限浮点读路径未完全设防**：写入侧已拦，历史 JSONB、裸 dict 响应仍可能把 `NaN`
  带入 `json.dumps(allow_nan=False)`。
- **mypy 是基线门，不是无错门**：不要为掩盖新增错误扩展 `backend/.mypy-baseline`；
  目前类型检查版本钉在 `<2.4`。
- **静态分析基线不是无害证明**：涉及 ORM 属性、列名和跨模块签名的基线条目仍需按代码求证。
- **「用户本地日」的默认基准已是东八（DEC-079）**：未设置 / 非法 `reminder_timezone` 的用户
  统一按 Asia/Shanghai 翻天，不再一处 UTC、一处东八。日期口径测试若在凌晨边界 flake，先看是不是
  跨了东八零点；再改基准要走决策。
- **不要重跑 `backfill_difficulty.py`（DEC-043）**：存量难度已经是新算值。
- **Docker 镜像 `.dockerignore` 曾漏嵌套缓存和日志**：改动后必须重建镜像并实际检查镜像内容。
