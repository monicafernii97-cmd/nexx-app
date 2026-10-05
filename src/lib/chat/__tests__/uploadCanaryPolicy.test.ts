import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { CANARY_PHASES, canAdvanceCanary, uploadCanaryEnabled } from '../../../../convex/lib/chatUploadCanaryPolicy';
import { advanceCanaryRun, finishCanaryRun, runProductionUploadCanary } from '../../../../convex/chatUploadCanary';

const handler = (registered: unknown) => (registered as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> })._handler;
const production = { CONVEX_SITE_URL: 'https://blessed-rabbit-457.convex.site' };
const now = Date.parse('2026-10-05T00:00:00Z');
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('upload canary environment and execution bounds', () => {
  it('preserves production monitoring and its explicit disable switch', () => {
    expect(uploadCanaryEnabled(production, now)).toBe(true);
    expect(uploadCanaryEnabled({ ...production, CHAT_UPLOAD_CANARY_ENABLED: 'false' }, now)).toBe(false);
    expect(uploadCanaryEnabled({ CONVEX_CLOUD_URL: 'https://blessed-rabbit-457.convex.cloud' }, now)).toBe(true);
  });

  it('requires explicit, short-lived preview opt-in and fails closed for unknown environments', () => {
    const preview = { CONVEX_SITE_URL: 'https://preview.convex.site', CHAT_UPLOAD_CANARY_ENABLED: 'true' };
    expect(uploadCanaryEnabled({}, now)).toBe(false);
    expect(uploadCanaryEnabled(preview, now)).toBe(false);
    expect(uploadCanaryEnabled({ ...preview, CHAT_UPLOAD_CANARY_PREVIEW_UNTIL: new Date(now + 60_000).toISOString() }, now)).toBe(true);
    for (const deadline of ['invalid', new Date(now).toISOString(), new Date(now + 25 * 60 * 60_000).toISOString()]) {
      expect(uploadCanaryEnabled({ ...preview, CHAT_UPLOAD_CANARY_PREVIEW_UNTIL: deadline }, now)).toBe(false);
    }
    expect(uploadCanaryEnabled({ CONVEX_SITE_URL: 'https://blessed-rabbit-457.convex.site.example.com' }, now)).toBe(false);
  });

  it('only permits the finite forward phase sequence', () => {
    for (let i = 0; i < CANARY_PHASES.length - 1; i++) expect(canAdvanceCanary(CANARY_PHASES[i], CANARY_PHASES[i + 1])).toBe(true);
    expect(canAdvanceCanary('read', 'post')).toBe(false);
    expect(canAdvanceCanary('route', 'complete')).toBe(false);
    expect(canAdvanceCanary('complete', 'route')).toBe(false);
  });

  it('disabled previews perform no database or provider work', async () => {
    vi.stubEnv('CONVEX_SITE_URL', 'https://preview.convex.site');
    vi.stubEnv('CONVEX_CLOUD_URL', '');
    vi.stubEnv('CHAT_UPLOAD_CANARY_ENABLED', '');
    const runMutation = vi.fn();
    expect(await handler(runProductionUploadCanary)({ runMutation }, {})).toEqual({ skipped: true });
    expect(runMutation).not.toHaveBeenCalled();
  });

  it('ignores duplicate phase writes, rejects backward/expired progress, and preserves terminal results', async () => {
    vi.stubEnv('CONVEX_SITE_URL', production.CONVEX_SITE_URL);
    vi.stubEnv('CHAT_UPLOAD_CANARY_ENABLED', 'true');
    const run = { _id: 'run', status: 'running', phase: 'post', startedAt: Date.now() };
    const db = { get: vi.fn().mockResolvedValue(run), patch: vi.fn() };
    expect(await handler(advanceCanaryRun)({ db }, { runId: 'run', phase: 'post' })).toBe(true);
    expect(await handler(advanceCanaryRun)({ db }, { runId: 'run', phase: 'route' })).toBe(false);
    expect(db.patch).not.toHaveBeenCalled();
    db.get.mockResolvedValue({ ...run, startedAt: Date.now() - 11 * 60_000 });
    expect(await handler(advanceCanaryRun)({ db }, { runId: 'run', phase: 'metadata' })).toBe(false);
    db.get.mockResolvedValue({ ...run, status: 'succeeded' });
    expect(await handler(finishCanaryRun)({ db }, { runId: 'run', status: 'failed', phase: 'post' })).toBe(false);
    expect(db.patch).not.toHaveBeenCalled();
  });

  it.each([false, true])('completes the production probe and cleans up its object (metadata failure: %s)', async (badMetadata) => {
    vi.stubEnv('CONVEX_SITE_URL', production.CONVEX_SITE_URL);
    vi.stubEnv('CHAT_UPLOAD_CANARY_ENABLED', 'true');
    const bytes = Uint8Array.from({ length: 1024 }, (_, i) => (i * 31 + 17) % 256);
    const sha = createHash('sha256').update(bytes).digest('hex');
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 204, headers: { 'access-control-allow-origin': 'https://nexproof.io' } }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ storageId: 'object' }), { headers: { 'access-control-allow-origin': '*' } }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const runMutation = vi.fn().mockResolvedValue(true).mockResolvedValueOnce({ skipped: false, runId: 'run' });
    const storage = {
      generateUploadUrl: vi.fn().mockResolvedValue('https://storage.example/upload'),
      getMetadata: vi.fn().mockResolvedValue({ size: badMetadata ? 1 : 1024, sha256: sha }),
      get: vi.fn().mockResolvedValue(new Blob([bytes])),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    expect(await handler(runProductionUploadCanary)({ runMutation, storage }, {})).toMatchObject({ skipped: false, ok: !badMetadata });
    expect(storage.delete).toHaveBeenCalledExactlyOnceWith('object');
    expect(runMutation.mock.calls.at(-1)?.[1]).toMatchObject({ cleanupSucceeded: true, status: badMetadata ? 'failed' : 'succeeded' });
    if (!badMetadata) expect(runMutation).toHaveBeenCalledTimes(7); // start, five forward phases, finish
  });
});
