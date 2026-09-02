import fs from 'node:fs';
import { verifyExecutiveChatRelease } from './lib/executive-chat-release.mjs';

function readJson(path, envName) {
  const raw = path ? fs.readFileSync(path, 'utf8') : process.env[envName];
  if (!raw) throw new Error(`${envName.toLowerCase()}_missing`);
  return JSON.parse(raw);
}

const web = readJson(process.argv[2], 'WEB_RELEASE_MANIFEST_JSON');
const convex = readJson(process.argv[3], 'CONVEX_RELEASE_MANIFEST_JSON');
const result = verifyExecutiveChatRelease(web, convex);
process.stdout.write(`${JSON.stringify(result)}\n`);
if (!result.compatible) process.exitCode = 1;

