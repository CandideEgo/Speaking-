---
title: 测试与服务端「今天」不同基准导致只在凌晨失败的 flake
tags: [backend, bug, data]
status: active
confidence: verified
related_code: [pytest-suite]
related: [wiki/guides/testing.md]
created: 2026-09-27
updated: 2026-09-28
---

# 测试与服务端「今天」不同基准 → 只在 00:00–08:00（北京）失败的 flake

## Problem

`test_study_sessions.py::test_a_round_from_a_previous_day_is_not_resumed` 在 09-25 白天全量绿，
09-27 凌晨 02:19 同一份代码失败；`git stash` 后干净树同样失败，与改动无关。

## Cause

两条「今天」的计算基准不同：

- 服务端 `get_user_local_date`（`learning_event_service.py`）在用户**没有** `reminder_timezone`
  时**回退 UTC 日期**；
- 测试回填轮次用的是宿主机本地 `date.today() - 1day`（UTC+8）。

北京时间 00:00–08:00 之间，UTC 的「今天」= 本地的「昨天」，于是被回退一天的数据在服务端眼里
仍然是「今天」，断言 `session is None` 失败。白天跑永不复现——典型的按墙钟隐藏的耦合。

## Solution

测试回填锚定到与服务端**同一基准**：`datetime.now(UTC).date() - timedelta(days=1)`。

## Future Prevention

- 凡测试要构造「昨天/过期」数据，先查服务端今天是怎么算的（`get_user_local_date` 有 timezone
  回退链），用同一函数/同一时区，不要用宿主机墙钟。
- 回退量 ≥ 2 天的测试（如 30 天清理）不受 8 小时偏移影响，但统一写法可防未来时区字段变化。
- **产品层疑问未解决**（遗留给 owner）：无 timezone 的用户在凌晨 0–8 点会拿到 UTC 日期，其
  「今日训练」按 UTC 翻天——这是 `get_user_local_date` 回退到 UTC 的行为，改回退基准属行为
  变更，需要 DEC 条目，不要顺手改。
