---
title: 审查修复中的四个可复用失败模式（Dypnsapi 依赖漂移 / SQLite BigInteger PK / 死依赖误判 / 外部 AI 审查的论证不可信）
tags: [backend, infrastructure, bug]
status: active
confidence: verified
related_code: [sms-service, models-behavior, frontend-package]
related: [knowledge/progress/REVIEW-2026-08-14.md]
created: 2026-08-14
updated: 2026-09-25
---

# 审查修复中的四个可复用失败模式

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

## 4. 外部 AI 审查：结论可信、论证不可信、严重性最不可信

**Problem**: 2026-09-25 用 AI 全仓审查（alibaba/open-code-review）扫出 6 条 critical + 73 条 high。逐条核实后：**后端 23 条 high 里整条误报 0 条**，但**论证有 9 处被证伪**、严重性判错 9 条（夸大 5、略夸大 3、低估 1）。照着论证去改，会把精力投到不存在的攻击路径上，或按错误修法改出回归。

**Cause**: 模型只看得到当前文件。它不知道全仓没有 cookie 会话（把「GET 改状态」判成 CSRF）、不知道网关是 `client_max_body_size 500m`（把「先全量读入再判大小」判轻）、不知道某个功能已下线或某张表根本没有写入方（把缺失约束判成「能造成重复」）。**跨文件的收敛/放大机制是盲区；死代码与内部 schema 是高发区。**

**Solution**: 分三层采信——**位置与代码事实可信；结论要复核；严重性丢掉自己定**。每条都回代码核一次，并用「先让它红、再让它绿」证明修的是真问题（本次 4 项修复全部带 RED→GREEN 或探针证据）。**必须连论证一起核**，尤其是「谁能利用它」和「影响多大」这两句。

**Future Prevention**:
- 把 AI 审查当**线索生成器**，不当判定器。
- 大仓库按目录切分给预算：一个总预算必然撞顶，而覆盖率会**悄悄**停在 50% 左右（本次实际 203/379 文件）。
- **覆盖率自己算**：`summary.files_reviewed` 是派发数不是完成数，要看会话计数器（selected / completed / failed / reused）。
- 工具给的「建议改法」也要核。本次撞到两条「照做会封死唯一恢复路径」（拒绝 `processing` 会让 `CatalogStatus.error` 的条目永久无法重新 promote，因为 error 从不落库）和一条「patch 只覆盖一半」（`core/cache.py` 的 `json.dumps` 有两处，只包了一处）。
- 命中率规律：**有外部触发面的代码（端点 / 鉴权 / 支付 / 上传 / 缓存键）值得整轮认真核；死代码与内部 schema 的发现先问一句「这条路真的有人在走吗」**。
