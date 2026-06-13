# YouTube Cookies 获取指南

用于 yt-dlp 下载受限制/私有 YouTube 视频时的身份验证。

## 快速开始

### 方法 1：使用脚本（推荐）

```bash
cd backend

# 如果已有浏览器 session（通过 playwright-cli 打开过 YouTube）
python get_youtube_cookies.py --from-session

# 或者打开浏览器并等待手动登录
python get_youtube_cookies.py --open-browser --wait 120
```

### 方法 2：手动操作

```bash
cd backend

# 1. 打开 YouTube（持久化 profile）
playwright-cli open https://www.youtube.com --persistent

# 2. 在浏览器中登录 YouTube（如果还没登录）

# 3. 保存 cookies
playwright-cli state-save youtube_cookies.txt

# 4. 转换为 Netscape 格式（如果需要）
python get_youtube_cookies.py --from-state youtube_cookies.txt
```

## 配置

确保 `.env` 文件中有：

```env
YOUTUBE_COOKIES_PATH=./youtube_cookies.txt
```

## 脚本用法

```
python get_youtube_cookies.py [选项]

选项：
  -o, --output PATH       输出文件路径（默认: ./youtube_cookies.txt）
  -s, --from-session      从现有 playwright-cli session 提取（默认）
  -b, --open-browser      打开浏览器等待手动登录
  --from-state PATH       从现有 Playwright state JSON 文件转换
  -w, --wait SECONDS      等待登录的时间（默认: 60）
  -v, --verbose           详细日志
```

## 验证

获取 cookies 后，可以用 yt-dlp 测试：

```bash
# 测试是否能下载需要登录的视频
yt-dlp --cookies youtube_cookies.txt "https://www.youtube.com/watch?v=VIDEO_ID"
```

## 注意事项

- Cookies 包含敏感信息，**不要提交到 git**
- `youtube_cookies.txt` 已在 `.gitignore` 中
- 定期更新 cookies（建议每月一次，或当下载失败时）
- 如果看到 "Sign in to confirm you're not a bot" 错误，说明 cookies 已过期
