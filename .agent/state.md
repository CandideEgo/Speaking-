# Project State

> Forward-looking only. Completed work belongs in `knowledge/decisions-index.md`,
> `knowledge/CHANGELOG.md` or `knowledge/archive/`; this file is a work queue, not a diary.

Last Updated: 2026-10-12

## Current Focus

- **前端视觉统一 P1–P6 全部落盘（DEC-075）、整批未提交**：P1 唯一容器、P2 页头归一、
  P3 圆角 + 颜色名收敛、P4 字号刻度 19 档 → 7 档 + display 族、P5 `Card` 强制化 + 删零引用
  primitive、P6 `globals.css` 清理 + 新增 `frontend/scripts/check-design-system.mjs`（接进
  `npm run check`，四条规则 + 点名白名单）。执行记录与每片偏差见
  `knowledge/plans/前端视觉统一-2026-10.md` §八。**下一步是把这批提交**（提交前走
  `knowledge/wiki/guides/release-checklist.md`）。三条继续改前端时要信的事实：① 14px 字号档叫
  `text-copy`（不是 `text-body` —— `--color-body` 已是全仓在用的正文颜色）；② 页头移动档是
  `text-display-sm`（24px）；③ `--text-*` 必须带 `--text-*--line-height` 且用 rem，否则行高被换
  成 `normal`、大屏（≥1536 根字号 17px）字号停止跟随。设计系统门禁**还只在 `npm run check`
  里，没进 CI**（见 Next Steps）。
- **移动端播放页待真机复看和真媒体 e2e（DEC-073/074）**：本地静态检查、vitest 和
  构建曾通过，但仓库里的媒体是占位文件，相关 mobile e2e 会 skip。需要在有真实 mp4 的机器上
  跑 `mobile-transcript-scroll.spec.ts` 与 `mobile-current-sentence-card.spec.ts`，再按
  `docs/design/mobile/destination/device-acceptance.md` 做真机记录，并重出 touch-target rev7 基线。
- **心智系统切换为“路由 + 按需技能”（2026-10-12）**：常驻规则不再承载对象认知的操作协议；
  协议唯一正文放在项目的对象认知 skill，`.agents/skills/` 与 `.claude/skills/` 双宿主保持一致。
  本轮同时改知识门禁，让它检查“规则文件没有内嵌协议”和双宿主 skill 一致，而不是要求根规则
  保留工具安装块。完成后需运行知识检查，并由接入对象认知 MCP 的会话处理受管理对象的收尾。

- **产品重构排在视觉统一之后（DEC-078）**：watch 焦点面板与首页 IA 在 DEC-075 P1–P6 完成前
  不开工；「组件体系升级」已被 DEC-075 覆盖，不另立计划。首页 IA 的前置是修排序真相
  （BUG-01：UI 写「推荐」、后端默认 `latest`）。两页形态未定，P6 之后另立决策。

## Next Steps

1. 运行 `python scripts/check-knowledge/check_knowledge.py`，修正本轮规则、skill、索引和门禁改动造成的真实违规。
2. 在接入对象认知 MCP 的会话中，让对象认知工具检查本轮新增/修改的受管理对象；不要手改机器认知卷。
   现在挂着的两项：DEC-075 P5 删掉的 `ui/Eyebrow.tsx` / `ui/Grid.tsx` 仍在机器认知卷里，
   以及 P6 改过的 `globals.css`（该卷的条目仍写 `q-opt` / `display-*` / `bento 系列` 成分组件类）。
3. 提交 DEC-075 的 P1–P6（未提交的整批），提交前按 `knowledge/wiki/guides/release-checklist.md`
   跑后端、前端、e2e 与知识检查。是否按片拆成多个 commit 由提交时决定。
4. 决定要不要把 `frontend/scripts/check-design-system.mjs` 接进 CI：CI 的 frontend job 现在是逐条
   step（`format:check` / `tsc` / `test:unit` / `lint`），没跑 `npm run check`，所以这条新门禁
   今天还拦不住 PR。加它要么改 job 的 step 列表，要么让 job 直接跑 `npm run check`。
5. 准备真实媒体后运行移动端 e2e，并安排一次 iPhone 真机验收。
6. 若要给 CI 增加按端触发，先决定是拆 workflow 并调整 required checks，还是接受现有 workflow 级过滤；job 级 `paths` 在 GitHub Actions 中不存在。

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
- **`get_user_local_date` 默认回退 UTC**：日期口径测试可能在凌晨 flake；修改回退基准需要决策。
- **不要重跑 `backfill_difficulty.py`（DEC-043）**：存量难度已经是新算值。
- **Docker 镜像 `.dockerignore` 曾漏嵌套缓存和日志**：改动后必须重建镜像并实际检查镜像内容。
