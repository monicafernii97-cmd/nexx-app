import { describe, expect, it } from 'vitest';
import {
  MOBILE_PRIMARY_FLOW_ROUTES,
  MOBILE_SUPPORTED_WIDTHS,
  MOBILE_UTILITY_ROUTES,
  assertMobileAnalyticsMetadataSafe,
  getMobileRouteViewportMatrix,
  getMobileWidthBucket,
  isSupportedMobileWidth,
} from './mobileContractQa';

describe('mobile interaction contract QA helpers', () => {
  it('recognizes every required mobile viewport width', () => {
    expect(MOBILE_SUPPORTED_WIDTHS).toEqual([320, 360, 375, 390, 414, 430]);
    for (const width of MOBILE_SUPPORTED_WIDTHS) {
      expect(isSupportedMobileWidth(width)).toBe(true);
    }
    expect(isSupportedMobileWidth(431)).toBe(false);
  });

  it('buckets widths according to the mobile QA contract', () => {
    expect(getMobileWidthBucket(320)).toBe('320');
    expect(getMobileWidthBucket(360)).toBe('360');
    expect(getMobileWidthBucket(375)).toBe('375');
    expect(getMobileWidthBucket(390)).toBe('390');
    expect(getMobileWidthBucket(414)).toBe('414');
    expect(getMobileWidthBucket(430)).toBe('430');
    expect(getMobileWidthBucket(500)).toBe('431_plus');
  });

  it('builds a route and viewport matrix for primary and utility mobile routes', () => {
    const matrix = getMobileRouteViewportMatrix([
      ...MOBILE_PRIMARY_FLOW_ROUTES,
      ...MOBILE_UTILITY_ROUTES,
    ]);
    expect(matrix).toHaveLength(
      (MOBILE_PRIMARY_FLOW_ROUTES.length + MOBILE_UTILITY_ROUTES.length)
        * MOBILE_SUPPORTED_WIDTHS.length,
    );
    expect(matrix).toContainEqual({
      route: '/case/[caseId]/workspace',
      width: 320,
    });
    expect(matrix).toContainEqual({
      route: '/case/[caseId]/settings',
      width: 430,
    });
  });

  it('rejects analytics metadata keys that could contain sensitive case text', () => {
    expect(() => assertMobileAnalyticsMetadataSafe({
      caseId: 'case_123',
      draftId: 'draft_123',
      contentLength: 240,
      contextType: 'workspace',
      status: 'ready',
    })).not.toThrow();

    expect(() => assertMobileAnalyticsMetadataSafe({
      caseId: 'case_123',
      messageText: 'sensitive source text',
    })).toThrow(/sensitive field/i);

    expect(() => assertMobileAnalyticsMetadataSafe({
      caseId: 'case_123',
      sourceText: 'sensitive source text',
    })).toThrow(/sensitive field/i);
  });
});
