import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyExecutiveChatRelease } from '../lib/executive-chat-release.mjs';
import fs from 'node:fs';

const base = {
  environment: 'production', gitSha: 'abcdef1234567', schemaVersion: '1.0.0',
  compatibleMinPeerVersion: '1.0.0', controlVersion: 'executive-orchestration-v1',
  capabilityVersion: 'document-capability-v1', validatorVersion: 'response-publication-v1',
  promptPolicyVersion: 'exec-chat-prompt-v1',
};

test('compatible independently sourced manifests pass promotion', () => {
  assert.deepEqual(verifyExecutiveChatRelease({ ...base, runtime: 'web' }, { ...base, runtime: 'convex' }), { compatible: true, reasonCodes: [] });
});

test('deployment drift blocks promotion', () => {
  const result = verifyExecutiveChatRelease({ ...base, runtime: 'web' }, { ...base, runtime: 'convex', gitSha: '9999999' });
  assert.equal(result.compatible, false);
  assert.ok(result.reasonCodes.includes('git_sha_mismatch'));
});

test('preview deployment can omit the production-only release secret', () => {
  const script = fs.readFileSync(new URL('../publish-executive-chat-release.mjs', import.meta.url), 'utf8');
  assert.match(script, /VERCEL_ENV !== 'production'/);
  assert.match(script, /Preview manifest skipped/);
});
