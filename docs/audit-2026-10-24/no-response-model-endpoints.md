# 尚无 response_model 的数据端点清单（BE-07 跟踪）

生成方式：加载 `create_app()` 后遍历 `APIRoute`，排除 `/health`、`/metrics`、`/media`、
OpenAPI 文档与 Prometheus 路径、已退役固定返回 410 的兼容壳（heatmap/weekly-reports、vocab-sets celebrate、shadowing），
二进制下载端点（导出下载、exam-pdf 文件），以及 204 无响应体的路由，
统计 `response_model is None` 的 JSON 数据端点。

生成日期：2026-10-24。当前计数：6。

> 这是剩余工作清单，不代表这些端点会返回错误；它们只是没有 OpenAPI 字段契约。
> 外部支付/转写回调（`/internal/transcription/callback`、`/payments/callback/*`、`/payments/jinshuju/webhook`）
> 返回的是给上游的简单确认，补 schema 的优先级最低。

## admin

- `GET` `/api/v1/admin/stats`

## internal

- `POST` `/api/v1/internal/transcription/callback`

## payments

- `POST` `/api/v1/payments/callback/alipay`
- `POST` `/api/v1/payments/callback/wechat`
- `POST` `/api/v1/payments/jinshuju/webhook`
- `POST` `/api/v1/payments/mock-pay`
