// Resolve the API origin at build time so `next/image` can fetch from it.
// `mediaUrl()` routes CDN thumbnails through the backend image proxy and
// relative media paths against this origin, so the API host is the primary
// image source next/image needs to allow (plus the raw CDN hosts as a fallback
// for any URL that bypasses the proxy).
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
let apiHost = "localhost";
try {
  apiHost = new URL(API_URL).hostname;
} catch {
  // Malformed or unset — keep localhost (dev default).
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // 真机联调（手机通过局域网 IP 访问 dev 站）：Next 16 的 cross-site 防护会把
  // 来自未登记来源的 HMR WebSocket 挡掉，表现是页面停在骨架屏、一个 API 都不发
  // ——不是白屏报错。默认放行 192.168.x.x，其他网段用 DEV_ALLOWED_ORIGINS
  // （逗号分隔，支持 `*` 通配段）覆盖。
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS || "192.168.*.*").split(","),
  experimental: {
    // Rewrite barrel-file imports (recharts, lucide-react) into direct,
    // tree-shakeable imports to keep unused chart/icon code out of bundles.
    optimizePackageImports: ["recharts", "lucide-react"],
  },
  // In development, proxy /api/ and /media/ to the backend so the frontend
  // can use relative paths without nginx. Production standalone output ignores
  // rewrites — nginx handles the proxying there.
  async rewrites() {
    if (process.env.NODE_ENV === "development") {
      return [
        { source: "/api/:path*", destination: "http://localhost:8000/api/:path*" },
        { source: "/media/:path*", destination: "http://localhost:8000/media/:path*" },
        { source: "/health", destination: "http://localhost:8000/health" },
      ];
    }
    return [];
  },
  images: {
    // Bypass the optimizer (see src/lib/imageLoader.ts): the standalone
    // server has no /media route in production, so optimizer server-side
    // fetches fail. Browsers load /media/... straight through nginx.
    loader: "custom",
    loaderFile: "./src/lib/imageLoader.ts",
    localPatterns: [
      // /media/ paths proxied to backend (thumbnails, avatars, etc.)
      // Next 16+ requires localPatterns for local images with query strings.
      // Omitting `search` skips query-string validation (allows any ?...).
      { pathname: "/media/**" },
    ],
    remotePatterns: [
      // Backend media + image proxy (relative paths + proxied CDN URLs resolve
      // here). Allowed in both protocols so dev (http) and prod (https) work.
      { protocol: "http", hostname: apiHost },
      { protocol: "https", hostname: apiHost },
      // Dev backend on a different port (e.g. localhost:8000 while the app
      // runs on :3000). Omitting `port` matches any port.
      { protocol: "http", hostname: "localhost" },
      // Direct CDN hosts — fallback for URLs not routed through mediaUrl's proxy.
      { protocol: "https", hostname: "**.aliyuncs.com" },
      { protocol: "https", hostname: "**.ytimg.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "**.hdslb.com" },
      { protocol: "https", hostname: "**.biliimg.com" },
      { protocol: "https", hostname: "**.douyinpic.com" },
      { protocol: "https", hostname: "**.douyincdn.com" },
      { protocol: "https", hostname: "**.douyinstatic.com" },
    ],
  },
};

module.exports = nextConfig;
