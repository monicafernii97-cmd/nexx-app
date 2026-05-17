import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexproof.io';
const SITE_LAST_MODIFIED = new Date('2026-05-17T00:00:00.000Z');

/** Return the stable public sitemap for the current pre-launch marketing surface. */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: SITE_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
