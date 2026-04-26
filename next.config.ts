import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude packages with native binaries or ESM/CJS conflicts from the
  // serverless bundle — they must be resolved at runtime, not bundled.
  serverExternalPackages: [
    'puppeteer-core',
    '@sparticuz/chromium-min',
    'jsdom',
  ],
  // Ensure non-imported files (read via fs.readFileSync at runtime)
  // are included in the serverless function bundle for PDF generation.
  outputFileTracingIncludes: {
    '/api/incidents/\\[id\\]/pdf': ['./src/lib/legal/legalDocStyles.css'],
    '/api/incidents/export': ['./src/lib/legal/legalDocStyles.css'],
    '/api/documents/generate': ['./src/lib/legal/legalDocStyles.css'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'img.clerk.com', pathname: '/img/**' },
    ],
  },
};

export default nextConfig;
