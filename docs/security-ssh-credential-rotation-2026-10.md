# 生产 SSH 凭据轮换清单（2026-10-29）

## 为什么现在要做

- `backend/scripts/rebackfill_video_quality.py` 从 `ae875e01`（2026-09-16，已合入 `master` 并推到
  `origin/master`）起，把生产 `root@47.122.109.52` 的 SSH 密码写死在源码里。
- 仓库 `github.com/CandideEgo/Speaking-` 是**公开仓库**，匿名即可读 → 这把密码自该提交起对全网可见。
- `f3e1b193` 已把字面量从工作区删掉，改成 `SW_PW` 环境变量；**但历史提交里还在**，克隆、
  fork、镜像、搜索引擎缓存都可能有副本。

结论：删文件不等于解除风险，唯一有效动作是**轮换密码**。重写已推送的 `master` 历史代价大于收益，
本清单不做。

## 影响面：谁会用到这把密码

只有三个入口，全部只读环境变量，仓库/技能/`.env` 里现在**没有任何副本**（2026-10-29 用 grep 核对过，
包括被 `.gitignore` 忽略的本地文件）：

| 入口 | 用法 |
| --- | --- |
| `.claude/skills/deploy/scripts/sshx.py` | `SW_HOST` / `SW_USER` / `SW_PW`，默认 `root@47.122.109.52` |
| `.claude/skills/deploy/scripts/upload.py` | 同上（SFTP 断点续传） |
| `backend/scripts/rebackfill_video_quality.py` | 同上，缺 `SW_PW` 直接 `SystemExit` |

**不受轮换影响的**（走密钥，不是这把密码）：GPU worker 的 Redis 隧道与 NSSM 服务的 SSH 入口，用
`admin@` + `%ProgramData%\seeword\id_ed25519`（见 `backend/scripts/gpu_worker_tunnel.ps1`）。
`47.122.127.105` 是已下线的旧机器（口径见 `.claude/skills/deploy/SKILL.md`），不需要为它轮换。

## 第 0 步：先让 `sshx.py` 能跑

`sshx.py` / `upload.py` / `rebackfill_video_quality.py` 都 `import paramiko`，而 paramiko **没有写在
任何 requirements 里**，本机 `python`（`C:/Program Files/Python312`）与 `backend/.venv` 也都没装
（2026-10-29 核对）。先装到后端 venv，之后所有命令都用这个解释器：

```bash
cd "$(git rev-parse --show-toplevel)/backend"
.venv/Scripts/python.exe -m pip install paramiko
.venv/Scripts/python.exe -c "import paramiko; print(paramiko.__version__)"
```

Done when：打印出版本号。下面所有命令都用这个解释器（已写全路径），不要用 PATH 上的 `python`。

## 前置：先留一条不断链的后路

1. **确认现在就登得进去**（用旧密码跑一次只读命令，拿到 `root` 即算过）：
   ```bash
   cd "$(git rev-parse --show-toplevel)"
   MSYS_NO_PATHCONV=1 SW_PW='<旧密码>' backend/.venv/Scripts/python.exe .claude/skills/deploy/scripts/sshx.py "id -un"
   ```
   登不进去就先把登录问题解决，别进入第 2 步。

2. **本机生成部署密钥**（当前 `~/.ssh` 下没有公钥，`%ProgramData%\seeword\` 也不存在）：
   ```bash
   ssh-keygen -t ed25519 -C "fuwei-laptop-deploy" -f ~/.ssh/id_ed25519
   ```

3. **把公钥装到服务器 root**：先上传再追加，避免把长串引号塞进远程命令：
   ```bash
   cd "$(git rev-parse --show-toplevel)/.claude/skills/deploy/scripts"
   PY="$(git rev-parse --show-toplevel)/backend/.venv/Scripts/python.exe"
   MSYS_NO_PATHCONV=1 SW_PW='<旧密码>' "$PY" sshx.py "mkdir -p /root/.ssh && chmod 700 /root/.ssh"
   MSYS_NO_PATHCONV=1 SW_PW='<旧密码>' "$PY" upload.py "$(cygpath -m ~/.ssh/id_ed25519.pub)" /root/.ssh/authorized_keys.new
   MSYS_NO_PATHCONV=1 SW_PW='<旧密码>' "$PY" sshx.py "chmod 600 /root/.ssh/authorized_keys.new && cat /root/.ssh/authorized_keys.new >> /root/.ssh/authorized_keys && rm -f /root/.ssh/authorized_keys.new && chmod 600 /root/.ssh/authorized_keys"
   ```

4. **验证密钥登录可用**：
   ```bash
   ssh -i ~/.ssh/id_ed25519 -o PreferredAuthentications=publickey root@47.122.109.52 "id -un"
   ```
   Done when：输出 `root`。这一步做完，后面即使密码改错也还有退路。

## 轮换

5. **生成新密码**（只含 `0-9a-f`，不会撞 shell 转义，也不会被 `printf` 吃掉）：
   ```bash
   openssl rand -hex 20
   ```

6. **在服务器上改 root 密码**——用**交互式 SSH**，不要 `sshx.py`：远程命令会进本机 shell 历史，
   也会在远端进程表里短暂可见。
   ```bash
   ssh -i ~/.ssh/id_ed25519 root@47.122.109.52
   passwd          # 连输两次新密码（40 位十六进制）
   exit
   ```
   若 `passwd` 被 pam_pwquality 以「缺大写字母」拦下，改用 `openssl rand -base64 24`
   —— 有大小写和数字，且不含单引号，仍可安全放进 `SW_PW='...'`。
   若坚持非交互（例如密码由脚本下发）：
   `printf 'root:%s\n' "$NEW" | ssh -i ~/.ssh/id_ed25519 root@47.122.109.52 chpasswd`
   —— `chpasswd` 认的是 `用户:密码` 这一行格式，不是两行密码；同样会留在历史里，只是省掉手输。

7. **验证新密码能用**：
   ```bash
   cd "$(git rev-parse --show-toplevel)"
   MSYS_NO_PATHCONV=1 SW_PW='<新密码>' backend/.venv/Scripts/python.exe .claude/skills/deploy/scripts/sshx.py "id -un"
   ```
   Done when：输出 `root`、退出码 0。

8. **验证旧密码已失效**（这是唯一能证明轮换真的生效的检查）：
   ```bash
   MSYS_NO_PATHCONV=1 SW_PW='<旧密码>' backend/.venv/Scripts/python.exe .claude/skills/deploy/scripts/sshx.py "id -un"
   ```
   Done when：抛 `AuthenticationException` / `Permission denied`，**不是**执行成功。

9. **确认业务没被波及**（轮换只动 SSH，不该影响容器）：
   ```bash
   MSYS_NO_PATHCONV=1 SW_PW='<新密码>' backend/.venv/Scripts/python.exe .claude/skills/deploy/scripts/sshx.py "cd /opt/speaking && docker compose -f docker-compose.prod.yml ps --format '{{.Name}}|{{.Status}}'"
   ```
   Done when：四个 `speaking-*` 应用容器都是 `Up`。

10. **新密码只进两处**：密码管理器，以及本机的 DPAPI 加密文件
    `%USERPROFILE%\.seeword\prod-ssh.secure`（见下节）。不要写进仓库、`.env`、`.claude/skills/`
    或 PROGRESS.md。

11. **查一遍复用**：这把密码如果在别处用过（宝塔/面板、数据库、其他主机、域名与云账号后台），
    逐处一并改。轮换只对 SSH 有效，别的地方不会自动失效。

## 收尾（可选，但建议）

12. **改成密钥登录、关掉密码认证**。注意顺序：两个 Python 助手现在是
    `look_for_keys=False, allow_agent=False` 的纯密码登录，直接关 `PasswordAuthentication`
    会把 `/deploy` 打断。正确顺序是
    a) 先把 `sshx.py` / `upload.py` / `rebackfill_video_quality.py` 改成用密钥（代码改动，单独一次提交）；
    b) 再改 `/etc/ssh/sshd_config` 的 `PasswordAuthentication no`；
    c) `systemctl reload ssh`（RHEL 系是 `sshd`）；
    d) 用**现有连接之外的**一个新终端验证密钥仍可登录，再断开。
    第 3 步已经把密钥装好，这一步是把它变成唯一入口。

13. **收敛 22 端口**。`/deploy` 是从公网按密码登录的，说明 22 对全网开放。轮换之后建议在安全组/
    防火墙里只放行固定出口 IP（GPU 机的隧道也连云端的 22，一并核对）。

## 本地存放（2026-10-29 起）

密码存在本机 `%USERPROFILE%\.seeword\prod-ssh.secure`，Windows DPAPI 加密（当前用户作用域），
目录 ACL 去掉了继承、只留 `DESKTOP-42LGUCO\Fuwei`。同目录 `README.txt` 写了取用与重写方式，
不含密码本身。取用：

```bash
PW=$(powershell -NoProfile -Command '$s=Get-Content (Join-Path $env:USERPROFILE ".seeword\prod-ssh.secure")|ConvertTo-SecureString;[Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))' | tr -d '\r\n')
MSYS_NO_PATHCONV=1 SW_PW="$PW" backend/.venv/Scripts/python.exe .claude/skills/deploy/scripts/sshx.py "id -un"
```

DPAPI 挡的是「别的 Windows 账户、别的机器读到」，**挡不住以当前用户身份运行的进程**。它不是这把
密码该长期待的地方：第 12 步把 SSH 改成密钥登录之后，`prod-ssh.secure` 应当删掉。

## 明确不做

- **不重写 git 历史**（`git filter-repo` / BFG）：`master` 已推送且有克隆，重写会强迫所有副本重来，
  收益低于成本；轮换后旧值已无用。
- **不删 `ae875e01`**：那是真实的功能修复（YouTube 360p 画质根因），删了会丢功能。

## 做完之后

在 `PROGRESS.md` 追加一行执行记录：日期、执行人、**"旧密码已失效"的验证结果**，以及新密码存放位置
（只写"密码管理器"之类的指向，不写密码本身）。
