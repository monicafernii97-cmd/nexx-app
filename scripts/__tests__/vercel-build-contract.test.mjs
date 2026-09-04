import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vercelConfigUrl = new URL('../../vercel.json', import.meta.url);
const vercelBuildUrl = new URL('../../vercel.sh', import.meta.url);

test('preview builds recreate isolated Convex deployments without changing production targeting', async () => {
  const config = JSON.parse(await readFile(vercelConfigUrl, 'utf8'));
  const script = await readFile(vercelBuildUrl, 'utf8');

  assert.equal(config.buildCommand, 'sh vercel.sh');
  assert.match(script, /\[ "\$\{VERCEL_ENV:-\}" = "preview" \]/);
  assert.match(script, /--preview-create "\$VERCEL_GIT_COMMIT_REF"/);
  assert.match(script, /VERCEL_GIT_COMMIT_REF is required/);
  assert.equal(script.match(/--preview-create/g)?.length, 1);
  assert.equal(script.match(/exec npx convex deploy/g)?.length, 2);
});
