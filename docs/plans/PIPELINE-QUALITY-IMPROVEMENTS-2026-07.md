# 视频管线质量门改进 - 执行计划

> 来源:对 6 条改进建议的审核 + 落地方案。审核结论见各阶段"前提纠错"。

## 总体结论

六条建议方向都成立,但落地需修正:
1. **改进 4(Watchdog)前提错误**:tail(翻译/下载/转码)运行在 `status=ready_subtitles` 下,不是 `processing`。原方案"覆盖所有 `status=processing`"抓不到真正的卡死点。
2. **改进 1(翻译阻塞)对标未点明**:转录质量门已是阻塞的(`internal.py:133-140`),只有翻译质量门是 warn-only。改进 1 是"让翻译对齐转录已有行为"。
3. **改进 1/5/6 都依赖改进 2(持久化)先落地**,排序应调整。

## 执行顺序与依赖

```
阶段 0  改进 2  质量报告持久化          (地基,先做)
阶段 1  改进 4  全管线 Watchdog(重做)  (用户可见故障,可与阶段0并行)
阶段 2  改进 1  翻译质量门阻塞+补救     (依赖阶段 0)
阶段 3  改进 3  下载失败补下载          (需阶段 0 数据校准,观察1-2周)
阶段 4  改进 5  质量告警通知            (依赖阶段 0/2)
阶段 5  改进 6  人工抽检流程            (依赖阶段 0)
```

所有新 migration 的 `down_revision` 指向当前 head `e3f4g5h6i7j8`。

---

## 阶段 0:质量报告持久化(改进 2)

### 目标
转录 + 翻译两侧质量指标落库,供后续阻塞决策、告警、抽检查询。

### 表结构
```python
class VideoQualityReport(Base):
    __tablename__ = "video_quality_reports"
    id: str(36) PK
    video_id: FK(videos.id, CASCADE) index
    stage: String(20)  # "transcription" | "translation"
    passed: Boolean
    coverage_ratio: Float nullable  # 翻译侧;转录侧 NULL
    metrics: JSON  # 翻译:short_ratio/mixed_ratio/length_outlier_count/translated_count/total_subtitles
                   # 转录:checks[]/audio_duration
    issues: JSON  # 字符串列表
    segment_count: Integer nullable  # 转录侧
    created_at: DateTime(tz)
    Index("ix_vqr_video_stage", video_id, stage)
```
- 追加写(每次重触发留一行),不 update,便于看历史趋势。

### 改动清单
- `backend/app/models/video_quality_report.py` 新建
- `backend/app/models/__init__.py` 注册
- `backend/migrations/versions/xxxx_add_video_quality_reports.py` 新建表
- `backend/app/services/transcription/quality.py` 加 `persist_quality_report`
- `backend/app/services/translation/quality.py` 加 `persist_quality_report`
- `backend/app/api/v1/internal.py:131` 转录回调持久化(成功+失败两分支)
- `backend/app/tasks/video_processing.py:83` 翻译后持久化;`_translate_subtitles` 返回 `(results, report)`

### 实施要点
1. `persist_quality_report(db, video_id, report)` async,内部 `db.add()` + `await db.flush()`,**不 commit**,由调用方事务统一提交。
2. 持久化包 try/except,失败只 warning,绝不 raise(对齐 prewarm/difficulty 的 best-effort 风格)。
3. 转录失败分支(`internal.py:133-140`)也要写报告(让管理员看到失败原因)。
4. `_translate_subtitles` 改返回 `(results, quality_report)`,`finalize_video:450` 拿到后在 `:456 commit` 前写库。

### 验证
- 单测:`test_quality_safety_net.py` 加用例,跑翻译/转录质量检查后断言 `video_quality_reports` 有对应行。
- 手动:`SELECT stage, passed, metrics->>'coverage_ratio' FROM video_quality_reports WHERE video_id=...`

---

## 阶段 1:全管线 Watchdog(改进 4,重做)

### 目标
覆盖 tail 卡死(翻译/下载/转码),不再只盯 transcribing。

### 前提纠错(关键)
现有 watchdog 查 `status==processing AND step==transcribing`,**抓不到 tail 卡死**。tail 期间 status 是 `ready_subtitles`(`internal.py:161` 设,`finalize_video` 一直不改直到 `:582` 才设 `ready`)。重写查询:
```python
cutoff = now - timedelta(seconds=step_timeout)
stuck = select(Video).where(
    Video.status.in_([VideoStatus.processing, VideoStatus.ready_subtitles]),
    Video.step_started_at.is_not(None),
    Video.step_started_at < cutoff,
)
```

### 改动清单
- `video.py` 加 `step_started_at` 字段
- migration 加列
- `pipeline_helpers.py` 加 `touch_step_started_at(video)` helper
- `video_processing.py` 每个 step 边界调用 `touch`;重写 `watchdog_stale_transcriptions`
- `celery_app.py` beat(可选,沿用 600s)

### step_started_at 写入
`finalize_video` 每个 `current_step = "xxx"` 赋值后调用一次(translating/annotating/prewarm_notes/downloading/transcoding)。head 任务 extracting/transcribing 同样。

### 每步超时阈值(放 settings)
| 步骤 | 超时 |
|---|---|
| extracting | 10 min |
| transcribing | 复用 `video_transcribe_timeout` |
| translating | 30 min |
| annotating | 5 min |
| prewarm_notes | 30 min |
| downloading | 60 min |
| transcoding | 30 min |
watchdog 按 `processing_step` 查对应阈值,无映射用兜底 60 min。

### 风险
- **重试误杀**:`finalize_video` 有 `max_retries=3 + self.retry()`。重试退避期间 `step_started_at` 不更新。对策:watchdog 标记前查 Redis lock `video:processing:{id}` 是否存在,存在说明 worker 还活着在退避,跳过。
- **legacy NULL 行**:沿用 `or_(processing_started_at < cutoff, created_at < cutoff)` 兜底。
- **finalize 成功要清空** `step_started_at = None`(`:582 ready` 处)。

### 验证
- 单测:造 `status=ready_subtitles, step=translating, step_started_at=2h前` 的视频,断言被标 error;lock 持有的不被标。

---

## 阶段 2:翻译质量门阻塞 + 补救路径(改进 1)

### 目标
覆盖率 <60% 阻塞;60-80% 中间态;**必须配可靠的补救路径**(换引擎重触发),否则只是挪锅。

### 字段(不加新 VideoStatus 枚举)
```python
quality_flag: String(20) nullable
# None=正常 | "quality_warning"(60-80%,仍 ready) | "quality_blocked"(<60%, error)
```

### 改动清单
- `video.py` 加 `quality_flag` 列 + migration
- `video_processing.py` `_translate_subtitles` 返回 report;finalize 按覆盖率决策
- 翻译 engine 选择支持换引擎
- `videos.py` admin retranslate 端点

### 决策逻辑(finalize 翻译步骤后)
```python
if coverage < 0.60:
    video.quality_flag = "quality_blocked"
    raise Exception(f"Translation coverage {coverage:.0%} < 60% - blocked")
elif coverage < 0.80:
    video.quality_flag = "quality_warning"  # 不 raise,继续管线
else:
    video.quality_flag = None
```

### 补救路径(成败关键)
1. admin `POST /admin/{video_id}/retranslate?engine=xxx`:清空 `video:steps:{id}` 的 translating 标记 + 重置 quality_flag + `finalize_video.delay()`。
2. 换引擎:query 参数强制用指定引擎重跑,绕过默认引擎。
3. kill switch:`settings.translation_quality_block_enabled`(默认 True)。引擎大故障时一键关阻塞,回退 warn-only。

### 风险
- **同引擎重跑复现失败**:本条最大风险。换引擎是必做不是可选。
- **阈值可调**:0.60/0.80 放 settings,别硬编码。

### 验证
- 单测:mock 50% 覆盖率 -> error + quality_blocked;mock 70% -> ready + quality_warning。

---

## 阶段 3:下载失败自动补下载(改进 3)

### 前置条件
**先用阶段 0 持久化数据观察 1-2 周**,确认临时性失败占比。若 90% 是永久失败(下架/地区限制),本阶段收益低可跳过。

### 字段
```python
download_failed_at: DateTime(tz) nullable
download_fail_count: Integer default 0
```

### beat task
```python
@celery_app.task(name="app.tasks.video_processing.retry_failed_downloads")
def retry_failed_downloads():
    # 查 status=ready、video_source=imported、video_url_720p IS NULL、
    # download_failed_at IS NOT NULL、download_fail_count < 3
    # 每条:先 ensure_cookies_for_pipeline 刷新 cookie,再 localize_video.delay(force=False)
```
**关键复用**:`localize_video`(`video_processing.py:900`)已是下载+转码独立 task。beat 只负责选片+触发,不重复下载逻辑。

### cookie 刷新(建议漏掉的关键点)
retry 前必须重新 `ensure_cookies_for_pipeline`(`video_processing.py:202`)--cookie 过期是持续性失败主因,不刷新必然复现。

### 3-strike + force 参数
- `download_fail_count >= 3` 不再重试。
- `localize_video` 加 `force: bool = False`:beat 传 False(受 strike 限制),admin 手动传 True。

### beat 频率
`0 17 * * *` UTC(北京凌晨1点)每天1次。单视频最多重试 3 天。

### 验证
- 单测:`count=3` 不被选;`count=2` 被选并触发 localize、cookie 刷新被调用。

---

## 阶段 4:质量告警通知(改进 5)

### 目标
质量门失败时推送给所有管理员,而非只写日志。

### 改动清单
- `notification.py` `NotificationType` 加 `quality_alert`(String(30) 列,无需 migration)
- `notification_service.py` 加 `notify_admins(db, title, message, related_url)`
- `video_processing.py` 翻译 blocked 分支调用
- `internal.py` 转录失败分支调用

### notify_admins
```python
async def notify_admins(db, title, message, related_url=None):
    admins = (await db.scalars(select(User).where(User.role == RoleType.admin))).all()
    for a in admins:
        await create_notification(user_id=a.id, type="quality_alert",
            title=title, message=message, db=db, related_url=related_url)
```
去重已内置(`create_notification` 的 `(user_id,type,related_url,is_read=False)` 去重)。`related_url=/admin/videos/{video_id}` 保证去重键稳定。quality_warning 不发通知(避免噪音)。

### 验证
- 单测:mock 翻译失败,断言每个 admin 有 1 条 quality_alert;同视频二次失败不产生新行。

---

## 阶段 5:人工抽检流程(改进 6)

### 目标
admin 视频列表加质量列 + 待审核筛选 + 详情页质量报告 + 一键重触发。

### 改动清单
- `videos.py` `list_admin_videos` 加 `quality` 筛选;`_list_all_videos` 支持
- `videos.py` 加 `GET /admin/{video_id}/quality-reports`
- `videos.py` 加 `POST /admin/{video_id}/retranslate`(阶段2后端,此处前端接入)
- `schemas/video.py` `VideoAdminResponse` 加 `quality_flag`、`latest_translation_coverage`
- 前端 admin 列表/详情展示

### 筛选扩展
现有参数 `status/is_official/is_featured/review_status/keyword`。新增:
```python
quality: str | None = Query(None)  # quality_warning|quality_blocked|low_coverage
```
- `low_coverage` -> 关联 `video_quality_reports` 最新翻译行 `coverage_ratio < 0.9`(子查询)

### 质量分列
- `quality_flag` 直接读 Video 列
- `latest_translation_coverage` 子查询最新翻译 report
- 前端:🟢 正常 / 🟡 warning / 🔴 blocked

### 风险
- 子查询性能:`low_coverage` 走 `video_quality_reports` 子查询。`ix_vqr_video_stage` 覆盖 `(video_id, stage)`,按覆盖率筛全表需 `Index("ix_vqr_stage_coverage", stage, coverage_ratio)`,数据量大时再加。

### 验证
- API 测试:`GET /admin?quality=quality_blocked` 只返回阻塞视频;`GET /admin/{id}/quality-reports` 返回历史。

---

## 依赖关系图

```
阶段 0 (持久化) ─┬─-> 阶段 2 (翻译阻塞)
                 ├─-> 阶段 4 (告警)
                 └─-> 阶段 5 (抽检)
阶段 1 (Watchdog) ── 独立,可并行
阶段 2 (翻译阻塞) ─-> 阶段 4 (告警触发点) + 阶段 5 (retranslate)
阶段 3 (下载重试) ── 依赖阶段 0 数据校准
```

**执行节奏:** 阶段 0 + 阶段 1 并行;阶段 0 完成后上阶段 2;阶段 3 先观察数据;阶段 4/5 在阶段 2 后端完成后接入。
