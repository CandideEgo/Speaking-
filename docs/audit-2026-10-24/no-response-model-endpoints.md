# 尚无 response_model 的数据端点清单（BE-07 跟踪）

生成方式：加载 `create_app()` 后遍历 `APIRoute`，排除 `/health`、`/metrics`、`/media`、
OpenAPI 文档与 Prometheus 路径、已退役固定返回 410 的兼容壳（heatmap/weekly-reports、vocab-sets celebrate、shadowing），
二进制下载端点（导出下载、exam-pdf 文件），以及 204 无响应体的路由，
统计 `response_model is None` 的 JSON 数据端点。

生成日期：2026-10-24。当前计数：0。

**BE-07 至此清零**：除上述被明确排除的类别外，所有 JSON 数据端点都声明了 `response_model`。
`tests/test_response_contract.py` 会遍历 OpenAPI 钉住这一点（裸 `PaginatedResponse`、分页 items 类型、
以及各领域关键路由），清单继续作为回归证据保留。
