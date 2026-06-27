# 交接说明 — 2026-06-27 晚间会话（接 HANDOFF-2026-06-27.md）

承接上午那份交接说明。本会话完成两项：①练习模式点击白屏 bug 修复（用户已确认 OK）；②Phase 3 口语评分逻辑重做（代码完成，**待实机验证**）。

## ⚠️ 工作树状态

当前分支 `windows`，**全部改动未提交**。工作树含大量 pre-existing 未提交改动（docs/CLAUDE.md/前端删文件等，非本会话），与本会话改动混在一起。明早建议：本会话改动单独 `git add` 提交，别 `git add -A` 把无关改动卷进来。

本会话实际改动文件（共 11 改 + 3 删 + 1 新增）：

**白屏 bug 修复：**
- `frontend/src/hooks/useVideoPlayer.ts` — 删字幕 `scrollIntoView` 整页自动滚动 effect
- `frontend/src/app/(main)/watch/[id]/page.tsx` — subtitleListRef 局部滚动 + 两处 label `e.preventDefault()` 阻止 sr-only radio focus 滚动

**Phase 3 口语评分重做：**
- `backend/app/services/speaking_service.py` — 主管线重构
- `backend/app/services/ai_service.py` — rubric prompt 喂对齐数据 + 撤诊断码 + 修 B904
- `backend/app/api/v1/speaking.py` — 端点解构结果 + AIServiceError→503 + 砍 shadowing
- `backend/app/schemas/speaking.py` — CriterionScore.id 改可选
- `backend/app/services/transcription/speaking_alignment.py` — 降级日志带栈
- `backend/app/services/transcription/whisper_model.py` — 撤 [Phase3] 计时日志
- `backend/tests/test_speaking_eval.py`（新增）— 映射逻辑纯函数单测
- `frontend/src/app/(main)/watch/[id]/page.tsx` — 逐词着色/维度分/toast/降噪/真波形/超时
- `frontend/src/app/(main)/speaking/page.tsx` — 砍 shadowing 卡片
- 删 `frontend/src/components/speaking/{SpeakingPanel,SpeakingModeSelector,RubricScores}.tsx`（死代码）

> 注：`watchStore.ts`、`DictationMode/FillBlankMode/ReadingMode/TranslateMode.tsx` 等是 pre-existing 改动，非本会话。

---

## 已完成

### ① 练习模式点击白屏 bug ✅（用户已确认）

- **根因**：点 `<label>` 聚焦内部 `sr-only` radio（Tailwind 默认 `position:absolute; clip`）。该 radio 无 positioned 祖先 → containing block 退化为视口根，浏览器隐式 focus 滚动把整页 `<main>` 跳走 → 上下内容滚出视口、中间白。与视频播放无关（暂停也复现）。
- **修法**：两处 label onClick 加 `e.preventDefault()` 阻止焦点转移；同时把字幕自动滚动从 `scrollIntoView`（连带 main）改为只滚内层字幕列表容器。

### ② Phase 3 口语评分逻辑重做 ⏳（代码完成，待实机验证）

**致命根因（已修）**：`evaluate_speaking` 走 rubric 路径返回 `{criteria_scores, overall_feedback}`，却用 `result.get("accuracy"/"fluency"/"completeness"/"feedback")` 读取（键不存在）→ **对齐成功的主路径存全 0 分 + 空 feedback，只有对齐失败的降级路径才有真分**，激励倒挂。

**修复要点：**
- 后端：新增 `SpeakingEvalResult` dataclass + 映射辅助函数（`_map_rubric_to_flat` 等）正确转换返回结构；空转录守卫；Whisper/对齐加 `asyncio.wait_for` 超时（120s/90s，堵住首请求下 wav2vec2 挂起）；`_get_audio_duration` 失败返 0.0；撤所有 `[Phase3]` 诊断码；rubric prompt 真把 word_scores+metrics 喂进 LLM（此前传了但 prompt 没用）；catch AIServiceError→503。
- 前端：响应类型补 word_scores/criteria_scores/overall_score；逐词着色（correct 绿/partial 黄/missing 红删除线/extra 灰）；维度分条形卡片；catch 加 toast（修静默吞错）；getUserMedia 降噪；真波形 AudioWaveform；feedback 不截断；120s 超时。
- 取舍：criteria_scores 仅当次返回、不持久化 SpeakingAttemptScore；shadowing 整条砍掉；未做音素级评分。

**验证状态：**
- ✅ 后端 `test_speaking_eval.py`(6) + `test_ai_rubrics.py` 共 23 passed；ruff + ruff format clean
- ✅ 前端 tsc + prettier clean
- ⏳ **待实机**：重启 backend 后跟读一句 ready 字幕，确认评分非全 0、逐词着色、维度分卡片、坏录音有 toast

---

## 明早待办（优先级排序）

1. **实机验证 Phase 3**（最优先）：重启 backend（`cd backend && uvicorn app.main:app --reload --port 8000`），播放页跟读一句 ready 字幕。确认评分非全0 + 逐词着色 + 维度分卡片 + 错误 toast。若全0依旧，查 backend 日志 `[Phase3]` 应已无残留；ASR/对齐超时是否触发。对齐模型首次从 HF 下 wav2vec2 可能慢，预热可选（见计划 task 6，未做）。
2. **提交本会话改动**：白屏修复 + Phase 3 分两个 commit，只 add 本会话文件。
3. **可选：对齐模型预热**（计划 task 6，跳过了）：`main.py` lifespan 启动时后台 `get_align_model("en")`，避免首请求卡顿。若实机发现首请求慢再加。

## 未开始的大块（原 HANDOFF 遗留）

- **Phase 5** — 后台视频编辑模块 + 完整发布流程（字幕/高亮编辑端点 + UI + 上传→转录→翻译→高亮→审校→编辑→发布链路）
- **Phase 6** — 联系我们模块（开发者 QQ 邮箱待提供 + 全局公告机制）
- **社区功能修复（Phase 4.5）** — `community/page.tsx` 和 `communityStore.ts` 调不存在的 `/community/posts` 端点（后端只有 `/community/feed`），且字段不匹配（`author_name/likes_count` vs `user.name/like_count`）→ 404 后静默空态

## 重要提醒

1. **勿整体重写播放页布局** — flex 高度链脆弱，用自然流 + aspect-video。见记忆 `watch-page-layout-broken-lesson`。
2. **`npm run build` 污染 dev server 的 `.next`** — 验证前端只用 `tsc`，需 build 另开或事后清 `.next`。
3. **改播放页前先 commit**。
4. **GitNexus 安全门**：改函数/类前 `gitnexus_impact`，提交前 `gitnexus_detect_changes`。
5. 图片必走 `/image-vision` skill，禁 Read 直接读图。

相关记忆：`speaking-eval-redo`（Phase3 重做）、`watch-page-layout-broken-lesson`、`optimization-roadmap`。
