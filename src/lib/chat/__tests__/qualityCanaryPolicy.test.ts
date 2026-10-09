import { afterEach, describe, expect, it, vi } from 'vitest';
import { qualityCanaryEnabled } from '../../../../convex/lib/chatQualityCanaryPolicy';
import { auditExecutiveChatCanary, runExecutiveChatCanary } from '../../../../convex/chatQualityCanary';
import { audit as auditProductionHealth } from '../../../../convex/executiveChatOperations';
import { isProductionDeployment } from '../../../../convex/lib/chatUploadCanaryPolicy';

const handler = (registered: unknown) => (registered as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;
const now = Date.parse('2026-10-09T00:00:00Z');
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('chat quality monitoring deployment policy', () => {
  it('keeps production enabled independently of upload monitoring', () => {
    const env = { CONVEX_SITE_URL: 'https://blessed-rabbit-457.convex.site', CHAT_UPLOAD_CANARY_ENABLED: 'false' };
    expect(qualityCanaryEnabled(env, now)).toBe(true);
    expect(qualityCanaryEnabled({ ...env, CHAT_QUALITY_CANARY_ENABLED: 'false' }, now)).toBe(false);
  });

  it('requires its own expiring preview window', () => {
    const env = { CONVEX_SITE_URL: 'https://preview.convex.site', CHAT_QUALITY_CANARY_ENABLED: 'true' };
    expect(qualityCanaryEnabled({}, now)).toBe(false);
    expect(qualityCanaryEnabled(env, now)).toBe(false);
    expect(qualityCanaryEnabled({ ...env, CHAT_UPLOAD_CANARY_PREVIEW_UNTIL: new Date(now + 60_000).toISOString() }, now)).toBe(false);
    expect(qualityCanaryEnabled({ ...env, CHAT_QUALITY_CANARY_PREVIEW_UNTIL: new Date(now + 60_000).toISOString() }, now)).toBe(true);
    for (const until of ['invalid', new Date(now).toISOString(), new Date(now + 25 * 60 * 60_000).toISOString()]) {
      expect(qualityCanaryEnabled({ ...env, CHAT_QUALITY_CANARY_PREVIEW_UNTIL: until }, now)).toBe(false);
    }
  });

  it.each(['', '2020-01-01T00:00:00Z'])('disabled or expired previews do no database work (%s)', async (until) => {
    vi.stubEnv('CONVEX_SITE_URL', 'https://preview.convex.site');
    vi.stubEnv('CONVEX_CLOUD_URL', '');
    vi.stubEnv('CHAT_QUALITY_CANARY_ENABLED', 'true');
    vi.stubEnv('CHAT_QUALITY_CANARY_PREVIEW_UNTIL', until);
    // No db is supplied: an accidental read or write fails this regression test.
    expect(await handler(runExecutiveChatCanary)({}, {})).toEqual({ skipped: true });
    expect(await handler(auditExecutiveChatCanary)({}, {})).toEqual({ disabled: true });
    expect(await handler(auditProductionHealth)({}, {})).toEqual({ disabled: true });
  });

  it('production health snapshots remain independent of both canary switches', () => {
    expect(isProductionDeployment({ CONVEX_SITE_URL: 'https://blessed-rabbit-457.convex.site', CHAT_UPLOAD_CANARY_ENABLED: 'false', CHAT_QUALITY_CANARY_ENABLED: 'false' })).toBe(true);
    expect(isProductionDeployment({ CONVEX_SITE_URL: 'invalid' })).toBe(false);
    expect(isProductionDeployment({ CONVEX_SITE_URL: 'https://blessed-rabbit-457.convex.site.attacker.test' })).toBe(false);
  });

  it('still executes and records the complete production invariant matrix', async () => {
    vi.stubEnv('CONVEX_SITE_URL', 'https://blessed-rabbit-457.convex.site');
    vi.stubEnv('CHAT_QUALITY_CANARY_ENABLED', '');
    const db = { insert: vi.fn().mockResolvedValue('quality-run'), patch: vi.fn() };
    expect(await handler(runExecutiveChatCanary)({ db }, {})).toMatchObject({ runId: 'quality-run', succeeded: true, failedInvariantCodes: [] });
    expect(db.patch.mock.calls.at(-1)?.[1]).toMatchObject({ status: 'succeeded', phase: 'complete' });
  });
});
