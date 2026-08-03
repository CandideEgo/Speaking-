# Changelog

本项目所有重要变更记录。格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

`npm run release` / `scripts/release.sh` 会自动 bump 版本并把未发布区段归档为新版本。

## [Unreleased]

### Added
-

### Changed
-

### Fixed
-

## [0.1.1] - 2026-08-03

### Added
- **Stage 1 播放页速效**：字幕区独立滚动、词卡默认停泊位避让字幕栏（展开=左下/收起=右下）、字幕面板收起时视频区 max-width 约束居中、侧栏收起/展开 toggle（修复 localStorage 残留 collapsed 卡死）。
- **Stage 2 播放页核心**：根容器 `h-full snap-y snap-mandatory`，屏1=视频+字幕面板、屏2=练习区，下滚翻页 + 阻尼吸附。
- **Stage 3 画布编辑器后端**：`POST /admin/{vid}/subtitles/reorder`、`POST /admin/{vid}/subtitles`（新建空行）、`DELETE /admin/{vid}/subtitles/{sid}`，复用 `_validate_timing` 不重叠校验。
- **Stage 3 画布编辑器前端**：删除行 + 新建行 UI、字幕时间轴可视化（字幕块 + 时间标尺 + playhead + 点击定位）、时间块拖拽/缩放（拖块体平移、拖边缘改 start/end，后端校验兜底）。
- **Stage 4 反馈公告系统**：Feedback 模型 + API（用户提交/admin 列表/回复/状态）、公告广播（Notification type=announcement，遍历全体用户）、`/contact` 页（联系方式 + 公告区 + 反馈表单 + 我的反馈）、admin `/admin/feedback` 页（发送公告 + 反馈管理 + 回复）。

### Changed
- 字幕编辑器加内联两步删除（首次点击武装"确认删除"，3s 超时复位）。
- `WordTooltipInline` 加 `data-testid="word-tooltip"` 做稳健测试选择器。

### Fixed
- F1：主应用桌面 sidebar 无收起/展开按钮，localStorage 残留 `sidebar-collapsed=true` 时卡死"无法打开"。
- Stage 1 e2e：词卡选择器 `.fixed.z-50` 与移动端遮罩歧义，改用 `data-testid`；过滤 analytics keepalive 预检 405 网络噪音。

### Diagnosed
- Stage 5 ASR/标注质量：用户报的 good->best / more->mores / out->outing / I->abiding 在当前代码已全部正确处理（`ecdict-exchange-lemma-bug` 已修），无需改代码。详见 `wiki/problems/asr-annotation-quality-diagnosis.md`。
