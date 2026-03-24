import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Exclude puppeteer-core and Chromium from the serverless bundle —
  // they use native binaries that must be resolved at runtime, not bundled.
  serverExternalPackages: [
    'puppeteer-core',
    '@sparticuz/chromium-min',
  ],
};

export default nextConfig;
