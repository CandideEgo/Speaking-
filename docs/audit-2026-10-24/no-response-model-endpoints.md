# 尚无 response_model 的数据端点清单（BE-07 跟踪）

生成方式：加载 `create_app()` 后遍历 `APIRoute`，排除 `/health`、`/metrics`、`/media`、
OpenAPI 文档与 Prometheus 路径、已退役固定返回 410 的兼容壳（heatmap/weekly-reports、vocab-sets celebrate、shadowing），
以及二进制下载端点（`/users/me/export/{id}/download`、`/exam-pdfs/{slug}/file`），
统计 `response_model is None` 的 JSON 数据端点。

生成日期：2026-10-24。当前计数：36。

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

## channels

- `POST` `/api/v1/channels/admin`
- `GET` `/api/v1/channels/admin/all`
- `PATCH` `/api/v1/channels/admin/{channel_id}`
- `DELETE` `/api/v1/channels/admin/{channel_id}`
- `POST` `/api/v1/channels/admin/{channel_id}/videos`

## exam-pdfs

- `GET` `/api/v1/exam-pdfs`

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

## redeem-codes

- `GET` `/api/v1/redeem-codes`
- `GET` `/api/v1/redeem-codes/export`
- `GET` `/api/v1/redeem-codes/summary`

## videos

- `GET` `/api/v1/videos/admin/pending-count`
- `GET` `/api/v1/videos/admin/takedown-suggestions`
- `DELETE` `/api/v1/videos/admin/{video_id}`
- `GET` `/api/v1/videos/admin/{video_id}/quality-reports`
- `GET` `/api/v1/videos/admin/{video_id}/subtitles/revisions`
- `POST` `/api/v1/videos/admin/{video_id}/subtitles/word-levels/recompute`
- `GET` `/api/v1/videos/admin/{video_id}/subtitles/{subtitle_id}/revisions`
- `GET` `/api/v1/videos/{video_id}/shadowing-sentences`
- `POST` `/api/v1/videos/{video_id}/unlock`
