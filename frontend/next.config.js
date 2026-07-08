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
