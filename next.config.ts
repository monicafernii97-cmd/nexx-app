import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let the proxy classify trailing-slash scanner probes before Next.js can
  // normalize them into redirects that still consume request processing.
  skipTrailingSlashRedirect: true,
  // Exclude packages with native binaries from the serverless bundle —
  // they must be resolved at runtime, not bundled.
  // NOTE: jsdom was previously here but removed because its dependency
  // chain (html-encoding-sniffer → @exodus/bytes) is now ESM-only and
  // crashes with ERR_REQUIRE_ESM when loaded externally. The bundler
  // handles the ESM→CJS conversion correctly.
  serverExternalPackages: [
    'puppeteer-core',
    '@sparticuz/chromium-min',
  ],
  // Ensure non-imported files (read via fs.readFileSync at runtime)
  // are included in the serverless function bundle for PDF generation.
  outputFileTracingIncludes: {
    '/api/incidents/\\[id\\]/pdf': ['./src/lib/legal/legalDocStyles.css'],
    '/api/incidents/export': ['./src/lib/legal/legalDocStyles.css'],
    '/api/documents/generate': ['./src/lib/legal/legalDocStyles.css'],
    '/api/documents/export/stream': ['./src/lib/legal/legalDocStyles.css'],
    '/api/court-documents/export': ['./src/lib/legal/legalDocStyles.css'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'img.clerk.com', pathname: '/img/**' },
    ],
  },
};

export default nextConfig;
