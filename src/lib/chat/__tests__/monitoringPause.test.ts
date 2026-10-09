// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });
const paused = ['audit recent chat upload failures', 'run production chat upload canary', 'audit production chat upload canary', 'run executive chat quality canary', 'audit executive chat quality canary', 'snapshot executive chat rollout health'];
const preserved = ['recover stale chat generation jobs', 'reap stale export runs', 'clean up stale chat uploads', 'clean up fallback upload tickets', 'clean up resumable chat uploads', 'clean up direct response-loss orphans', 'clean up stale chat upload drafts', 'clean up abandoned synthetic upload runs'];
it.each([undefined, 'false'])('pauses monitoring with flag %s while preserving operational jobs', async (value) => {
  vi.stubEnv('BACKGROUND_MONITORING_ENABLED', value);
  vi.stubEnv('CONVEX_SITE_URL', 'https://blessed-rabbit-457.convex.site');
  vi.resetModules();
  const { default: crons } = await import('../../../../convex/crons');
  const jobs = JSON.parse((crons as unknown as { export(): string }).export());
  for (const name of paused) expect(jobs).not.toHaveProperty(name);
  for (const name of preserved) expect(jobs).toHaveProperty(name);
});
it('can explicitly resume monitoring without changing operational jobs', async () => {
  vi.stubEnv('BACKGROUND_MONITORING_ENABLED', 'true');
  vi.stubEnv('CONVEX_SITE_URL', 'https://blessed-rabbit-457.convex.site');
  vi.stubEnv('CHAT_UPLOAD_CANARY_ENABLED', 'true');
  vi.stubEnv('CHAT_QUALITY_CANARY_ENABLED', 'true');
  vi.resetModules();
  const { default: crons } = await import('../../../../convex/crons');
  const jobs = JSON.parse((crons as unknown as { export(): string }).export());
  for (const name of [...paused, ...preserved]) expect(jobs).toHaveProperty(name);
});
