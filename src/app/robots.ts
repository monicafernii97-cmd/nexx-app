import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nexproof.io';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/chat/',
        '/court-settings/',
        '/dashboard/',
        '/docuvault/',
        '/efiling/',
        '/incident-report/',
        '/nex-profile/',
        '/profile/',
        '/resources/',
        '/settings/',
        '/subscription/',
        '/api/',
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
