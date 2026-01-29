import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const lastModified = new Date();

  // Static public pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/opac`,
      lastModified,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${baseUrl}/opac/search`,
      lastModified,
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/opac/advanced`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/opac/kids`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/opac/help`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/opac/login`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  // In production, you could dynamically generate record URLs
  // by querying the database for recently updated records
  // For now, we return just the static pages
  
  return staticPages;
}
