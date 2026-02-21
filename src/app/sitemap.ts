import { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const lastModified = new Date();

  // Static public pages (OPAC only — staff/admin/account pages are excluded)
  const staticPages: MetadataRoute.Sitemap = [
    // ── Main OPAC ──
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
      url: `${baseUrl}/opac/advanced-search`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/opac/browse`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/opac/new-titles`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/opac/recommendations`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/opac/lists`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.6,
    },
    // ── Kids OPAC ──
    {
      url: `${baseUrl}/opac/kids`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/opac/kids/search`,
      lastModified,
      changeFrequency: "hourly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/opac/kids/browse`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/opac/kids/challenges`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/opac/kids/parents`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/opac/kids/help`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    // ── Teens OPAC ──
    {
      url: `${baseUrl}/opac/teens`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/opac/teens/search`,
      lastModified,
      changeFrequency: "hourly",
      priority: 0.7,
    },
    // ── Events & Digital ──
    {
      url: `${baseUrl}/opac/events`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/opac/digital`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.7,
    },
    // ── Library Information ──
    {
      url: `${baseUrl}/opac/locations`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/opac/help`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/opac/accessibility`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/opac/privacy`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/opac/terms`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    // ── Auth (public-facing but low priority for crawling) ──
    {
      url: `${baseUrl}/opac/login`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/opac/register`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${baseUrl}/opac/forgot-pin`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.2,
    },
    // ── Mobile landing ──
    {
      url: `${baseUrl}/opac/mobile`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.4,
    },
  ];

  // ---------------------------------------------------------------------------
  // Dynamic record URLs
  // In production, query recently updated bibliographic records so that
  // search-engine crawlers can discover and index individual record pages.
  // ---------------------------------------------------------------------------
  // async function getRecentRecords(limit: number) {
  //   const { getEvergreenPool } = await import("@/lib/db/evergreen");
  //   const pool = getEvergreenPool();
  //   const { rows } = await pool.query(
  //     `SELECT id, edit_date FROM biblio.record_entry
  //      WHERE NOT deleted ORDER BY edit_date DESC LIMIT $1`,
  //     [limit]
  //   );
  //   return rows as { id: number; edit_date: Date }[];
  // }
  //
  // const recentRecords = await getRecentRecords(1000);
  // const recordUrls: MetadataRoute.Sitemap = recentRecords.map((r) => ({
  //   url: `${baseUrl}/opac/record/${r.id}`,
  //   lastModified: r.edit_date,
  //   changeFrequency: "weekly" as const,
  //   priority: 0.6,
  // }));

  // When dynamic records are enabled, merge them:
  // return [...staticPages, ...recordUrls];
  return staticPages;
}
