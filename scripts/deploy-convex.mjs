import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { previewDeployKeyAfterTransfer } from './lib/convex-transfer-routing.mjs';

const require = createRequire(import.meta.url);
const packagePath = require.resolve('convex/package.json');
const cliPath = path.join(path.dirname(packagePath), 'bin', 'main.js');
const env = { ...process.env };
if (env.CONVEX_DEPLOY_KEY) {
  env.CONVEX_DEPLOY_KEY = previewDeployKeyAfterTransfer(env.CONVEX_DEPLOY_KEY, env.VERCEL_ENV);
}
// The credential stays in the child environment, never arguments or logs.
const result = spawnSync(process.execPath, [cliPath, 'deploy', ...process.argv.slice(2)], { env, stdio: 'inherit' });
if (result.error) console.error('Unable to start the installed Convex CLI.');
process.exit(result.status ?? 1);
