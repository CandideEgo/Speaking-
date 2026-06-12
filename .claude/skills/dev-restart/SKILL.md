---
name: dev-restart
description: "清除 Next.js 缓存、杀掉旧进程、重启前端开发服务器。触发：用户说 /dev-restart、'重启前端'、'restart dev'、'clear cache and restart'、'刷新前端'、'重新启动开发服务器'、'清理缓存重启'"
---

# Dev Restart — 清理缓存并重启前端

清除 Next.js 缓存，杀掉残留的 dev server 进程，重新启动前端开发服务器。

## 触发

- `/dev-restart`
- "重启前端"、"restart dev"、"clear cache and restart"、"刷新前端"、"重新启动开发服务器"、"清理缓存重启"

## 执行步骤

### Step 1: 停止当前 dev server

如果有正在后台运行的 `npm run dev` / `next dev` 任务，先停掉：
- 用 `TaskList` 查找正在运行的后台任务
- 用 `TaskStop` 停止相关任务

### Step 2: 清除缓存

依次执行：
```bash
rm -rf frontend/.next
rm -rf frontend/node_modules/.cache
```

确认输出 "Cleared .next cache" 和 "Cleared node_modules/.cache"。

### Step 3: 杀掉残留端口进程

Windows 环境下，检查端口 3000-3006 是否被占用并杀掉：
```bash
for port in 3000 3001 3002 3003 3004 3005 3006; do
  pid=$(netstat -ano | grep ":$port " | grep LISTENING | awk '{print $NF}' | head -1)
  if [ -n "$pid" ]; then
    taskkill //F //PID $pid 2>/dev/null
  fi
done
```

### Step 4: 启动开发服务器

```bash
cd frontend && npm run dev
```

使用 `run_in_background: true` 让服务器在后台持续运行。

### Step 5: 验证启动成功

等待约 6 秒后检查输出：
- 确认看到 `✓ Ready in Xs`
- 确认端口是 `http://localhost:3000`
- 如果端口不是 3000，说明 Step 3 没清干净，需要回到 Step 3 重新清理

## 注意事项

- 工作目录：项目根目录 `C:\Users\Administrator\Speaking`
- 前端目录：`frontend/`
- Windows 环境：杀进程用 `taskkill //F //PID`（双斜杠）
- 默认端口 3000，如果 3000 被占用会依次尝试 3001-3006，但这意味着有残留进程需要清理
- 后端服务器不受影响，只操作前端
