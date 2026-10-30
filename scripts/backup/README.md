# 备份与恢复（A09 / OPS-06）

两个脚本，一份约定。目标：**RPO ≤ 24 小时、RTO ≤ 2 小时**（先用定时任务覆盖 RPO，RTO 以恢复演练实测修正）。
本目录不保存任何备份数据；备份只落在 `BACKUP_ROOT`（默认 `/root/backups/seeword`）与站外目标。

| 文件 | 作用 |
| --- | --- |
| `backup.sh` | 版本化备份：`pg_dump -Fc` + TOC 校验、alembic revision、关键表行数、媒体归档、配置、校验和、manifest；成功才写 `SUCCESS` |
| `restore.sh` | 校验归档 → 恢复到目标库 → 比对 revision 与行数 →（可选）恢复媒体；打印耗时供 RTO 记录 |

> 部署技能里的“发布前备份点”仍是一次性 dump（`pg_restore --list` 校验，见
> `.claude/skills/deploy/SKILL.md` 第 5 步）；本目录负责**定时、异地、可恢复**的那一层。

## 定时备份（生产）

每天 03:17（错开整点，避免与其它定时任务抢 IO）执行：

```cron
17 3 * * *  cd /opt/speaking && BACKUP_ROOT=/root/backups/seeword \
  BACKUP_OFFHOST_CMD='rclone copy "$BACKUP_DIR" remote:seeword-backups/$(hostname)' \
  bash scripts/backup/backup.sh >> /var/log/seeword-backup.log 2>&1
```

- 站外目标由 `BACKUP_OFFHOST_CMD` 决定（rclone / restic / 对象存储 CLI 均可）；命令失败会让整次备份失败且不写 `SUCCESS`。
- 加密：`BACKUP_GPG_RECIPIENT=<key>` 会只留下 `.tar.gz.gpg`；私钥不进服务器。
- 保留：本地默认 14 天，只删带 `SUCCESS` 的目录；站外保留策略由目标端负责。
- 媒体卷默认 `speaking_media`（compose 项目名 + 卷名）；纯路径部署用 `MEDIA_PATH`。
- 数据库凭据沿用 compose 里的 `DB_USER` / `DB_NAME`；脚本不读取 `.env` 里的密码，它通过容器内的本地 socket 访问。

## 恢复与演练

```bash
# 1) 只校验归档（不碰数据库）
BACKUP_ROOT=/root/backups/seeword bash scripts/backup/restore.sh --from /root/backups/seeword/<ts> --verify-only

# 2) 恢复到独立库（不覆盖生产库）
bash scripts/backup/restore.sh --from /root/backups/seeword/<ts> \
  --target-db seeword_restore --recreate

# 3) 连媒体一起恢复
bash scripts/backup/restore.sh --from /root/backups/seeword/<ts> \
  --target-db seeword_restore --recreate --media-target /tmp/restored-media
```

恢复完成必须看到：`row counts match the manifest; revision matches` 与 `RESTORE OK`。
归还到生产是另一次经过确认的操作：先停写入（或接受窗口），再按 `--target-db seeword --recreate` 恢复，
随后 `alembic current` 与镜像版本对齐、`/health` 通过。

演练记录要求：写清备份时间、恢复开始/结束（`elapsed_seconds`）、revision、抽样表行数、媒体文件数与 hash 抽样，
以及本次实测的 RPO/RTO 与是否调整目标。

## 已知边界

- 只备份数据库与媒体卷；OSS 上的对象、仓库里的参考数据（`backend/data/`）与镜像由各自渠道管理，
  restore 不覆盖它们（参考数据随镜像/挂载发放，OSS 另有生命周期与冗余）。
- 恢复脚本以 `--no-owner` 还原，所有对象归执行恢复的数据库用户。
- 备份期间数据库保持在线（`pg_dump` 取一致性快照）；媒体卷是文件级归档，拍摄瞬间若有上传进行中，
  该文件可能不完整——媒体可重取/重转，DB 是唯一不可再生部分。
