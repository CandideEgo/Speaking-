# 本地媒体测试素材

`watch-clock.mp4` 是本地生成的 20 秒黑色视频与提示音，H.264 baseline／AAC。仅验证媒体解码、定位、倍速、句末停止与布局，不用作英语听校或学习效果证据，不包含第三方媒体。

可用 FFmpeg 重建：

```powershell
ffmpeg -f lavfi -i color=c=black:s=320x180:r=25 -f lavfi -i sine=frequency=440:sample_rate=48000 -t 20 -c:v libx264 -profile:v baseline -pix_fmt yuv420p -g 1 -c:a aac -movflags +faststart watch-clock.mp4
```

`watch-baseline.fixture.ts` 用本机随机端口提供真实 HTTP Range 响应，因为 Windows WebKit 的媒体请求不经过 Playwright 的页面路由拦截。API 仍为受控响应；旧移动端集成套件由独立后端脚本在随机专用 PostgreSQL 库中运行。
