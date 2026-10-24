# 尚无 response_model 的数据端点清单（BE-07 跟踪）

生成方式：加载 `create_app()` 后遍历 `APIRoute`，排除 `/health`、`/metrics`、`/media`、
OpenAPI 文档与 Prometheus 路径，以及已退役、固定返回 410 的 heatmap/weekly-reports 兼容壳，
统计 `response_model is None` 的 JSON 数据端点。

生成日期：2026-10-24。当前计数：80。

> 这是剩余工作清单，不代表这些端点会返回错误；它们只是没有 OpenAPI 字段契约。
> 外部支付/转写回调（`/internal/transcription/callback`、`/payments/callback/*`、`/payments/jinshuju/webhook`）
> 返回的是给上游的简单确认，补 schema 的优先级最低。

## admin

- `GET` `/api/v1/admin/admins`
- `GET` `/api/v1/admin/redemptions/summary`
- `GET` `/api/v1/admin/settings`
- `PUT` `/api/v1/admin/settings`
- `GET` `/api/v1/admin/stats`
- `PATCH` `/api/v1/admin/users/{user_id}/ban`
- `PATCH` `/api/v1/admin/users/{user_id}/plan`
- `PATCH` `/api/v1/admin/users/{user_id}/role`
- `GET` `/api/v1/admin/worker-status`

## browse

- `GET` `/api/v1/browse/categories`
- `GET` `/api/v1/browse/featured`

## channels

- `POST` `/api/v1/channels/admin`
- `GET` `/api/v1/channels/admin/all`
- `PATCH` `/api/v1/channels/admin/{channel_id}`
- `DELETE` `/api/v1/channels/admin/{channel_id}`
- `POST` `/api/v1/channels/admin/{channel_id}/videos`

## discovery

- `GET` `/api/v1/discovery/daily`
- `POST` `/api/v1/discovery/daily/start`
- `GET` `/api/v1/discovery/dictionary`
- `GET` `/api/v1/discovery/learning-metadata`
- `GET` `/api/v1/discovery/practice-summary`
- `GET` `/api/v1/discovery/search`
- `POST` `/api/v1/discovery/sets`
- `PATCH` `/api/v1/discovery/sets/{set_id}`
- `DELETE` `/api/v1/discovery/sets/{set_id}`
- `POST` `/api/v1/discovery/sets/{set_id}/words`
- `DELETE` `/api/v1/discovery/sets/{set_id}/words/{set_word_id}`

## exam-pdfs

- `GET` `/api/v1/exam-pdfs`
- `GET` `/api/v1/exam-pdfs/{slug}/file`

## internal

- `POST` `/api/v1/internal/transcription/callback`

## notes

- `GET` `/api/v1/notes`

## payments

- `POST` `/api/v1/payments/callback/alipay`
- `POST` `/api/v1/payments/callback/wechat`
- `POST` `/api/v1/payments/create-order`
- `POST` `/api/v1/payments/jinshuju/webhook`
- `POST` `/api/v1/payments/mock-pay`
- `GET` `/api/v1/payments/order/{order_id}`
- `GET` `/api/v1/payments/status`

## presence

- `POST` `/api/v1/presence/heartbeat`

## recommendations

- `GET` `/api/v1/recommendations/category/{tag}`
- `GET` `/api/v1/recommendations/home`

## redeem-codes

- `GET` `/api/v1/redeem-codes`
- `GET` `/api/v1/redeem-codes/export`
- `GET` `/api/v1/redeem-codes/summary`

## shadowing

- `GET` `/api/v1/shadowing/attempts`
- `POST` `/api/v1/shadowing/attempts`
- `PATCH` `/api/v1/shadowing/attempts/{attempt_id}`
- `DELETE` `/api/v1/shadowing/attempts/{attempt_id}`
- `GET` `/api/v1/shadowing/stats`

## users

- `GET` `/api/v1/users/me/export/{task_id}/download`
- `GET` `/api/v1/users/me/overview`

## videos

- `GET` `/api/v1/videos/admin/pending-count`
- `GET` `/api/v1/videos/admin/takedown-suggestions`
- `DELETE` `/api/v1/videos/admin/{video_id}`
- `GET` `/api/v1/videos/admin/{video_id}/quality-reports`
- `GET` `/api/v1/videos/admin/{video_id}/subtitles/revisions`
- `POST` `/api/v1/videos/admin/{video_id}/subtitles/word-levels/recompute`
- `GET` `/api/v1/videos/admin/{video_id}/subtitles/{subtitle_id}/revisions`
- `GET` `/api/v1/videos/search/hot`
- `GET` `/api/v1/videos/search/suggest`
- `GET` `/api/v1/videos/unlocked-ids`
- `POST` `/api/v1/videos/{video_id}/like`
- `GET` `/api/v1/videos/{video_id}/like-status`
- `GET` `/api/v1/videos/{video_id}/shadowing-sentences`
- `POST` `/api/v1/videos/{video_id}/unlock`

## vocab-sets

- `POST` `/api/v1/vocab-sets`
- `GET` `/api/v1/vocab-sets`
- `GET` `/api/v1/vocab-sets/{set_id}`
- `POST` `/api/v1/vocab-sets/{set_id}/celebrate`
- `GET` `/api/v1/vocab-sets/{set_id}/sieve`
- `POST` `/api/v1/vocab-sets/{set_id}/words/{set_word_id}/learned`
- `POST` `/api/v1/vocab-sets/{set_id}/words/{set_word_id}/sieve`
- `POST` `/api/v1/vocab-sets/{set_id}/words/{set_word_id}/unmark`

## vocabulary

- `POST` `/api/v1/vocabulary`
- `GET` `/api/v1/vocabulary/daily-session`
- `GET` `/api/v1/vocabulary/practice`
- `GET` `/api/v1/vocabulary/words`
- `DELETE` `/api/v1/vocabulary/{word_id}`
- `POST` `/api/v1/vocabulary/{word_id}/mastered`
- `POST` `/api/v1/vocabulary/{word_id}/review`
