# scripts/

项目级运维与发布脚本。后端一次性脚本见 [`backend/scripts/`](../backend/scripts/README.md)。

## 脚本

| 脚本 | 用途 | 运行方式 |
|------|------|----------|
| `release.sh` | 版本号 bump + CHANGELOG 归档 + 提交（不 push） | `scripts/release.sh {patch\|minor\|major\|<version>}` |

## release.sh

bump `frontend/package.json` 版本，把 `CHANGELOG.md` 的 `[Unreleased]` 区段归档为新版本（带日期），新增空的 `[Unreleased]` 供下轮填写，最后 `git commit`（不 push，需人工 review 后 `git push && git tag vX.Y.Z && git push --tags`）。

```bash
scripts/release.sh patch    # 0.1.0 -> 0.1.1
scripts/release.sh minor    # 0.1.0 -> 0.2.0
scripts/release.sh major    # 0.1.0 -> 1.0.0
scripts/release.sh 1.2.3    # 显式版本号
```

## 部署相关

实际部署脚本（CD pull/restart、日志聚合、告警）随服务器环境配置，见：
- CD 自动部署 job 模板：`.github/workflows/deploy.yml.template`
- Loki + Promtail 日志聚合：`docker-compose.prod.yml` 的 `loki` / `promtail` 服务
- 质量告警 webhook：后端 `app/services/alert_service.py`（钉钉/邮件占位，需配 `ALERT_WEBHOOK_URL`）

> 注：以上三项为模板/占位，需在目标服务器填 secrets 后生效。详见 Stage 6 运维补丁说明。
