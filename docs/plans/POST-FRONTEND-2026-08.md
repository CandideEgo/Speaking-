# 后续开发整体计划 POST-FRONTEND-2026-08

> 前端设计重构（FRONTEND-REFACTOR-2026-07）基本完成后，**后续开发 + 后端开发**的整体落地计划。
> 来源：用户整理的三主题（视频编辑模式 / 用户反馈与引导 / 维护与升级）+ `docs/plans/后续开发项目.txt` 零散需求。
> 决策确认（2026-08-01）：**起步 = 模块 A（播放页改版）+ F（Bug 修复）**；**模块 B（画布编辑器）本轮仅 MVP，进阶后置**。

---

## 进度（2026-08-02 更新）

| 阶段 | 状态 | commit |
|---|---|---|
| **1 速效** F + A2/A4/A5 | ✅ 完成 | `b108735` |
| **2 播放页核心** A1/A3/A6 | ✅ 完成（低风险 snap 实现） | `c726b40` |
| **3 画布 MVP 后端** B-B1/B2/B3 | ✅ 完成（reorder/create/delete + 11 测试） | `fed2740` |
| **3 画布 MVP 前端** | ✅ 删除行+新建行 `880fbb5`；时间轴 B-F2 `83330a7`；时间块拖拽/缩放 B-F4 `de62228` |
| **3 画布收尾** B-F3 拖拽排序 / B-F6 画布入口 | ⏳ 后置（B-F3 与时间重叠校验语义冲突，需更复杂设计） | - |
| **4 反馈公告** C1~C4 | ⏳ 待办 | — |
| **5 ASR 质量** D3 | ✅ 诊断完成（无需改代码，详见 wiki/problems/asr-annotation-quality-diagnosis.md） | — |
| **6 运维补丁** E1~E6 | ⏳ 待办（非上线阻塞） | — |

**已落地要点**：
- A2 字幕区 `flex-1 overflow-y-auto`；A4 词卡展开=左下/收起=右下（`data-testid="word-tooltip"`）；A5 收起时视频 `max-width` 约束居中。
- A1/A3/A6：根容器 `h-full snap-y snap-mandatory`，屏1=header+视频+字幕面板（`min-h-full`，仅字幕列表内滚），屏2=练习区。**未重写 flex 高度链**（遵循 watch-page-layout-broken-lesson），保留 `aspect-video` 与 aside sticky。本地 Playwright 几何验证：snap 容器 scrollHeight>clientHeight、下滚吸附到屏2、字幕列表内滚、无横向溢出、无黑屏。
- F1 根因：主应用桌面 sidebar 无收起/展开按钮，localStorage 残留 `sidebar-collapsed=true` 时卡死"无法打开"。TopBar 加 `PanelLeftClose/Open` toggle 修复。
- F1 复现：移动端汉堡 + 桌面点击"词汇本"导航在新用户态均无法复现报错（e2e 通过），故 F1 真实根因为桌面卡死收起态。
- B 后端三端点复用 `_validate_timing`；reorder 校验 id 集合完整 + index 连续 + 新邻居顺序不重叠；create 末尾追加 + 空文本占位；delete 闭合 index 间隙。`adminData.ts` 客户端函数已补齐。

**Stage 3 前端起手注意**：后端已就绪，前端可直接消费 `reorderSubtitles/createSubtitle/deleteSubtitle`（adminData.ts）。MVP 范围 = 时间轴 + 文本编辑 + 拖拽排序（B-F1~F4），多选批量（B-F5）与画布入口（B-F6）可后置。

---

## 一、现状摸底结论（2026-08-01 三路调查）

| 板块 | 现状 | 离目标差多少 |
|---|---|---|
| **播放页** | 自然流长文档，视频 `aspect-video` 按宽算高，无 `h-screen`；右栏字幕 `max-h-560px` 硬编码但已有独立滚动；练习区在文档流末尾；词卡已可拖动但默认右下角压字幕栏；shell `<main>` 是滚动容器，无 snap/阻尼 | 固定一屏=大改、翻页到练习≈0、阻尼=0 |
| **视频编辑（画布）** | 后端字幕 CRUD/校验/历史已 80% 就绪（单句+批量 PATCH、split、merge、resegment、word_levels、修订回滚）；前端是单句卡片式，无时间轴/拖拽/多选 | 后端仅缺 reorder/增删行；前端画布层 0%，是主工作量 |
| **反馈/联系/公告** | 全空白（无页面、无 API、无模型）；Onboarding 已达标（3 步+跳过） | 从零搭，工作量最大 |
| **维护与运维** | compose 全套 + CI 硬门 + `/health` + Prometheus + structlog + 可选 Sentry + Flower + CHANGELOG；Alembic 51 个迁移成熟 | C 不用动；B 打补丁（CD/前端 Sentry/日志聚合/外部告警） |

> **重要**：用户原始标题里没列"播放页改版"，但 `后续开发项目.txt` 里一半痛点都是播放页的（固定一屏、字幕补空、词卡位置、缩放过大、阻尼、翻页到练习）。单列为**最高优先级模块 A**，影响每个用户、全是已抱怨痛点。

---

## 二、模块划分

### 模块 A - 播放页体验改版（最高优先级，先行）

| 子项 | 内容 | 风险 |
|---|---|---|
| A1 | 固定一屏：根容器 `h-full` flex，视频+字幕行占满视口剩余高，视频从 `aspect-video` 改填满 flex 高度 | ⚠️ 高（watch-page-layout-broken-lesson） |
| A2 | 字幕区单独滚动：`560px` 硬编码改 `flex-1 overflow-y-auto`（机制已就绪，只改高度策略） | 低 |
| A3 | 下滑翻页到练习：`scroll-snap` 双屏容器（屏1=视频+字幕，屏2=练习），滚动容器是 shell `<main>` | 中 |
| A4 | 词卡默认位置重定：避开右栏字幕（默认左下/收起时才弹），保持可拖动 | 低 |
| A5 | 缩放收起后视频不过大：收起时给视频区加 `max-width` 约束，别让 `1fr` 无限撑 | 低 |
| A6 | 阻尼感：`snap-mandatory` 提供吸附点，解决"松散" | 中（与 A3 同源） |

**关键文件**：`frontend/src/app/(main)/watch/[id]/page.tsx`（L351 根、L456 双列 grid、L469 视频、L731 右栏、L748 字幕滚动、L791 练习区、L798 词卡）、`MainLayoutInner.tsx`（L75-77 shell 滚动容器、L22-30 html 锁滚）、`WordTooltipInline.tsx`（L67/L73 默认右下角、L31-63 拖动）、`SubtitleModeTabs.tsx`（L86-93 折叠按钮）、`watchStore.ts`（`panelCollapsed` L10-11）。

### 模块 B - 视频编辑模式（画布式字幕编辑器）— 本轮仅 MVP

**MVP：时间轴 + 字幕文本编辑 + 拖拽排序**

后端（先行，解阻塞）：
- B-B1 `reorder` 端点：`POST /admin/{vid}/subtitles/reorder`，接受 id->sentence_index 映射，事务内重排 + 不重叠校验（复用 `_validate_timing`）
- B-B2 新建空行：`POST /admin/{vid}/subtitles`
- B-B3 删除单行：`DELETE /admin/{vid}/subtitles/{sid}`

前端：
- B-F1 引入 `@dnd-kit`（核心 + sortable）
- B-F2 时间轴组件：自绘 SVG/div，按 start/end 渲染字幕块 + 时间标尺 + playhead
- B-F3 拖拽排序轨道：`@dnd-kit/sortable` 垂直列表，拖动改 `sentence_index`
- B-F4 时间块拖拽/缩放：拖动改 start/end，后端时间校验兜底
- B-F5 多选 + 批量编辑 UI：复用现有批量 PATCH 端点
- B-F6 入口：`admin/videos/[id]` 加"画布模式"切换（卡片式 ↔ 画布式）

**进阶（后置，待 MVP 用起来再评估）**：B-F7 自由画布 / B-F8 字幕样式（字体/大小/颜色/位置，需新增迁移）/ B-F9 批量操作（时间偏移/批量润色/批量高亮）。

**关键文件**：后端 `backend/app/api/v1/videos.py`（L476-677 字幕路由）、`backend/app/services/subtitle_edit_service.py`（`_validate_timing` L73-111）、`backend/app/schemas/video.py`（`SubtitleUpdate` L148-184）；前端 `VideoSubtitleEditorPanel`、`SubtitleEditor.tsx`、`WordLevelsEditor.tsx`、`SubtitleHistory.tsx`、`adminData.ts`（API 客户端函数齐全）。

### 模块 C - 用户反馈与引导

- C1 `/contact` 页面（开发者 QQ 邮箱占位 + 公告区）
- C2 后端 Feedback 模型 + API（用户提交反馈，admin 查看）
- C3 公告系统：复用 Notification 表加 `announcement` type + `broadcast_all_users` 服务函数；admin 发公告 UI + 用户端公告横幅/弹窗
- C4 反馈入口：TopBar 头像菜单 / Footer / Profile 加"反馈与建议"
- C5 Onboarding 增强（可选，跳过后引导回填）

### 模块 D - 后端开发

- D1 字幕接口补全（= B-B1/B2/B3，属 B 但为后端工作）
- D2 视频元数据补全：`description` / `thumbnail_url` 写入接口（`VideoAdminUpdate` 扩展 + 封面上传）
- **D3 ASR/标注质量**（`后续开发项目.txt` 第 15-18 条）：good->best、more->mores、out->outing 这类"时态搞错"**极可能是 ECDICT 词形还原/标注环节而非 WhisperX ASR**（关联 memory `ecdict-exchange-lemma-bug`）。"I"->"abiding" 可能是词对齐错误。**需先诊断定位再修**：跑样本对比"原始 ASR 输出 vs 标注后输出"。

### 模块 E - 维护与升级

- E1 CD 自动部署（CI 已有，加 deploy job：构建推 registry + 服务器 pull + restart）
- E2 前端 Sentry SDK 接入（后端已有，前端缺）
- E3 日志聚合落地（Loki/ELK 容器接入，structlog JSON 已就绪）
- E4 外部告警通道（Sentry alerts 或钉钉/邮件 webhook，接 `/health` 降级 + 质量告警）
- E5 版本管理规范：`package.json` 与 CHANGELOG 同步 + release tag 脚本
- E6 `scripts/README` 补全（顺手）

### 模块 F - Bug 修复（先行）

- F1 词汇本左侧功能栏无法打开报错（需先复现诊断）
- F2 顺便检查整个功能栏，有问题就修复

---

## 三、执行节奏（价值 × 依赖 × 风险）

| 阶段 | 内容 | 理由 |
|---|---|---|
| **1 速效** | F（bug）+ A4/A5/A2（词卡位置/缩放约束/字幕高度） | 用户已抱怨、改动小、风险低 |
| **2 播放页核心** | A1+A3+A6（固定一屏+翻页+阻尼）⚠️ | 高风险区，单独 commit，小步验证 |
| **3 画布 MVP** | B-B1~B3 后端先行 -> B-F1~F6 前端 | 最大一块，后端先行解阻塞 |
| **4 反馈公告** | C1~C4 | 独立不依赖其他 |
| **5 ASR 质量** | D3 诊断->修复 | 诊断先行，避免盲改 |
| **6 运维补丁** | E1~E5 | 非上线阻塞，可后置 |

D2（元数据补全）可并入阶段 3 或独立小项。

---

## 四、已确认决策（2026-08-01）

1. **起步 = 模块 A + F**：播放页改版 + Bug 修复先行。
2. **模块 B 仅 MVP**：进阶（自由画布/样式/批量）后置，待 MVP 用起来再评估。
3. 其余模块（C/D/E）按阶段节奏推进，不提前开工。

---

## 五、关键风险

1. **watch 页布局**：A1/A3 命中 `watch-page-layout-broken-lesson` 教训（勿整体重写 flex 高度链）。对策：改前先 commit，用自然流+aspect-video 思路渐进改，每步 curl/截图验证。
2. **画布编辑器依赖后端**：reorder/增删行端点必须先于前端画布落地，否则拖拽排序无法提交。
3. **ASR 质量诊断**：D3 必须先跑样本对比"原始 ASR 输出 vs 标注后输出"，确认是 ASR 还是 ECDICT 标注环节再动手，避免改错地方。

---

## 六、执行原则

- 每阶段一个 commit，tsc + lint + build 绿码为准
- 改 watch 页前先 `git commit` 当前状态（教训）
- 后端先行：画布 MVP 的 reorder/增删行端点先落地，前端再接
- 保留功能：所有数据接入（api/stores/hooks）不变，只改布局/视觉/交互
- 复用现有件：`VideoSubtitleEditorPanel` 的播放器+列表、`SubtitleEditor` 字段表单、`WordLevelsEditor`、`SubtitleHistory`、`adminData.ts` API 客户端
