import fs from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const runtime = process.argv[2];
if (!['web', 'convex'].includes(runtime)) throw new Error('release_runtime_must_be_web_or_convex');

const isVercelBuild = Boolean(process.env.VERCEL_ENV);
if (runtime === 'convex' && !isVercelBuild) {
  process.stdout.write('[executive-chat-release] Skipped outside Vercel deployment.\n');
  process.exit(0);
}

const secret = process.env.VERIFICATION_SECRET;
let convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
if (!secret && runtime === 'convex' && process.env.VERCEL_ENV !== 'production') {
  process.stdout.write('[executive-chat-release] Preview manifest skipped because the protected release secret is not configured for Preview.\n');
  process.exit(0);
}
if (!secret) throw new Error('release_manifest_secret_missing');
const contract = JSON.parse(fs.readFileSync(new URL('../config/executive-chat-release-contract.json', import.meta.url), 'utf8'));

function environment(value) {
  if (value === 'production') return 'production';
  return 'preview';
}

let manifest;
if (runtime === 'web') {
  const baseUrl = (process.env.E2E_BASE_URL ?? process.env.RELEASE_BASE_URL ?? '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('release_base_url_missing');
  const response = await fetch(`${baseUrl}/api/internal/release-manifest`, {
    headers: { authorization: `Bearer ${secret}` },
  });
  if (!response.ok) throw new Error(`web_release_manifest_http_${response.status}`);
  manifest = await response.json();
  convexUrl ??= manifest.convexUrl;
} else {
  const gitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (!gitSha) throw new Error('convex_release_git_sha_missing');
  if (!convexUrl) throw new Error('convex_release_url_missing');
  manifest = {
    runtime: 'convex',
    environment: environment(process.env.VERCEL_ENV),
    gitSha,
    deploymentId: process.env.CONVEX_DEPLOYMENT ?? new URL(convexUrl).hostname,
    ...contract,
  };
}

if (!convexUrl) throw new Error('release_manifest_convex_url_missing');
const client = new ConvexHttpClient(convexUrl);

const normalized = {
  ...manifest,
  environment: environment(manifest.environment),
  deployedAt: Date.now(),
};
delete normalized.convexUrl;
await client.mutation(anyApi.releaseManifest.upsertFromRelease, { secret, ...normalized });
const compatibility = await client.query(anyApi.releaseManifest.getCompatibilityForRelease, {
  secret,
  environment: normalized.environment,
});
process.stdout.write(`${JSON.stringify({ runtime, environment: normalized.environment, compatible: compatibility.compatible, reasonCodes: compatibility.reasonCodes })}\n`);
if (runtime === 'web' && !compatibility.compatible) process.exitCode = 1;
