---
title: 错误与清理路径的三个隐形失效模式（回显非有限浮点 / fail-open 的漏洞 / 清理跑两次）
tags: [backend, bug, anti-pattern]
status: active
confidence: verified
related_code: [core-cache, api-v1, error-envelope, pytest-suite]
related: [wiki/problems/cache-invalidation-and-media-gate-blindspots.md, wiki/problems/shared-row-locks-and-nested-commits.md]
created: 2026-09-25
updated: 2026-09-28
---

# 错误与清理路径的三个隐形失效模式

一次审计修复里踩中三条，共同点是**测试覆盖最少的那条路径，失败时后果最重**：本该 4xx 的请求变成 500，或一条消息静默丢掉——正常流量下都不会报错。

## 1. 回显客户端输入的错误响应，被那个输入本身弄崩

**Problem**: body 里发裸 `NaN` token（`{"position_seconds": NaN}`）应得 422，实得 **500 且无可用信息**。

**Cause**: 一条四层链，每层单看都合理：
1. `NaN` 不是合法 JSON（RFC 8259），但 stdlib `json.loads` **接受**裸 token，于是它作为 `float('nan')` 正常进入 Pydantic；
2. Pydantic 校验失败，`errors()` 的 `input` **原样回显这个值** → `{'input': nan}`；
3. 422 handler 把 errors 放进 envelope（`jsonable_encoder` 对 float 原样放行）；
4. Starlette 用 `json.dumps(..., allow_nan=False)` 渲染 → `ValueError: ... not JSON compliant: nan`。

即**「报告这个输入有问题」的路径被这个输入本身打挂**。且不限 float 字段：字符串/整数/Literal 字段收到裸 `NaN` 一样命中。

**Solution**: `app/core/errors.py::json_safe_non_finite()` 递归把非有限浮点换成文本（`'nan'`/`'inf'`/`'-inf'`），422 handler 里应用一次。**换文本而非丢弃**，因为三者区别对定位有用，且它们本就没有对应的 JSON number。

**Future Prevention**:
- 凡**回显客户端输入**的响应路径，都要过一遍「这个值能被 `json.dumps(allow_nan=False)` 渲染吗」。`allow_nan=False` 是 Starlette 默认，不是选项。
- 只给 `float` 字段加 `allow_inf_nan=False` 不够——**报错本身**会带出 `nan`，错误路径要当成一条独立数据通路看。
- 放弃的替代方案：在 JSON **解析层**拒绝该 token（语义最正）。放弃因它把精确的「position_seconds: 应为有限数」降级成笼统的「body 非法」，且只覆盖解析这一路。

## 2. 声明 fail-open 的模块里，那一个没被包住的步骤

**Problem**: `core/cache.py` 的 docstring 声明「所有函数 fail-open」。但 `cache_set_json` 的 `json.dumps` 在 `try` **之外**：value 里只要有 JSON 无类型的对象（`set`、任意对象、循环引用），`TypeError`/`ValueError` 直接穿过函数——**查询成功、只是缓存写失败**的请求变成 500。

**Cause**: fail-open 被当成「给 Redis 调用包一层 try」的同义词，抓手其实是**该函数里每一处可能抛错的步骤**。序列化最容易漏——它不碰 Redis，写起来不像外部依赖。它有两条调用路径（直接调用 + `@cached` 装饰器尾部），两条都会抛出去。

**Solution**: 守卫放进**两条路径共同经过的那个函数**（`cache_set_json` 自身），而不是在每个调用点各包一次；装饰器那份因此自动覆盖。

**Future Prevention**:
- 模块一旦声明 fail-open，就逐个列出可能抛错的步骤（序列化/编码/类型转换常漏），确认每个都在契约内。
- 同一契约缺口有 N 条调用路径时，**在共同的被调函数里关一次**；在 N 个调用点各关一次，会随调用点增长而复现。

## 3. 清理路径会跑两次，而它假设自己只跑一次

**Problem**: 广播通知时，同一 socket 的清理被**两方**触发——`send_to_user` 的清理趟与端点的退出分支（现在是 `finally`）。`disconnect()` 用 `list.remove()`，第二次抛 `ValueError`，端点的最后一跳把它带出请求。

同一段的另一方向：`send_to_user` 遍历的是**活列表**（`get()` 返回引用），循环体 `await send_json()` 是让出点。期间任何移除都让列表左移，迭代器**跳过**顶上来的 socket——**活着的连接静默收不到消息**，无处报错（`assert ['a','c'] == ['a','b','c']`）。

**Cause**: 两处都把清理当作「只发生一次、只被我触碰」。并发下的事实是：同一对象有两个清理者，且 `await` 之间集合会被别人改。

**Solution**: 遍历快照 `list(...)`；`disconnect` 幂等（成员判断后再 `remove`，空了再删 key）。

**Future Prevention**:
- 「遍历 + 可能 `await`」的共享集合，遍历前先快照。`await` 是让出点，不是普通语句。
- 清理/注销函数默认幂等：调用方数量由并发决定，不由设计决定。
- 这类缺陷不报错——**静默丢消息**与**多抛一个 ValueError** 是同一段代码的两个症状，测试要能各自逼红。

## 共同形态

三条都在**没人测的那条路径**上：错误响应、fail-open 兜底、清理/注销。失败方式都是**升级**而非降级。检查清单：动主路径时问一句「它的错误分支和清理分支，和它一样被测过吗」。

## 已知残留（未修）

非有限浮点一旦落库，**读路径仍会崩**：写入侧只有 `SaveProgressRequest.position_seconds` 带了 `allow_inf_nan=False`，但（a）修复前可能已落库；（b）不经 Pydantic 的响应（如 `GET /learning/progress/{video_id}` 直接返回裸 dict）会把 `nan` 原样交给 `json.dumps(allow_nan=False)`。反过来，无 schema 的 JSON payload（行为事件的 `event_payload`）**存不进去**：`NaN` 过得了 Pydantic 的字节数校验，写库时被 Postgres 的 `json` 列拒绝（`invalid input syntax for type json`，整批事件 500）。彻底关闭需读侧统一清洗或解析层拒绝。
