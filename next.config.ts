import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude puppeteer-core and Chromium from the serverless bundle —
  // they use native binaries that must be resolved at runtime, not bundled.
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
  },
};

export default nextConfig;
