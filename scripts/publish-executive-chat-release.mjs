import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const runtime = process.argv[2];
if (runtime !== 'pair') throw new Error('release_runtime_must_be_pair');

const secret = process.env.VERIFICATION_SECRET;
if (!secret) throw new Error('release_manifest_secret_missing');

const baseUrl = (process.env.E2E_BASE_URL ?? process.env.RELEASE_BASE_URL ?? '').replace(/\/$/, '');
if (!baseUrl) throw new Error('release_base_url_missing');

const response = await fetch(`${baseUrl}/api/internal/release-manifest`, {
  headers: { authorization: `Bearer ${secret}` },
});
if (!response.ok) throw new Error(`web_release_manifest_http_${response.status}`);

const web = await response.json();
if (web.runtime !== 'web') throw new Error('web_release_manifest_runtime_invalid');
if (web.environment !== 'production') throw new Error('web_release_manifest_environment_invalid');
if (!/^[a-f0-9]{7,64}$/i.test(web.gitSha ?? '')) throw new Error('web_release_manifest_git_sha_invalid');
if (!web.deploymentId || web.deploymentId === 'local') throw new Error('web_release_manifest_deployment_id_missing');
if (!web.convexUrl) throw new Error('web_release_manifest_convex_url_missing');

const expectedGitSha = process.env.EXPECTED_RELEASE_GIT_SHA ?? process.env.GITHUB_SHA;
if (expectedGitSha && web.gitSha !== expectedGitSha) {
  throw new Error(`release_git_sha_mismatch:${expectedGitSha.slice(0, 12)}:${String(web.gitSha).slice(0, 12)}`);
}

const contract = JSON.parse(fs.readFileSync(new URL('../config/executive-chat-release-contract.json', import.meta.url), 'utf8'));
const convex = {
  runtime: 'convex',
  environment: 'production',
  gitSha: web.gitSha,
  deploymentId: process.env.CONVEX_DEPLOYMENT ?? new URL(web.convexUrl).hostname,
  ...contract,
};

const normalizedWeb = { ...web, deployedAt: Date.now() };
delete normalizedWeb.convexUrl;
const normalizedConvex = { ...convex, deployedAt: Date.now() };
const client = new ConvexHttpClient(web.convexUrl);
const compatibility = await client.mutation(anyApi.releaseManifest.upsertPairFromRelease, {
  secret,
  web: normalizedWeb,
  convex: normalizedConvex,
});

if (compatibility.compatible && process.env.RECORD_RELEASE_ASSURANCE === 'true') {
  const suites = (process.env.RELEASE_ASSURANCE_SUITES ?? 'upload-release,executive-chat-critical-matrix')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const reportDigest = createHash('sha256').update(JSON.stringify({
    gitSha: web.gitSha,
    webDeploymentId: web.deploymentId,
    convexDeploymentId: convex.deploymentId,
    suites,
    workflowRunId: process.env.GITHUB_RUN_ID,
  })).digest('hex');
  await client.mutation(anyApi.executiveChatRollout.recordReleaseAssurance, {
    secret,
    environment: 'production',
    gitSha: web.gitSha,
    webDeploymentId: web.deploymentId,
    convexDeploymentId: convex.deploymentId,
    status: 'succeeded',
    suites,
    reportDigest,
    workflowRunId: process.env.GITHUB_RUN_ID,
    completedAt: Date.now(),
  });
}

process.stdout.write(`${JSON.stringify({
  runtime,
  environment: 'production',
  gitSha: web.gitSha,
  webDeploymentId: web.deploymentId,
  convexDeploymentId: convex.deploymentId,
  compatible: compatibility.compatible,
  reasonCodes: compatibility.reasonCodes,
})}\n`);
if (!compatibility.compatible) process.exitCode = 1;
