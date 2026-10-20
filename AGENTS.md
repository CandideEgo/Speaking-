# AGENTS.md

本仓库的 agent 说明只有一个事实源：**CLAUDE.md**。本文件不复制任何规则，只是入口。

按你将要改动的目录，读对应的那一份：

| 你要动的地方 | 先读 |
|---|---|
| 仓库整体（命令、装配、架构大图、常驻规则、失效指针清单） | [`CLAUDE.md`](CLAUDE.md) |
| `backend/`（Python 约定、测试、迁移、管线细节） | [`backend/CLAUDE.md`](backend/CLAUDE.md) |
| `frontend/`（Next.js 约定、门禁、设计系统） | [`frontend/CLAUDE.md`](frontend/CLAUDE.md) |

要点提醒（**详细内容以 CLAUDE.md 为准，不要以本文件为准**）：

- 与用户交流用中文；**代码是事实源**，注释/文档/快照过期时以代码为准。
- 仓库根没有 `package.json`、没有 `Makefile`，所有命令先进 `backend/` 或 `frontend/`。
- 先验证再下结论；跑不了的检查写「未执行」，不写成通过。
- **永不为让检查变绿而放宽检查器、基线或豁免。**
- 一条事实只放一个家：新增/修改说明请改 `CLAUDE.md`，不要改本文件。
