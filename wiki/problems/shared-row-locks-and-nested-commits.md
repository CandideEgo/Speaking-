---
title: 行锁的三个可复用陷阱（写者不共用锁 / SQLAlchemy 只警告不报错 / 临界区内的 commit 提前释放锁）
tags: [backend, database, bug, anti-pattern]
status: active
confidence: verified
related_code: [api-v1, backend-services, models-behavior, pytest-suite]
related: [wiki/problems/cache-invalidation-and-media-gate-blindspots.md, .agent/decisions.md]
created: 2026-09-25
updated: 2026-09-28
---

# 行锁的三个可复用陷阱

三个都在同一次审计修复里踩中：`favorites` 的笔记、`catalog` 的 promote、以及并发用例本身。
共同点——**「加了锁」不等于「不会撞」，锁的正确性取决于谁和谁共用它。**

## 1. 同一行的两个写者必须共用同一把锁

**Problem**: `PUT /videos/{id}/note`（`upsert_note`）与 `DELETE /videos/{id}/note`（`delete_note`）都在写 `user_notes` 的同一行。两者都"加了锁"——`upsert_note` 锁 **video 行**，`delete_note` 锁 **note 行**——但两把锁互不排斥。并发时 PUT 读到已存在的笔记后，DELETE 先提交，PUT 的 UPDATE 命中 0 行 → `StaleDataError` → 500；而在给 `delete_note` 加锁之前，同一交错是 **静默丢写**（DELETE 200、PUT 200，用户刚打的字消失）。修法：`delete_note` 也先取 video 行锁（**不做存在性校验**，保留「未知视频 → 200 空笔记」的既有契约），锁顺序统一为 `video → 子行`，与 `add_favorite`/`remove_favorite`/`upsert_note` 一致，因此不构成死锁环。

**Cause**: 锁的语义是「**这一行**由谁保护」，而不是「这个函数要不要加锁」。`videos` 行是这两个端点共同覆盖的父行，也是唯一能把它们排成一队的对象。

**Solution**: 新增任何对「已有写路径覆盖的行」的写操作前，先 grep 同一表/同一行的所有写者，让它们取**同一把**锁；锁顺序在仓内统一（父行 → 子行）。

**Future Prevention**: review 时看到「这里加了 FOR UPDATE」不要就此放过——要问「另一个写者拿的是不是同一把」。两个写者拿不同的锁，等于都没拿。

## 2. SQLAlchemy 的零行命中：UPDATE 抛错，DELETE 只警告

**Problem**: 复现「两个并发 DELETE」时，被判定为 500 的缺陷**并没有出现**——两个请求都是 200，只有一个 `SAWarning`。

**Cause**: `user_notes` 没有 `version_id_col`，SQLAlchemy 在 `need_version_id` 为假时把行数不符降级为**警告**：`DELETE statement on table 'user_notes' expected to delete 1 row(s); 0 were matched. … set confirm_deleted_rows=False`。真正抛 `StaleDataError` 的是 **UPDATE 侧**（`expected to update 1 row(s); 0 were matched`）——也就是「DELETE 与 PUT 相撞」的那条路径。

**Solution**: 别按"别人给的报错文本"去猜是哪两个操作相撞：报错里的 `UPDATE`/`DELETE` 就是线索。并发用例要么断言真实的失败响应，要么把"零行命中"这种被降级的症状显式升级成断言（`warnings.catch_warnings(record=True)` 里断言零行警告为空）。

**Future Prevention**:
- SQLite 静默忽略 `with_for_update()`，并发正确性**只能在真 Postgres 上验证**（`integration` 标记 + `PG_TEST_URL`）。
- 自然调度下这类竞态常常不触发：同一条用例未加时序控制时 25/25 全绿，刻意安排交错后 5/5 失败。**并发用例必须能证明自己能红**（把锁去掉要红），否则它只是装饰。
- 症状被降级成警告的地方（fail-open、`except: pass`、只警告不抛），测试要主动把警告断言成失败。

## 3. 临界区里调用会自行 commit 的共享函数 = 锁提前释放

**Problem**: `promote_item` 取条目行锁后调用 `seed_video`，而后者内部 `commit_refresh(db, video)` 会**提交整个事务并释放锁**，之后才轮到 `promote_item` 写 `promoted_video_id`。于是第二个并发请求在锁已释放、`promoted_video_id` 仍为 NULL 的窗口里进来，又播了一次流水线（第二条 official `Video` + 第二次 GPU 任务，两个请求都 200）。实测：加锁后该窗口仍 4/4 复现「两次 seed」。

**Cause**: 行锁的生命周期是**事务**，不是函数。任何在临界区内被调用的共享函数一旦 commit，锁就没了——而调用方通常看不出来（`seed_video` 的 docstring 只说它会创建并派发）。

**Solution**: 把复用的判据建立在「**该事务已经提交的数据**」上，而不是建立在「调用方准备稍后写入的字段」上。`seed_video` 提交 video 行与释放锁是**同一个事务、原子可见**，所以第二个请求要么阻塞到那一刻、要么在之后到达，两种情况下它都能在 `videos` 表里看到刚插入的 `Video(processing, is_official, source_url=X)`。于是把「有没有在途视频」的判定从 `item.promoted_video_id` 扩展为「该 `source_url` 下任何非 error 的 official Video」，窗口即关闭。偏好顺序（ready/ready_subtitles 优先）保证与 `seed_video` 自身去重的结果一致。

**Future Prevention**:
- 在加锁事务内调用任何可能 `commit` 的共享函数（seed / save / 各种 `*_service`）时，**必须假设锁会在此提前释放**，并据此重排"判据从哪读"。
- 同上一条的反面：想让锁生效，判据就要读**已提交**的数据（另一张表、或同一个 commit 里的行），不要读本事务尚未写出的字段。
- 这类"半关闭"的窗口最容易被误判为已修（加锁后单测全绿、并发用例用不提交的 stub 也全绿）。判据是：**用行为逼真的 stub（会真的 INSERT + commit）能否复现**。

## 已知残留（未修，需先决策）

- 两个**不同** catalog 条目共享同一 `source_url` 并发 promote，仍会各播一次（条目行锁不互斥，URL 级回收是普通读）。彻底关闭需要 `videos(source_url, is_official)` 处于在途状态的**部分唯一索引** + `IntegrityError → 复用`，或 URL 级 advisory lock——属 schema 决策，未做。
- `catalog_service.mark_item` 仍是无锁读；`PATCH` 落在 promote 的在途窗口里可能被覆盖（丢策展状态，不会产生重复视频）。
