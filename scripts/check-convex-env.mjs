import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PRODUCTION_DEPLOYMENT = 'blessed-rabbit-457';
const PRODUCTION_URL_HOST = 'blessed-rabbit-457.convex.cloud';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function localEnvironment(root) {
  return [
    '.env',
    '.env.development',
    '.env.local',
    '.env.development.local',
  ].reduce((values, filename) => ({ ...values, ...parseEnvFile(path.join(root, filename)) }), {});
}

export function assertSafeConvexEnvironment(values, target) {
  const isProduction = target === 'production';
  if (isProduction) return;

  const deployment = String(values.CONVEX_DEPLOYMENT ?? '').replace(/^(dev|prod):/, '');
  let host = '';
  try {
    host = values.NEXT_PUBLIC_CONVEX_URL ? new URL(values.NEXT_PUBLIC_CONVEX_URL).host : '';
  } catch {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is not a valid URL.');
  }

  if (deployment === PRODUCTION_DEPLOYMENT || host === PRODUCTION_URL_HOST) {
    throw new Error(
      `Refusing to run ${target || 'local'} code against the NEXProof production Convex deployment. ` +
      'Use a development deployment locally and a staging deployment for Vercel previews.',
    );
  }
}

export function resolveEnvironmentTarget(targetArg = 'development', vercelEnv = process.env.VERCEL_ENV) {
  return targetArg === 'build' ? (vercelEnv ?? 'development') : targetArg;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  const root = process.cwd();
  const targetArg = process.argv[2] ?? 'development';
  const target = resolveEnvironmentTarget(targetArg);
  const values = { ...localEnvironment(root), ...process.env };
  try {
    assertSafeConvexEnvironment(values, target);
    console.log(`[environment-guard] Convex target is safe for ${target}.`);
  } catch (error) {
    console.error(`[environment-guard] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
