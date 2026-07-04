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
  images: {
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
