# MCP SDK 依赖与适配层 spike（E0 / E8 前置，2026-11-03）

状态：**隔离运行时可用，生产依赖门未通过**。`MCP_SDK_ENABLED=false` 保持不变；
本记录只证明适配层能在隔离环境导入、挂载、鉴权并列出工具，不等于宿主闭环或生产可用。

## 结论

| 项 | 观测 |
| --- | --- |
| 最新 SDK | `mcp==2.3.0`；2.x 把 `FastMCP` 改名为 `MCPServer`（`mcp.server.mcpserver`） |
| 适配层实现 | 已按 2.x API 写（`MCPServer` / `TransportSecuritySettings`），在 `mcp==2.0.0` 下可用 |
| 依赖冲突 | `mcp>=1.30` 要求 `uvicorn>=0.31.1`；云端锁 `uvicorn==0.29.0`。`mcp 1.30` 还要求 `httpx>=0.27.1`，云端锁 `0.27.0` |
| 强制降级测试 | 在 `uvicorn 0.29.0` 下强制使用 `mcp 2.0.0`，`MCPServer` 可导入、`streamable_http_app()` 可构建 |
| Windows | `pip --target` 安装的 pywin32 需要把 `win32`、`win32/lib`、`pywin32_system32` 加进 `PYTHONPATH`/`PATH`，否则 `import mcp` 因 `pywintypes` 失败 |
| 隔离运行时位置 | `backend/.venv/mcp-runtime/`（`pip --target`，被 `.gitignore` 忽略；不在生产镜像内） |

## 已验证

在独立 venv / 隔离 runtime + 一次性 V2 UI 数据库上，使用真实适配层
`app.integrations.mcp.server.create_mcp_app()`：

1. FastAPI `mount("/api/v1/mcp", mcp_app)`，lifespan 显式进入 `mcp_app.router.lifespan_context`；
2. 无凭据 / 伪造凭据 POST `/api/v1/mcp/` → `401 {"error":"EXTERNAL_TOKEN_INVALID",...}`，
   不是 HTTP 统一 envelope；
3. 用 `external_connection_service.create()` 签发一次性测试凭据后：
   - `initialize` → HTTP 200，`serverInfo = {"name":"SeeWord","version":"1.0.0"}`；
   - `notifications/initialized` → 202；
   - `tools/list` → 200，返回 9 个工具：
     `list_teaching_sessions`、`get_teaching_session`、`get_exam_question`、
     `get_question_analysis`、`submit_answer`、`reveal_question_analysis`、
     `record_learning_feedback`、`get_learning_profile`、`get_review_tasks`；
4. 测试结束撤销连接，未保留明文凭据。

## 未证明 / 阻塞

- **生产镜像未验证**：隔离 runtime 只在 `backend/.venv` 下，`Dockerfile.cloud` 不含它；
  `MCP_SDK_ENABLED=true` 不能在当前云端依赖集下上线。
- **宿主闭环未跑**：Codex / Claude 的真实读题 → 辅助复答 → 网页恢复 → 撤权回归仍未执行。
- **协议版本未锁定**：`initialize` 使用 `2025-06-18` 完成握手；目标宿主的协议版本、
  传输与认证方式仍需逐宿主记录（G0-4）。
- **会话头未验证**：本次 `initialize` 响应未观察到 `mcp-session-id`（客户端仍能列工具），
  有状态会话语义需在宿主实测中确认。
- **工具业务结果**：只跑通 `tools/list`，未在宿主中实际调用工具并核对副作用。

## 下一步（二选一，需独立决定）

1. **升级云端 `uvicorn` 到 `>=0.31.1`**（`mcp 1.x` 还需 `httpx>=0.27.1`），走完整回归、
   `pip-audit` 与生产镜像构建后再开 MCP；这是修改生产运行依赖，不能顺手做。
2. **MCP 独立运行时/服务**：用单独 venv 或服务镜像承载 SDK，后端通过内部入口转发；
   需要明确 DB / 鉴权边界，避免复制业务规则。

在任一路径完成并通过宿主实测前，`MCP_READ/WRITE_ENABLED` 与 `MCP_SDK_ENABLED` 保持关闭。

## 复现要点

```text
PYTHONPATH=<backend>;<mcp-runtime>;<mcp-runtime>\win32;<mcp-runtime>\win32\lib;<mcp-runtime>\pywin32_system32
PATH=<mcp-runtime>\pywin32_system32;%PATH%
ENV=testing TEACHING_ENABLED=true MCP_READ_ENABLED=true
DATABASE_URL=postgresql+asyncpg://seeword_v2:v2_test_only@127.0.0.1:15433/seeword_v2_ui
```

smoke 脚本使用 `httpx.ASGITransport` + 显式 lifespan；测试凭据只在进程内生成并撤销。
