import { uploadCanaryEnabled } from './chatUploadCanaryPolicy';

/** Share deployment/window validation, but keep quality monitoring independent. */
export function qualityCanaryEnabled(env: Record<string, string | undefined>, now = Date.now()) {
  return uploadCanaryEnabled({
    CONVEX_SITE_URL: env.CONVEX_SITE_URL,
    CONVEX_CLOUD_URL: env.CONVEX_CLOUD_URL,
    CHAT_UPLOAD_CANARY_ENABLED: env.CHAT_QUALITY_CANARY_ENABLED,
    CHAT_UPLOAD_CANARY_PREVIEW_UNTIL: env.CHAT_QUALITY_CANARY_PREVIEW_UNTIL,
  }, now);
}
