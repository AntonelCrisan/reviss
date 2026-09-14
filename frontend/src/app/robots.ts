import type { MetadataRoute } from "next";
import { absoluteUrl, robotsDisallowRoutes } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: robotsDisallowRoutes,
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
