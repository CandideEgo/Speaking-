import type { MetadataRoute } from "next";

// Learning and account pages require a session; do not advertise them to crawlers.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/terms", "/privacy", "/contact", "/_next/static/", "/logo.png", "/og-image.png"],
      disallow: "/",
    },
  };
}
