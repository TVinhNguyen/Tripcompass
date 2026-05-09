// =============================================================================
// TripCompass — Dynamic Sitemap
// Source of truth: docs/frontend-review-2026-05-01.md §FE-37
// Next.js 13+ app router sitemap convention (MetadataRoute.Sitemap)
// =============================================================================

import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tripcompass.vn";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${BASE_URL}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/explore`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/places`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/combos`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/ai-planner/quick`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  // NOTE: Dynamic place and combo pages (e.g. /places/[id]) could be added here
  // by fetching from the backend API at build time. Skipping for now since
  // the backend might not be available during static build.
  // When ready:
  //   const places = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/places?limit=1000`).then(r => r.json())
  //   const placePages = places.data.map(p => ({ url: `${BASE_URL}/places/${p.id}`, ... }))

  return staticPages;
}
