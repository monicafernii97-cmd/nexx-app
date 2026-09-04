import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const secret = process.env.VERIFICATION_SECRET;
if (!secret) throw new Error('executive_chat_health_secret_missing');
let convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
if (!convexUrl) {
  const baseUrl = (process.env.E2E_BASE_URL ?? process.env.RELEASE_BASE_URL ?? '').replace(/\/$/, '');
  if (!baseUrl) throw new Error('executive_chat_health_convex_url_missing');
  const response = await fetch(`${baseUrl}/api/internal/release-manifest`, { headers: { authorization: `Bearer ${secret}` } });
  if (!response.ok) throw new Error(`executive_chat_health_manifest_http_${response.status}`);
  convexUrl = (await response.json()).convexUrl;
}
if (!convexUrl) throw new Error('executive_chat_health_convex_url_missing');

const client = new ConvexHttpClient(convexUrl);
const health = await client.mutation(anyApi.executiveChatOperations.auditForRelease, {
  secret,
  environment: process.env.EXEC_CHAT_ENVIRONMENT === 'preview' ? 'preview' : 'production',
});
process.stdout.write(`${JSON.stringify(health, null, 2)}\n`);
if (health.hardStopCodes.length > 0) process.exitCode = 1;
if (process.env.FAIL_ON_SOFT_STOP === 'true' && health.softStopCodes.length > 0) process.exitCode = 1;
