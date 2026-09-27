# Handoff: S4 干扰项生成重写

- Owner: `vocab-learning`
- Status: done
- Planner acceptance: 每道选择题恰好 4 选项、含 1 正确项；选项与正确项同词性（词性缺失时同长度档）；用户词库只有 2 个词时仍能出 4 项（ECDICT 兜底）；不存在与正确项同义/包含的选项；同一题的选项顺序可复现地被洗牌。

## 任务

重写 `practice_service` 的干扰项生成：替换「本批词译文去重取前 3」的占位实现，按设计文档 §8.2 三级来源（同视频同等级同词性 → 词库内编辑距离 2~4 → ECDICT 高频词）选题，修掉候选不足时 `options=None` 的兜底洞。

## 已完成

- `app/services/practice_service.py`：新增独立纯函数 `select_distractors`（四级优先级梯子 + §8.3 硬约束：排除与目标词同词、释义去重、同义/包含排除、洗牌）与候选载体 `DistractorCandidate`；新增 `_load_distractor_candidates`（一次查询用户全词库 → same_video / rest 两池，等级与词性优先取 ECDICT、缺失回退 `part_of_speech` 列）与 `_ecdict_candidates`（优先级 3 池，按目标词等级并集过滤）。
- `app/services/practice_service.py`：`_build_recognition_item` 改收 distractors 列表；`build_vocabulary_drill` 拆掉 `all_translations`，每题调用 `select_distractors`。四级梯子最后一级是无约束放松档——保证几乎总能凑满 4 选项；真正凑不满（如 ECDICT 不可用且词库仅 1 词）仍 `options=None`，但门槛从「候选 <2」收紧为「干扰项 <2」。
- `app/services/ecdict.py`：新增 `entries()`——只读快照枚举索引内全部考试词条，供兜底池使用（可在测试中 monkeypatch）。
- `tests/test_vocabulary_quiz.py`：从 7 行 docstring 补齐 11 个用例——优先级三级各自命中、同义/包含排除、释义去重、放松档兜底、空译文、洗牌非固定位、pos 解析、以及 2 词词库 + fake ECDICT 的全链路集成（断言 4 选项、无重复、answer 唯一、无同义/包含）。

## 契约变更

- `backend/app/schemas/video.py`、`core/config.py`、`api/dependencies.py`、`frontend/src/lib/api.ts`：无。
- 行为级（无 schema 变化）：recognition 题的 `answer` 从多行全文改为单行释义（`_concise_translation` 取首行），与 options 内的正确项严格相等（前端 `usePractice.ts` 按 `item.answer` 比对选中项，已核实兼容）；`item.translation` 仍为原文，供 S5 的答后完整释义展示。选项展示串统一单行化，多义/多词性长翻译不再整段塞进选项。

## 关键决策

- 「同等级」= ECDICT `levels` 有交集（与 `build_vocabulary_drill` 的 `should_display` 过滤同源但更宽——交集而非最高档比较）；「同词性」= POS token 集合有交集，双侧都缺失时退化为长度档（差 ≤2）；**单侧缺失时放行**——数据不全的候选仍留在对应优先级档里，由档位顺序保证质量，而不是全部跌到底层放松档。
- 优先级 3 用 BNC 频次升序（低 = 高频）；先 shuffle 再稳定排序，同频次候选轮换、跨频次有序，保证「可复现地被洗牌」。
- ECDICT 不可用（CI）时兜底池为空，功能退化为词库内两档——`ecdict.lookup` 返回 None 的路径与现有 gloss 行为一致，无需新分支。
- 影响面分析（手动调用方分析）：`build_vocabulary_drill` 仅 `api/v1/vocabulary.py:329` 一个生产调用方 + `test_vocabulary_drill_levels.py`；`_build_recognition_item`/`shuffle_options` 无外部调用方。风险等级低，无需用户确认。

## 遗留

- 无新遗留。题型轮换（按出现次序选英→中/中→英/听音，现为按 mastery 随机）**属 S5**，未在本票动；S5 改 `practice_service` 题型分支时与本票同文件，串行已满足（S4 已合）。
- mypy 干净树 77 errors 为既有基线漂移（见 state.md / S7a handoff），本票两文件 0 新增，基线决策仍待单独一轮。
