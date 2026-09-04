import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyExecutiveChatRelease } from '../lib/executive-chat-release.mjs';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

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

test('release publication is an atomic post-deployment pair operation', () => {
  const script = fs.readFileSync(new URL('../publish-executive-chat-release.mjs', import.meta.url), 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(script, /runtime !== 'pair'/);
  assert.match(script, /upsertPairFromRelease/);
  assert.equal(packageJson.scripts.postbuild, undefined);
});

test('pair assurance remains fail-closed when the shared secret is absent', () => {
  const result = spawnSync(process.execPath, ['scripts/publish-executive-chat-release.mjs', 'pair'], {
    cwd: new URL('../..', import.meta.url),
    env: { ...process.env, VERIFICATION_SECRET: '' },
    encoding: 'utf8',
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /release_manifest_secret_missing/);
});
