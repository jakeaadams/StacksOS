import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/opac/", "/opac/search", "/opac/record/"],
        disallow: [
          "/staff/",
          "/api/",
          "/admin/",
          "/_next/",
          "/private/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
