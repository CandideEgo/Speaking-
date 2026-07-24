---
kind: configuration_system
name: SeeWord 配置系统：基于 Pydantic Settings 的环境变量集中管理
category: configuration_system
scope:
    - '**'
source_files:
    - backend/app/core/config.py
    - backend/.env.example
    - backend/.env
    - frontend/src/lib/siteConfig.ts
    - docker-compose.yml
    - docker-compose.prod.yml
    - frontend/next.config.js
---

## 1. 系统概览

SeeWord 使用 **pydantic-settings**（`BaseSettings`）作为后端配置核心，通过 `.env` 文件与 Docker Compose 环境变量注入实现多层配置加载。前端 Next.js 应用则通过 `NEXT_PUBLIC_*` 构建期环境变量暴露站点合规信息。

## 2. 核心文件与包

- **后端配置定义**: `backend/app/core/config.py` — 唯一配置源，定义 `Settings` 类与 `get_settings()` 单例
- **环境变量模板**: `backend/.env.example` — 完整注释的键值参考
- **本地开发环境**: `backend/.env` — 实际密钥与路径配置
- **前端站点配置**: `frontend/src/lib/siteConfig.ts` — 构建期注入的合规常量
- **Docker 编排**: `docker-compose.yml`（开发）、`docker-compose.prod.yml`（生产）— 环境变量注入层
- **Next.js 构建配置**: `frontend/next.config.js` — API 地址与图片域名白名单

## 3. 架构与设计决策

### 3.1 后端配置加载顺序
```
默认值 → .env 文件 → 环境变量（Docker/系统）→ 运行时校验
```

- `model_config = SettingsConfigDict(env_file=".env", extra="ignore")` 自动加载 `.env`
- 通过 `@lru_cache` 缓存 `get_settings()` 返回全局单例
- `model_post_init` 根据 `ENV` 区分 development/production 行为：
  - development: 提供默认数据库连接、JWT 密钥
  - production: 强制要求 `JWT_SECRET`、`DATABASE_URL`、`OPENAI_API_KEY`、`REDIS_URL`、`TRANSCRIPTION_CALLBACK_SECRET` 等关键配置

### 3.2 配置分组策略
所有配置按功能域组织为清晰的字段组：
- 基础设置（app_name, debug, env）
- 数据库与缓存（database_url, redis_url）
- JWT 认证（jwt_secret, jwt_algorithm, jwt_expire_minutes）
- AI 服务（openai_api_key, base_url, model）
- 媒体存储（local_media_path, oss_*）
- 语音转录（whisper_*, whisperx_*）
- 翻译引擎（translation_engine, fallback_engine, concurrent）
- 支付系统（alipay_*, wechat_*）
- 推荐算法（recommend_ratio_*, score_weight_*）
- 安全与观测（sentry_dsn, log_level, csp_connect_domains）

### 3.3 前端配置模式
- 仅 `NEXT_PUBLIC_*` 前缀变量在构建时注入到浏览器
- `siteConfig.ts` 将合规信息（公司名称、ICP 备案号等）以常量形式导出
- `next.config.js` 动态解析 `NEXT_PUBLIC_API_URL` 用于图片域名白名单

### 3.4 多环境部署
- **开发**: docker-compose.yml 直接注入硬编码值
- **生产**: docker-compose.prod.yml 通过 `${VAR}` 引用 shell 环境变量或 .env 文件
- GPU Worker 独立运行，仅需 REDIS_URL 和 WhisperX 相关配置

## 4. 开发者规范

### 4.1 新增配置项步骤
1. 在 `backend/app/core/config.py` 的 `Settings` 类中添加字段，附带合理默认值
2. 在 `backend/.env.example` 中添加对应注释说明
3. 如需生产必填，在 `model_post_init` 中添加校验逻辑
4. 更新 `docker-compose.prod.yml` 中的环境变量映射

### 4.2 敏感信息管理
- 绝不在代码中硬编码密钥
- 使用 `.env` 文件管理本地开发密钥
- 生产环境通过 Docker 环境变量注入，不提交到版本控制
- `.gitignore` 已排除 `.env` 文件

### 4.3 配置验证最佳实践
- 使用 pydantic 类型注解确保配置格式正确
- 在 `model_post_init` 中进行业务逻辑校验（如生产环境必填检查）
- 利用默认值提供开发友好体验

### 4.4 前端配置原则
- 仅暴露必要的公开配置（NEXT_PUBLIC_*）
- 敏感信息永远留在后端
- 使用 TypeScript 常量确保类型安全

## 5. 配置优先级与覆盖规则

| 来源 | 优先级 | 示例 |
|------|--------|------|
| Python 默认值 | 最低 | `redis_url: str = "redis://localhost:6379/0"` |
| .env 文件 | 中 | `backend/.env` 中的键值对 |
| Docker 环境变量 | 高 | `docker-compose.yml` 中的 environment 字段 |
| 系统环境变量 | 最高 | 宿主机设置的真实环境变量 |

这种分层设计确保了开发环境的开箱即用性，同时支持生产环境的灵活部署。
