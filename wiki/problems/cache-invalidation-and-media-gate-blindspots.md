---
title: 缓存失效与媒体门控的两个隐形失效模式（fail-open 吞异常 / 门控靠文件名正则）
tags: [backend, infrastructure, security, bug]
status: active
confidence: verified
related_code: [core-cache, api-media, video-service, tests-conftest]
related: [docs/adr/0020-storage-modes-and-takedown.md]
created: 2026-09-19
updated: 2026-09-22
---

# 缓存失效与媒体门控的两个隐形失效模式

两个都在实现「内容下架」时暴露：表面测试全绿，实际保护是空的。

## 1. fail-open 的缓存失效会静默失效 —— 测试里尤其危险

**Problem**: 下架视频后断言「feed 里不再出现」失败——视频仍被 `GET /browse/feed` 返回。查询条件已含 `is_published == True`，下架也确实把它置了 False，但列表纹丝不动。

**Cause**: `browse/feed` 走 `@cached(ttl=300)`。`takedown_video` 里调用了 `invalidate_browse_cache()` → `cache_delete(pattern)`，而后者内部是 `try: async for key in r.scan_iter(pattern) ... except Exception: logger.warning(...)`（**fail-open 是刻意的设计**：Redis 故障不能拖垮业务）。测试用的 `_FakeRedis` 只实现了 `get/set/setex/delete/exists/ping/scan/aclose`，**没有 `scan_iter`** → `AttributeError` 被那个 `except Exception` 吞掉 → 失效从未发生 → 断言拿到的是 5 分钟 TTL 的旧快照。

**Solution**: 给 `tests/conftest.py::_FakeRedis` 补 `scan_iter`（返回与 `scan` 同语义的异步生成器）。

**Future Prevention**:
- **fail-open 的副作用是「静默降级」**：任何被 fail-open 包裹的调用路径，在测试替身缺失方法时不会红，只会悄悄地不做。给测试替身补齐接口不是可选项，是覆盖率的必要条件。
- 凡是"写操作后依赖缓存失效才正确"的断言，都要确认失效路径在测试里真的被走到了（可在断言前额外读一次 DB 或直接断言缓存 key 已消失）。
- 反向教训：如果只信 fail-open 的日志，问题会一直藏在 WARNING 级别里。

## 2. `/media` 的发布态/成员门控靠「文件名正则」，命名不符即整段跳过

**Problem**: 冒烟脚本里匿名用户请求媒体返回 **200**（预期 403）——门控完全没生效。

**Cause**: `media.py::serve_media` 的判定链是：

```
m = _VIDEO_FILE_RE.match(full.stem)   # ^(?P<vid>UUID)(?:_raw|_480p|_720p|_1080p)?$
if m is not None:
    ... 发布态门控 + 成员门控 ...
```

**只有文件名以视频 UUID 开头时**才会进入门控分支。冒烟脚本写了 `free-check_720p.mp4` 这种人类可读名，正则不匹配 → 整段 `if` 被跳过 → 直接流式返回文件（只受扩展名白名单约束）。管线产出的文件都是 `{video_id}_720p.mp4`，所以生产路径侥幸安全；但任何新增的命名方案（例如代理播放、外部源缓存、人工放进去的素材）会**静默地处于无门控状态**。

**Solution**: 冒烟脚本改用真实 `{video_id}_720p.mp4` 命名。

**2026-09-22 后续（又一次踩中 + 形态收敛）**：头像上传（`POST /users/me/avatar`）存为
`avatars/{uuid4}.jpg`——子目录 + 裸 UUID 文件名，stem 命中 `_VIDEO_FILE_RE` 后被视频发布态
门控当作管线文件，Video 查无此行 → 上传 200 但图片永久 404（前端回退首字母头像）。
现有测试只断言上传响应、从不 GET 头像 URL，所以直到用户反馈才暴露。修复：门控增加
「仅 media 根目录文件」条件（管线产物恒在根目录，用户内容恒在子目录），子目录文件不再
过门控。教训不变：**测试上传类接口必须连 GET 路径一起验**，否则"半条链路绿"会漏掉这类 bug。

**Future Prevention**:
- **安全门控不应建立在"文件名恰好符合某个正则"的隐含契约上**。此处更稳的形态是白名单之外一律拒绝（默认拒绝），或让门控覆盖"任何指向 `media/` 下视频文件的路径"。
- 引入新的媒体命名/存储方案（见 ADR-0020 的 `proxy` 占位态）时必须回到 `_VIDEO_FILE_RE` 确认新命名会不会绕过门控。
- 冒烟/测试造数据时用真实命名形态（含 UUID），否则测的是"门控被绕过"这条路。
