export const MOBILE_SUPPORTED_WIDTHS = [320, 360, 375, 390, 414, 430] as const;

export const MOBILE_LANDSCAPE_VIEWPORT = {
  width: 667,
  height: 375,
} as const;

export const MOBILE_SAFE_AREA_BOTTOM_PADDING =
  'pb-[calc(env(safe-area-inset-bottom)+12px)]';

export const MOBILE_PRIMARY_FLOW_ROUTES = [
  '/case/[caseId]/workspace',
  '/case/[caseId]/docuvault',
  '/case/[caseId]/docuvault/preview',
] as const;

export const MOBILE_UTILITY_ROUTES = [
  '/case/[caseId]/facts',
  '/case/[caseId]/timeline',
  '/case/[caseId]/evidence',
  '/case/[caseId]/messages',
  '/case/[caseId]/reports',
  '/case/[caseId]/settings',
] as const;

const sensitiveMetadataKeys = [
  'text',
  'body',
  'content',
  'message',
  'documentText',
  'caseText',
  'sourceText',
  'raw',
  'fileBytes',
] as const;

/** True when a viewport width is part of the required mobile QA contract. */
export function isSupportedMobileWidth(width: number) {
  return MOBILE_SUPPORTED_WIDTHS.includes(width as (typeof MOBILE_SUPPORTED_WIDTHS)[number]);
}

/** Bucket a viewport width into the contract's mobile QA groups. */
export function getMobileWidthBucket(width: number) {
  if (width <= 320) return '320';
  if (width <= 360) return '360';
  if (width <= 375) return '375';
  if (width <= 390) return '390';
  if (width <= 414) return '414';
  if (width <= 430) return '430';
  return '431_plus';
}

/** Verify analytics metadata does not contain obvious sensitive case text fields. */
export function assertMobileAnalyticsMetadataSafe(metadata: Record<string, unknown>) {
  const unsafeKey = Object.keys(metadata).find((key) => (
    sensitiveMetadataKeys.some((sensitiveKey) => (
      key.toLowerCase().includes(sensitiveKey.toLowerCase())
    ))
  ));
  if (unsafeKey) {
    throw new Error(`Mobile analytics metadata cannot include sensitive field: ${unsafeKey}`);
  }
}

/** Build the route/viewport matrix used for mobile visual QA. */
export function getMobileRouteViewportMatrix(routes: readonly string[]) {
  return routes.flatMap((route) => (
    MOBILE_SUPPORTED_WIDTHS.map((width) => ({ route, width }))
  ));
}
