# Handoff: S6 — 复习间隔新算法（错误次数分档）+ 同日优先级

- Owner: `vocab-learning`
- Status: done
- Planner acceptance: `sr_service` 的 `1 / 6 / interval × ease_factor` 换成设计 §5.4 的错误次数分档表（保留 SM-2 全部列，`ease_factor` 不再参与计算）；复习队列排序改为「昨天错过的优先 → `wrong_count` 降序 → 到期时间升序」；review 端点补写 `wrong_count` / `last_wrong_at`；表驱动测试覆盖六情形 + 同日出队顺序；四道门全绿（mypy 与基线比对为空）。DEC-057 已由 planner 记录，本票不重复出 DEC。

## 任务

SM-2 由「质量评分 × ease_factor」驱动，而作答是客观对错、ease_factor 状态对用户不可解释，且没有「昨天错得多的词今天优先」的机制。本票把复习间隔换成错误次数分档直接计算，并重排复习队列。设计依据：`knowledge/plans/词汇训练与播放页返回-设计方案-2026-09.md` §5.4 §5.5；算法决策 DEC-057。

## 已完成

- `backend/app/services/practice_service.py` — **S6 补票（planner 解除冻结后）**：`submit_practice_results` 识别复习线词（`mastery_level ∈ {learning, reviewing}`，见关键决策 6）改走 `vocabulary_service.apply_review` 分档落库（含 `wrong_count` / `last_wrong_at`）；自动添加与仍为 `new` 的词保持冻结的 SM-2 更新；学习事件扫对复习线词跳过 `correct_count`（`apply_review` 内已计，避免双计）；模块/函数 docstring 同步。S4 干扰项逻辑零改动。
- `backend/tests/test_vocabulary_quiz.py` — 新增 `TestSubmitPracticeResults` 5 条：复习词答错（`wrong_count+1`/`last_wrong_at`/1 天）、复习词答对爬错误阶梯且 `correct_count` 恰好 +1、24h 内错过答对仍次日、`new` 词与自动添加词仍走 SM-2（`ease_factor` 更新到 2.6、首次答对 1 天）。
- `backend/app/services/sr_service.py` — 新增 `calculate_review_interval(correct, wrong_count, interval_days, wrong_recent)` 与分档常量（`CLEAN_LADDER=(3,7,16,35)`、`ERROR_LADDER=(2,5,12,25)`、`WRONG_COUNT_CAP=3`、`WRONG_INTERVAL_CAP=7`、`ROUND_INTERVAL_DAYS=1`）：答错（或本轮内曾答错）→ 1 天；干净词沿 3→7→16→35（顶格重复）；`wrong_count ≥ 1` 沿 2→5→12→25；`wrong_count ≥ 3` 时 `min(下一档, 7)`。阶梯取「严格大于当前间隔的下一档」，对 SM-2 时代的存量 `interval_days`（如 6）自然衔接。**`calculate_next_review`（SM-2）原样保留**——`practice_service` 对 new/自动添加词的 legacy 路径仍调用它。
- `backend/app/services/vocabulary_service.py` — `apply_review` 改走 `calculate_review_interval`：不再读写 `ease_factor`；`review_count` 只增不清零（见关键决策 3）；答错时写 `wrong_count += 1` / `last_wrong_at = now`。新增 `WRONG_RECENT_WINDOW = 24h` 与 `_utc_window_of_local_yesterday`（时区源与 `learning_event_service.get_user_local_date` 同源：`UserPreferences.reminder_timezone`，UTC 兜底）。`build_daily_session` 复习队列排序改为 `case(昨天错过, 0, else 1) → wrong_count desc → next_review_at asc nulls_first`。
- `backend/app/api/v1/vocabulary.py` — `POST /{word_id}/review` 文档串改为新算法语义；响应体补 `wrong_count` / `last_wrong_at` 两个字段（落库本身由 `apply_review` 统一完成，端点无散写）。
- `backend/tests/test_sr_service.py` — 原 SM-2 断言**保留未改**（被测对象 `calculate_next_review` 冻结原样，测试仍精确成立；模块 docstring 注明它只服务于 legacy 路径）。新增 `TestReviewIntervalBands`（18 行参数表覆盖设计 §5.4 六情形，含阶梯爬升与封顶边界）与 `TestApplyReviewBands`（8 条：干净词 3 天、本轮内错→次日（其后答对仍次日）、答错落 `wrong_count`/`last_wrong_at`、两条阶梯逐档爬升、≥3 错封顶 7、答错不把 `review_count` 清零、`ease_factor` 不被触碰）。
- `backend/tests/test_vocabulary_daily_session.py` — 新增 `TestReviewPriority`（昨天错 3 次 / 昨天错 1 次 / 久远前错 / 没错 四词断言出队顺序；「昨天错过但到期更晚」仍压过「到期更早但没错」）与 `TestReviewEndpoint`（答错补写两字段、干净词 3 天、旧错词答对爬错误阶梯）。

## 契约变更

- 契约文件（`backend/app/schemas/video.py`、`core/config.py`、`api/dependencies.py`、`frontend/src/lib/api.ts`/`createApiClient.ts`）：**无**。
- `POST /api/v1/vocabulary/{word_id}/review` 响应新增 `wrong_count: int` 与 `last_wrong_at: string|null`（加字段不删字段；该端点仓内已无前端调用方，S3 handoff 已注明是兼容入口）。
- `POST /api/v1/vocabulary/practice/submit` 响应形状**不变**（`{updated, auto_added}`）；行为变更：复习线词的调度从 SM-2 换成 DEC-057 分档并补写 `wrong_count`/`last_wrong_at`，new/自动添加词行为不变（向后兼容，前端无感）。
- `GET /api/v1/vocabulary/daily-session` 响应形状不变，但 `review_words` 的**顺序**变了（本票的目的）；新词队列与 totals 不变。
- 数据库 schema：**无变更**（`wrong_count`/`last_wrong_at` S3 已建；`wrong_in_round` 未新增列，见关键决策 1）。

## 关键决策

- **「本轮内曾答错」不跨表读 `study_session_items.wrong_in_round`，用 `last_wrong_at` 落在 24h 内近似（`WRONG_RECENT_WINDOW`）**。理由：`apply_review` 是复习状态唯一写入口，而它的另一个调用方 `study_session_service.submit_answer` 不在本票文件边界内（S3 收工），改调用点传 `wrong_in_round` 需要越界；且轮内答错本来就会在词行上落 `last_wrong_at=now`（S3 已做），信号已经冗余存在于 `vocabulary` 行内。24h 窗口的可靠性：轮内作答间隔以分钟计、轮后复习最早也在次日，正常流只有当前轮能在 24h 内留下错答；同日手工重测答对也按「次日」处理，语义自洽（`shared-row-locks` 的教训因此不触发——本票没有任何跨表写/锁）。缺点与残余风险见遗留 4。
- **阶梯用 `interval_days` 定位而不是 `review_count` 计数**：`interval_days` 每次作答都重写为上次算出的间隔，自校正；`review_count` 语义已与 SM-2 脱钩。存量 SM-2 数据（interval 6/15/30…）取「第一个严格大于它的档位」，平滑并入新阶梯。
- **`review_count` 答错不再清零**（SM-2 语义：`quality<3 → review_count=0`）。必须改：清零会把 `_mastery_from_review_count` 打回 `new`，答错的复习词就落进**新词队列**而不是「回到次日」的复习队列，直接违背 §5.4 情形 3。这是对 `apply_review` 既有行为的一处显式变更（ mastery 只升不降）。
- **调用方影响分析（Gate 0）**：`calculate_next_review` 的调用方 = `practice_service.submit_practice_results` 的 legacy 分支（仅 new/自动添加词，行为未动）；`apply_review` 的调用方 = `study_session_service.submit_answer`（轮内作答，quality 5/2 映射不变、调用点未动）+ `api/v1/vocabulary.py` review 端点 + **`practice_service.submit_practice_results` 复习线分支（S6 补票新增）**。`ease_factor` 的其余读取方：仅 `practice_service` legacy 分支与 `models/learning.py` 定义处。均 LOW/MEDIUM，无 HIGH。
- **S6 补票的关键决策**：① **识别依据是词行状态，不是 payload**——drill 对 due 词提交的 payload 只有 `{word, correct}`（S5 契约），无来源标记；`mastery_level ∈ {learning, reviewing}` 恰好就是复习队列的成员口径（new=学习线、mastered=已出队），与 `build_daily_session` 的队列过滤完全同构。② **new/自动添加词保持 SM-2 不变**——轮内新词走 sessions/answer（apply_review），而 VideoScopedDrill 的 new/自动添加词不在轮次语义里，「本轮内一次没错 → 3 天」对它们不成立；票面也明确「新词路径保持不动」。③ **`correct_count` 双计防护**——`apply_review` 内部已对答对 +1，学习事件扫对复习线词跳过（`review_line_words` 集合），否则答对一词计两次。④ `practice_service` → `vocabulary_service` 新增导入无循环（后者不 import 前者）。⑤ S4 干扰项逻辑（`select_distractors` 及其调用链）零改动。
- **⚠ 发现的高风险不一致 → 已解决（S6 补票，planner 解除 `practice_service.py` 冻结后）**：S5 合并循环后，到期复习词的真实作答路径是 `POST /vocabulary/practice/submit`（`drill/page.tsx:201`，一次一词），原先落在 `practice_service.submit_practice_results` 走 SM-2 且不写错误字段。补票后该路径对复习线词（`mastery_level ∈ {learning, reviewing}`）改走 `apply_review` 分档——至此新算法覆盖全部三条写入口（轮内作答 / review 端点 / practice 提交），复习线完整接上 DEC-057。
- 时区口径：「昨天」= 用户本地日（`UserPreferences.reminder_timezone`，与 S3 的 local_date 同源），窗口换算成 UTC 再进 SQL；无偏好时回退 UTC（测试即该路径）。

## 遗留

- **门禁 1 结果（含 S6 补票后重跑）**：`PYTHONUTF8=1 .venv/Scripts/python -m pytest tests/ -q` exit 0（**966 passed, 12 skipped**，7m11s；本票两轮共新增 37 条）；`ruff check` exit 0；`ruff format --check` exit 0；`.venv` mypy 2.3.1 exit 1（存量 78 errors），按 CI 同款命令与 `.mypy-baseline` 比对**差集为空**（53 个唯一 file:code 对 = 基线，无新增无消失）。未往 baseline 加行。
- 文案反查不适用（本票无前端改动）；未跑 e2e（无导航/文案/路由改动）。
- `frontend/src/components/vocabulary/DailyHero.tsx` 说明文案仍写「按 SM-2 间隔推送」——前端不在本票边界，属文案漂移，建议随 S8 或 T5 顺手改。
- 24h 近似的理论偏差：用户在轮内答错后跨越 24h 才答对（现实中轮内间隔为分钟级，不会触发），或同日稍晚手工重测——后者按设计意图处理。
- `/knowledge-maintain` 未跑（本票边界禁改 `knowledge/wiki/**` 与 `.agent/` decisions*）；跨模块知识收尾归 T5（`apply_review` 与 `submit_practice_results` 的语义变更已在各自 docstring 内自述）。
- 本票未提交（按约定由 planner 串行提交）；S8 依赖本票先合入（同文件 `api/v1/vocabulary.py`）。
