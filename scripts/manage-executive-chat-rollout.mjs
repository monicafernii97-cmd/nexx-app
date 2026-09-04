import fs from 'node:fs';
import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const [operation, target] = process.argv.slice(2);
const secret = process.env.VERIFICATION_SECRET;
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
if (!secret) throw new Error('rollout_secret_missing');
if (!convexUrl) throw new Error('rollout_convex_url_missing');
if (!operation || !target) throw new Error('usage: manage-executive-chat-rollout <propose|approve|activate|disable> <config-file|config-id>');
const client = new ConvexHttpClient(convexUrl);

let result;
if (operation === 'propose') {
  const proposal = JSON.parse(fs.readFileSync(target, 'utf8'));
  result = await client.mutation(anyApi.executiveChatRollout.propose, { secret, ...proposal });
} else {
  const actor = process.env.EXEC_CHAT_OPERATOR?.trim();
  const reason = process.env.EXEC_CHAT_CHANGE_REASON?.trim();
  if (!actor || !reason) throw new Error('EXEC_CHAT_OPERATOR and EXEC_CHAT_CHANGE_REASON are required');
  if (operation === 'approve') {
    result = await client.mutation(anyApi.executiveChatRollout.approve, { secret, configId: target, approver: actor, reason });
  } else if (operation === 'activate') {
    result = await client.mutation(anyApi.executiveChatRollout.activate, { secret, configId: target, actor, reason });
  } else if (operation === 'disable') {
    result = await client.mutation(anyApi.executiveChatRollout.emergencyDisable, { secret, configId: target, actor, reason });
  } else {
    throw new Error(`unsupported_rollout_operation:${operation}`);
  }
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
