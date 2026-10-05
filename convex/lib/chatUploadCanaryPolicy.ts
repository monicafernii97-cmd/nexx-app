export const CANARY_PHASES = ['route', 'generate_url', 'post', 'metadata', 'read', 'cleanup', 'complete'] as const;
export type UploadCanaryPhase = typeof CANARY_PHASES[number];
const PRODUCTION_HOSTS = new Set(['blessed-rabbit-457.convex.site', 'blessed-rabbit-457.convex.cloud']);

export function uploadCanaryEnabled(env: Record<string, string | undefined>, now = Date.now()) {
  if (env.CHAT_UPLOAD_CANARY_ENABLED === 'false') return false;
  const url = env.CONVEX_SITE_URL || env.CONVEX_CLOUD_URL;
  let production = false;
  try { production = Boolean(url && PRODUCTION_HOSTS.has(new URL(url).hostname)); } catch { /* Unknown environment stays disabled. */ }
  if (production) return true;
  // Preview test windows must be explicit, finite and at most a day away.
  const until = Date.parse(env.CHAT_UPLOAD_CANARY_PREVIEW_UNTIL ?? '');
  return env.CHAT_UPLOAD_CANARY_ENABLED === 'true'
    && Number.isFinite(until) && until > now && until - now <= 24 * 60 * 60 * 1000;
}

export function canAdvanceCanary(current: UploadCanaryPhase, next: UploadCanaryPhase) {
  return CANARY_PHASES.indexOf(next) === CANARY_PHASES.indexOf(current) + 1;
}
