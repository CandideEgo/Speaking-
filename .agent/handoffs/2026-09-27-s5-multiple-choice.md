# Handoff: S5 选择题化前端 + 轮次接题型

- Owner: `vocab-learning`
- Status: done
- Planner acceptance: 全程无「认识/不认识」按钮；`对→错→对→对` 才毕业；答对一次的词不会紧接着再问（隔 5 题）；同一个词第 2 次出现题型变了（英→中 → 中→英）；答错的词隔 1 题重现；作答反馈含对错标注、完整释义、原句与「去原视频」、「下一个」手动推进；新词首次出现带原句语境。

## 任务

`WordFlashcard.tsx` 的「认识/不认识」双按钮整体废弃，改为选择题卡；`drill/page.tsx` 的「闪卡学新词 → 复习测验」两阶段合并为一条全程选择题循环；题型按出现次序轮换（第 1 次英→中、第 2 次中→英、第 3 次起听音选词/英→中）；调度（连对 2 次毕业、答错隔 1 题、答对隔 5 题）抽成纯函数放 `frontend/src/lib/` 并补单测。DEC-056 已由 planner 记录，本票不重复出 DEC。

## 已完成

- `frontend/src/lib/drillRound.ts`（新增）— 调度纯函数：`buildDrillScheduler`（建队：本轮未毕业新词 + 到期复习词，续轮从 S3 落库状态推导）、`applyAnswer`（答对 +1 / 答错清零；连对 2 次毕业出队；答错隔 1 题、答对隔 5 题重插；队首即当前题，无独立光标）、`nextAppearanceFromItem`（落库状态 → 出现次序）、`dropCurrent`/`currentEntry`/`poolFromState`。常量 `GRADUATE_STREAK=2`、`GAP_AFTER_WRONG=1`、`GAP_AFTER_CORRECT=5`。
- `frontend/src/lib/drillQuestions.ts`（新增）— 出题纯函数：`questionKindForAppearance`（题型轮换：1→en2zh、2→zh2en、3+→listen2word/en2zh 随机）、`buildDrillQuestion`（从本轮词池造 4 选项：同词性优先、长度相近、释义去重、同义/包含排除，候选不足降级 3 选项、再不足返回 null 跳过）、`conciseTranslation`。
- `frontend/src/lib/drillRound.test.ts` / `drillQuestions.test.ts`（新增，vitest 既有范围）— 17 条：对→对毕业、对→错→对→对毕业、间隔 5/1 的精确断言、due 词不重插、续轮推导、已毕业/已删词跳过、题型轮换、同词性优先、包含排除、去重、洗牌、降级与 null。
- `frontend/src/components/vocabulary/WordFlashcard.tsx` — 组件重写为 `WordQuizCard`（文件名保留）：三种题型共用一卡（英→中显单词+IPA、中→英显释义、听音选词只出音频）；作答后标对错（选中红/绿、正确项高亮）→ 展开词性/音标/释义/例句 → 有原句时显示原句（词高亮）+「去原视频」（复用 `watchSentenceHref`，`from=drill` 返回续轮）→ 底部「下一个」禁用直至作答，手动点击才推进；键盘 1-4 选择、Enter 下一个；进题自动发音（中→英不读，防泄底）。原句语境在英→中题干展示（§4.3）。
- `frontend/src/app/(main)/vocabulary/drill/page.tsx` — 两阶段合并为一条循环：队列 = 本轮未毕业新词（每题作答 POST `/sessions/{id}/answer`，续轮从落库状态接上）+ 到期复习词（`daily-session` 的 review_words，各问一次，SM-2 走 `POST /vocabulary/practice/submit` 一次一词）；「下一个」触发出队/重插；队列耗尽进总结；「再加练一轮」= finish → start("extra") → `daily.refresh()`（重新取到期词，防止本轮答过的复习词混入加练轮）。`VideoScopedDrill`（`?video_id=` 深链）保持原 `UnifiedPracticePanel` 流程不动。
- `frontend/src/components/vocabulary/TrainSummary.tsx` — 统计口径标签随合并循环微调：「复习正确率」→「作答正确率」、统计卡「复习测验」→「作答正确」（正确率现按全部作答统计，不再分两段）。

## 契约变更

- `backend/app/schemas/video.py`、`core/config.py`、`api/dependencies.py`、`frontend/src/lib/api.ts`/`createApiClient.ts`：无。
- **答题提交 / 轮次响应体：无字段变化**（票面要求即使「无」也写明）。`POST /sessions/{id}/answer` 请求/响应、`GET /sessions/current`、`POST /sessions` 响应均原样；本票未动任何后端文件（见关键决策第 1 条），S3 建的 `correct_streak`/`wrong_in_round`/`status` 契约照用。
- 行为级：到期复习词的 SM-2 提交从「总结前一次性批量」改为「每题一次（单条 results 数组）」，端点与语义不变（`/vocabulary/practice/submit`）。

## 关键决策

- **题型轮换接「出现次序」落在前端（`lib/drillQuestions.ts`），`practice_service.py` 未改动**。票面给了两条接法（前端请求携带 / 由 `study_session_items` 推导），但两者都要动 `api/v1/vocabulary.py` 的路由/查询参数或响应 schema——该文件在本票边界里明确冻结（S6/S8 的地盘）。合并循环的题目只能客户端构建（词池 = 本轮全部词，含完整 `VocabularyWord` 数据），因此出现次序在活会话内由调度器精确累计，后端无从参与。**后端 S4 的三级干扰项池（ECDICT）因此不在每日循环里生效**——客户端干扰项取自本轮词池，天然满足 S4 优先级 1 的「同视频/同批」来源；ECDICT 兜底仍服务于 `GET /vocabulary/practice`（VideoScopedDrill 深链）。若 S6/S8 期间要打通，需要给 practice 路由加 `vocabulary_ids`/`appearances` 透传，属 API 契约变更，需另开票。
- **出现次序的续轮推导是下界**：S3 落库只有 `correct_streak`（答错清零）+ `wrong_in_round`（布尔），「对→错」与「对→错→错」都落成 streak=0 + wrong=true，真实次数不可恢复。`nextAppearanceFromItem` 返回下界（宁可题型少换一次，不会把第 2 次错标成第 1 次）；验收场景（同词第 2 次题型变化）在活会话内是精确的。若要精确，需把 `wrong_in_round` 从布尔改为计数——schema 变更，留给后续票。
- **到期复习词并入同一条循环但只问一次、不进调度**：设计文档 §5.4 明确「复习是另一条线」（节奏由 S6 的错误次数分档管），所以 due 词答错不重插、无毕业概念；答完即出队。SM-2 更新走 `/vocabulary/practice/submit`（quality 5/2），与旧复习测验同写入口。
- **调用方影响分析**：`WordFlashcard` 仅 `drill/page.tsx` 一处引用（grep 核实），重写无外部破坏；`TrainSummary` 仅 drill 使用；`useVocabularyPractice`/`UnifiedPracticePanel` 仍被 `VideoScopedDrill` 使用，签名未动；`useStudySession`/`useDailySession` 未改（不在本票允许路径内，也无需改）。
- DEC-056（选择题化）由 planner 记录；本票未触碰 `.agent/decisions*`。

## 遗留

- **门禁 1 结果（前端）**：`npx tsc --noEmit` exit 0；`npm run test:unit` exit 0（108 passed，含本票 17 条新单测）；`npm run lint` exit 0（0 errors，10 warnings 全部为存量文件）；`npm run format:check` exit 0；`npm run build` exit 0。
- **文案反查**：`grep -rn "认识\|不认识\|再来一组" frontend/e2e/` 无命中（exit 1）；`frontend/src/` 无命中（exit 1）——产品文案清零，e2e 无旧断言需改。`e2e/screenshot-matrix.spec.ts:75` 会对 `/vocabulary/drill` 重新截图（只截图不断言，画面必然变化）。
- **门禁 1 结果（后端）**：见下（pytest/mypy 用 `.venv` 解释器跑；本票未动任何后端文件，结果为基线确认）。
- **未跑 e2e**（需起 dev 栈）；调度/出题逻辑已由纯函数单测覆盖，组件交互按执行方案 §4-S5 用 e2e 冒烟，留给补跑窗口（与 T2 同批）。
- 干扰项的 ECDICT 兜底与「必须凑够 4 选项」硬约束仅在 VideoScopedDrill 路径生效（见关键决策第 1 条）；客户端出题在词池 <3 个可用候选时降级 3 选项、<2 时跳过该词（正常配额 ≥5 词不会触发）。
- S6（复习间隔新算法）落地后，若复习线改走轮次，本票 due 词「只问一次」的简化可回收进调度器；S8 与本票无文件交集。

## 门禁（后端，收工时填写）

- `PYTHONUTF8=1 .venv/Scripts/python -m pytest tests/ -q`：exit 0（930 passed, 12 skipped，7m12s）。
- `.venv/Scripts/python -m mypy app/ --ignore-missing-imports`：exit 1，77 errors / 38 files——与已知基线漂移（干净树 77）逐数一致，本票后端 0 改动、0 新增。
