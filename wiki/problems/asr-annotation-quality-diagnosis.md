# ASR / 标注质量诊断报告 (D3)

> 日期：2026-08-03
> 触发：用户报"字幕识别不对"——good->best、more->mores、out->outing（时态搞错）、"I"->"abiding"（词对齐错）。
> 结论：**当前代码已全部正确处理，无残留 bug，无脏数据**。错误源自已修复的 `ecdict-exchange-lemma-bug`，用户报告的是旧版本现象。

---

## 一、诊断方法

按计划"先诊断定位再修"：跑样本对比 `lookup()` 实际返回 vs 用户预期，并查 ECDICT DB 的 `exchange`/`tag`/`bnc` 字段定位根因。**不盲改代码**。

## 二、根因（已修复）

错误源自 ECDICT `exchange` 字段的两个非正向码被误纳入反向索引：

| code | 含义 | 例子 | 误纳入的后果 |
|---|---|---|---|
| `0` | lemma 反向指针（best 的 `0:good` 表示 best 派生自 good） | `best: 0:good` | `inflected["good"] -> "best"`，点 good 出 best 释义 |
| `1` | 词形类型标记（best 的 `1:t` 标记最高级） | `best: 1:t` | `inflected["t"] -> "best"`，且常见 token "i" 被映射到 "abiding" |

修复（见 memory `ecdict-exchange-lemma-bug` + commit 历史）：`_parse_exchange` 改为**白名单**只接受正向词形码（s/p/d/i/r/t/3/f/b/z），拒绝 0/1 及未知码。`best` 的 `0:good`/`1:t` 不再进索引。

## 三、当前代码验证（2026-08-03）

逐条核对用户报的全部案例，`lookup()` 返回均正确：

| 用户报错 | `lookup(word)` | 是否正确 |
|---|---|---|
| good 变 best | `lookup("good")=None`，`lookup("best")=best(ielts)` | ✅ 点 good 不会出 best |
| more 变 mores | `lookup("more")=None`，`lookup("mores")=mores(gre)` | ✅ 点 more 不会出 mores |
| out 变 outing | `lookup("out")=None`，`lookup("outing")=outing` | ✅ 点 out 不会出 outing |
| I 变 abiding | `lookup("I")=None`（单字母 i 被过滤），`lookup("abiding")=abiding(toefl)` | ✅ 点 I 不会出 abiding |

`annotate_text()` 标注结果也正确——surface key 与字幕文本一致，无误映射：

```
'I want more good food'     -> {'food': [...]}            # more/good 不高亮（正确）
'She is abiding by the rules' -> {'abiding': [...], 'rules': [...]}
'Being more careful'        -> {'being': [...], 'careful': [...]}
```

DB 脏数据检查：全库扫描 `word_levels` 含 `"i"`/`"good"`/`"more"`/`"out"` key 的字幕 = **0 行**。无残留。

## 四、为什么 more/good/out 点击无 ECDICT 释义

这是**预期行为，非 bug**：`more`(bnc=74)、`good`(bnc=73)、`out`(bnc=62) 的 BNC 排名 ≤ `STOPWORD_BNC_RANK=100`，被当作超高频功能词过滤（避免字幕被 the/a/of 这类词刷屏高亮）。`lookup()` 返回 None → 字幕里不高亮（正确）。点击时 `gloss_word` 走 AI fallback（lemma 用 clean 兜底），仍有 AI 语境注释，只是无 ECDICT 静态释义。

用户报"点 more 变 mores"是**旧版本**（code 0/1 未修前）的记忆——当时 `inflected["more"]` 会被 `mores` 的 `0:more` 反向指针错误设为 "more"->"mores"（更准确说是 `0` 码把 mores 的 lemma 指回 more，污染了 more 的查找）。现已修复。

## 五、结论与决策

- **不改代码**：当前 `_parse_exchange` 白名单逻辑正确，用户报的所有案例已覆盖。
- **不改数据**：无脏 `word_levels` 残留。
- **可选后续**（非本轮）：若要 more/good/out 这类超高频词也能点击查 ECDICT 释义，可下调 `STOPWORD_BNC_RANK` 或为它们单独保留词条——但代价是字幕高亮密度上升，需权衡。当前 AI fallback 已保证点击有响应，暂不动。
