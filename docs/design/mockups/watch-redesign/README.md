# Watch 播放页重设计原型（历史物料）

> **只借形式，不借内容。** 这批原型早于当前的应用外壳，不能当现行设计的依据。

## 事实

- **建于 2026-06-27**（`c7487cb`），比前端重构还早
- **模拟的是一套已废弃的外壳**：`B-collapsible-panel.html` 里搭的是左侧 248px `<aside>` 导航（`首页 / 练习 / 词汇`）。那套外壳已经拆了——`knowledge/plans/FRONTEND-REFACTOR-2026-07.md` 记的是「移除左 Sidebar，改顶部 TopBar 水平导航」。现行外壳是 `TopBar` + `MobileTabBar`
- **只覆盖桌面**：三个变体各 170–192 行，**`md:` 断点 0 个**，容器宽度是 `max-w-[1400px]` / 侧栏 248px / `max-w-[1100px]`。三个变体比的全是宽屏下的播放器摆法，**从没碰过 375px**
- **没有决策记录**：在 `knowledge/`、`.agent/`、`docs/`、`AGENTS.md` 里搜「watch-redesign」**无命中**；也没有对应的 DEC / ADR。（按变体文件名搜会在本文件命中——因为下表列了这些文件名，那是本文件唯一的痕迹。）当时为什么选了这一版，不可考
- 现行实现带着 B 的形状（`frontend/src/stores/watchStore.ts` 的 `panelCollapsed` + 56px 折叠轨道），但这条传承没有记录在案

## 文件

| 文件 | 是什么 |
|---|---|
| `index.html` | 三个变体的对比页，含「做减法」规则说明 |
| `A-fullwidth-tabs.html` | 视频全宽 + 下方标签页 |
| `B-collapsible-panel.html` | 可折叠字幕面板（现行实现接近这一版） |
| `C-immersive-centered.html` | 沉浸居中 |
| `A-skill.html` | A 的变体 |

## 怎么用

- ✅ 借**形式**：三个并列变体 + 一个对比页，这套做法好用，后来的移动端原型继续沿用
- ❌ 不借**内容**：桌面布局、左侧栏外壳、容器宽度都与现状脱节，照着对齐等于对齐一个已被拆掉的架构
- ⚠️ 打开需要联网：`index.html` 与各变体都走 `cdn.tailwindcss.com`

## 沿革

- 2026-06-27 建立（`c7487cb`）
- 2026-09 随目录重排从 `docs/mockups/` 搬到 `docs/design/mockups/`（DEC-063）
- 2026-09-29 加本文件：标明年代与失效的外壳模型
