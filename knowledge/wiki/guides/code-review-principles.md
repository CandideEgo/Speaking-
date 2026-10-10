---
title: 审查改动时的六个必问
tags: [workflow, anti-pattern, agent]
status: active
confidence: verified
related_code: []
related: [knowledge/wiki/problems/review-fix-failure-modes.md, knowledge/wiki/problems/audit-verification-failure-modes.md]
created: 2026-10-11
updated: 2026-10-11
---

# 审查改动时的六个必问

审一个改动（PR、自审、外部 AI 审查）时按顺序问这六个问题。事后复盘在
[review-fix-failure-modes](../problems/review-fix-failure-modes.md)（被审之后怎么采信）与
[audit-verification-failure-modes](../problems/audit-verification-failure-modes.md)（外部审查怎么求证）；
本篇是事中清单。2026-10 评估外部 AGENTS.md 时从 Kimi Code 仓的审查规则蒸馏，按本仓案例落地。

## 1. 枚举行为变化，不只找 bug

改动前能工作的输入，改动后必须照旧——除非这次改动明确声明了变化。对每个被删除或收窄的
分支、条件、默认值：问「以前谁能走到这里，现在他们去哪」；对每个新条件：问「哪些现有输入
会先撞上它」。改动声称「这条路径没变」但分支条件挪了位，正是要抓的。

**本仓例**：媒体门控靠文件名正则，命名不符即整段跳过（见
[cache-invalidation](../problems/cache-invalidation-and-media-gate-blindspots.md)）——
改这条正则前，先枚举哪些命名从「通过」变成「跳过」。

## 2. 默认值翻转或行为移除：点名损失 + 给逃生口

在旧默认上的人全部受影响。要求三件事：说清用户失去了什么（不只说新默认是什么）；
有配置/开关/环境变量逃生口，或维护者明确签字；有测试钉住旧行为。

**本仓例**：`payments_enabled=False`（INV-008，ICP 合规）与免费化（砍 Pro，见
[FREE-TIER-ASSESSMENT](../../progress/FREE-TIER-ASSESSMENT-2026-09.md)）都走过这个程序。
`.agent/invariants.md` 里的「Accepted cost（照账接受）」是这条的存量形式（如 INV-022）。

## 3. Prompt 文本即行为

改一句 prompt（词注释、翻译、标点恢复、学习计划），就是改所有经它产出的行为。
「没有测试引用这句话」不是没有影响的证据。要求：点名谁会收到这段文本、这句话原来在
强制什么、谁依赖它、现在由什么强制。

**本仓例**：翻译引擎与 prompt 的每个特性都直接改变产出（引擎史见 ADR-0018；质量门禁见
[translation-quality-safety-net](../architecture/translation-quality-safety-net.md)）。

## 4. 契约文件是绊线

本仓被外部消费的：API 端点（前端消费）、DB schema 与迁移、环境变量、`aoci.txt` 条目
（受管理对象的契约）。动它们时，点名消费者是谁、旧客户端怎么继续工作。

**本仓例**：三容器并发迁移撞唯一约束（[deploy-failure-modes](../problems/deploy-failure-modes.md)）——
迁移不是内部实现，是契约变更。

## 5. 移植/重构带上旧路径的功能清单

替换或绕过一条既有路径时，先列旧路径做过什么（认哪些环境变量、有哪些回退、接受哪些输入），
再逐项在新路径里指认它的新家。静默丢一项 = 回归，不是清理。

**本仓例**：Dypnsapi SDK 迁移只改代码不改 requirements
（[review-fix-failure-modes](../problems/review-fix-failure-modes.md) 第 1 条）就是清单漏项。

## 6. 静默失败比崩溃更严重

让产品悄悄忽略配置、悄悄放行/跳过、悄悄丢数据的改动，是最严重的一类发现——用户没有
任何信号可以报告。对照本仓已有的静默失效篇目逐条问「这条失败路径有没有人会发现」：
[silent-composition-failures](../problems/silent-composition-failures.md)、
[cache-invalidation](../problems/cache-invalidation-and-media-gate-blindspots.md)、
[error-path-blindspots](../problems/error-path-blindspots.md)。
