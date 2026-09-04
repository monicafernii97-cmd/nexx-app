import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vercelConfigUrl = new URL('../../vercel.json', import.meta.url);

test('preview builds recreate isolated Convex deployments without changing production targeting', async () => {
  const config = JSON.parse(await readFile(vercelConfigUrl, 'utf8'));
  const command = config.buildCommand;

  assert.match(command, /\[ \"\$VERCEL_ENV\" = \"preview\" \]/);
  assert.match(command, /--preview-create \"\$VERCEL_GIT_COMMIT_REF\"/);
  assert.match(command, /else npx convex deploy --cmd-url-env-var-name NEXT_PUBLIC_CONVEX_URL/);
  assert.equal(command.match(/--preview-create/g)?.length, 1);
});
