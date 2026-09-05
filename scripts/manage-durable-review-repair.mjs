import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const [operation, operationId] = process.argv.slice(2);
const secret = process.env.VERIFICATION_SECRET;
const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
if (!secret) throw new Error('durable_review_secret_missing');
if (!convexUrl) throw new Error('durable_review_convex_url_missing');
if (!operation || !operationId) {
  throw new Error('usage: manage-durable-review-repair <inspect|authorize|apply|resume|verify|status> <operation-id>');
}

const client = new ConvexHttpClient(convexUrl);
let result;
if (operation === 'inspect') {
  const sourceRunId = process.env.DURABLE_REVIEW_SOURCE_RUN_ID?.trim();
  const uploadedFileId = process.env.DURABLE_REVIEW_UPLOADED_FILE_ID?.trim();
  const operatorId = process.env.EXEC_CHAT_OPERATOR?.trim();
  const expectedUnits = Number(process.env.DURABLE_REVIEW_EXPECTED_UNITS);
  if (!sourceRunId || !uploadedFileId || !operatorId || !Number.isInteger(expectedUnits) || expectedUnits < 1) {
    throw new Error('inspect requires DURABLE_REVIEW_SOURCE_RUN_ID, DURABLE_REVIEW_UPLOADED_FILE_ID, DURABLE_REVIEW_EXPECTED_UNITS, and EXEC_CHAT_OPERATOR');
  }
  result = await client.mutation(anyApi.durableReviewOperations.inspect, {
    secret, operationId, sourceRunId, uploadedFileId, expectedUnits, operatorId,
  });
} else if (operation === 'authorize') {
  const approverId = process.env.EXEC_CHAT_APPROVER?.trim();
  const approvalId = process.env.EXEC_CHAT_CHANGE_TICKET?.trim();
  const approvalReason = process.env.EXEC_CHAT_CHANGE_REASON?.trim();
  if (!approverId || !approvalId || !approvalReason) {
    throw new Error('authorize requires EXEC_CHAT_APPROVER, EXEC_CHAT_CHANGE_TICKET, and EXEC_CHAT_CHANGE_REASON');
  }
  result = await client.mutation(anyApi.durableReviewOperations.authorize, {
    secret, operationId, approverId, approvalId, approvalReason,
  });
} else if (operation === 'apply') {
  const operatorId = process.env.EXEC_CHAT_OPERATOR?.trim();
  const confirmation = process.env.DURABLE_REVIEW_CONFIRMATION?.trim();
  if (!operatorId || confirmation !== 'AUTHORIZE_DURABLE_REVIEW_RESTART') {
    throw new Error('apply requires EXEC_CHAT_OPERATOR and DURABLE_REVIEW_CONFIRMATION=AUTHORIZE_DURABLE_REVIEW_RESTART');
  }
  result = await client.mutation(anyApi.durableReviewOperations.apply, {
    secret, operationId, operatorId, confirmation,
  });
} else if (operation === 'resume') {
  const operatorId = process.env.EXEC_CHAT_OPERATOR?.trim();
  const confirmation = process.env.DURABLE_REVIEW_CONFIRMATION?.trim();
  if (!operatorId || confirmation !== 'AUTHORIZE_DURABLE_REVIEW_RESUME') {
    throw new Error('resume requires EXEC_CHAT_OPERATOR and DURABLE_REVIEW_CONFIRMATION=AUTHORIZE_DURABLE_REVIEW_RESUME');
  }
  result = await client.mutation(anyApi.durableReviewOperations.resume, {
    secret, operationId, operatorId, confirmation,
  });
} else if (operation === 'verify') {
  result = await client.mutation(anyApi.durableReviewOperations.verify, { secret, operationId });
} else if (operation === 'status') {
  result = await client.query(anyApi.durableReviewOperations.status, { secret, operationId });
} else {
  throw new Error(`unsupported_durable_review_operation:${operation}`);
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
