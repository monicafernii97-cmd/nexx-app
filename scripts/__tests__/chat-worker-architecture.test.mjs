import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workerPath = new URL('../../convex/chatWorker.ts', import.meta.url);
const runtimePath = new URL('../../convex/chatGenerationRuntime.ts', import.meta.url);

test('chat worker remains a thin Convex registration layer', async () => {
  const source = await readFile(workerPath, 'utf8');

  assert.ok(source.split(/\r?\n/).length <= 40);
  assert.match(source, /handler:\s*persistConversationMemoryRuntime/);
  assert.match(source, /handler:\s*processChatGenerationJobRuntime/);
  assert.doesNotMatch(source, /new OpenAI|responses\.create|classifyMessage|routeMode/);
});

test('generation runtime delegates Phase 2 decisions to independent modules', async () => {
  const source = await readFile(runtimePath, 'utf8');

  for (const dependency of [
    'conversation/kernel',
    'conversation/modelPolicy',
    'conversation/budgetPolicy',
    'response/outcomeVerifier',
    'orchestration/featureFlags',
    'capabilities/documentCapabilityLedger',
  ]) {
    assert.match(source, new RegExp(dependency.replace('/', '\\/')));
  }
  assert.match(source, /recordToolCallReceipt/);
  assert.match(source, /commitVerifiedResponse/);
});
