import assert from 'node:assert/strict';
import test from 'node:test';
import { previewDeployKeyAfterTransfer } from '../lib/convex-transfer-routing.mjs';

test('the transferred preview project retains its exact secret and gets the current team route', () => {
  const key = 'preview:monica-fernandez:nexx|fixture-secret';
  assert.equal(previewDeployKeyAfterTransfer(key, 'preview'), 'preview:monica-estimon-39537:nexx|fixture-secret');
  assert.equal(previewDeployKeyAfterTransfer(key, 'production'), key);
});

test('production, unrelated, absent and already migrated credentials remain unchanged', () => {
  for (const key of [undefined, '', 'prod:blessed-rabbit-457|fixture', 'preview:other:nexx|fixture', 'preview:monica-fernandez:other|fixture', 'preview:monica-estimon-39537:nexx|fixture']) {
    assert.equal(previewDeployKeyAfterTransfer(key, 'preview'), key);
  }
});
