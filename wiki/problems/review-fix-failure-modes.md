---
title: 审查修复中的三个可复用失败模式（Dypnsapi 依赖漂移 / SQLite BigInteger PK / 死依赖误判）
tags: [backend, infrastructure, bug]
status: active
confidence: verified
related_code: [sms_service, models/behavior, package.json]
related: [docs/progress/REVIEW-2026-08-14.md]
created: 2026-08-14
updated: 2026-08-14
---

# 审查修复中的三个可复用失败模式

## 1. SDK 迁移只改代码不改依赖清单（生产首发即崩）

**Problem**: SMS 认证切换到阿里云 Dypnsapi 后，生产 send-code 502（state.md 已知问题，根因悬置数日）。
**Cause**: 代码（`sms_service.py` 惰性 import `alibabacloud_dypnsapi20170525`）与依赖清单分叉：新 SDK 只进了 `requirements-cloud.txt`，API 服务器镜像（`backend/Dockerfile` 只装 `requirements.txt`）缺包。惰性 import 使缺失不在启动时报错，而在首次发码时抛 ModuleNotFoundError；CI 因测试 stub 而绿。
**Solution**: requirements.txt 换新 SDK、删旧 dysmsapi、补 `test_dypnsapi_sdk_importable` import 冒烟测试。
**Future Prevention**: 切换外部 SDK 时：① 同步所有 requirements 文件（runtime/cloud）；② CI 加 import 冒烟测试（惰性 import 的包必须在 CI 验证可达）；③ 惰性 import 本身是风险放大器——宁可启动时快速失败。

## 2. SQLite BigInteger 主键不自增（测试与生产的语义差异）

**Problem**: 行为事件 API 测试报 `NOT NULL constraint failed: behavior_events.id`。
**Cause**: SQLAlchemy `BigInteger` 主键在 SQLite 映射为 `BIGINT PRIMARY KEY`，而 SQLite 只有 `INTEGER PRIMARY KEY` 才是 rowid 别名（自增）；生产 Postgres 正常。此前 `test_recommendations.py` 用「手工分配 id」绕开，掩盖了该问题。
**Solution**: `BigInteger().with_variant(Integer, "sqlite")` —— SQLite 用 Integer（自增），Postgres 保持 BIGINT。
**Future Prevention**: 任何 BigInteger 主键模型都要考虑 with_variant；遇到「SQLite 插入主键失败」优先想到此模式。

## 3. 「未使用的直接依赖」删除前必须验证传递依赖链

**Problem**: 审查判定 `react-is` 是死依赖并移除，导致 `next build` 失败（`Can't resolve 'react-is'`）。
**Cause**: 应用源码确实不 import react-is，但 recharts → react-redux 依赖链需要它；此前它作为 package.json 直接依赖被提升（hoisted）到 node_modules 顶层，删除后 npm 重新解析/prune 使 recharts 找不到。
**Solution**: 恢复 `react-is` 直接依赖；修正审查结论。
**Future Prevention**: 「grep 无 import」≠「可删除」——先检查传递依赖（`npm ls react-is`），再动 package.json；删除后必须 `npm ci` + `next build` 双验证。
