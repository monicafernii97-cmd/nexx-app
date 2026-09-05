export const DURABLE_REVIEW_VERSION = 'dur_v2';
export const DURABLE_REVIEW_MODEL = 'gpt-5.4';
export const DURABLE_REVIEW_MAP_BATCH_SIZE = 6;
export const DURABLE_REVIEW_REDUCE_BATCH_SIZE = 6;

export const DURABLE_REVIEW_RESTART_CONFIRMATION = 'AUTHORIZE_DURABLE_REVIEW_RESTART';

export function validateDurableReviewRestartApproval(args: {
  operatorId: string;
  approverId: string;
  approvalId: string;
  approvalReason: string;
}) {
  if (!args.operatorId.trim() || !args.approverId.trim()) throw new Error('durable_review_actor_missing');
  if (args.operatorId.trim() === args.approverId.trim()) throw new Error('durable_review_separation_of_duties_required');
  if (!args.approvalId.trim()) throw new Error('durable_review_approval_id_missing');
  if (args.approvalReason.trim().length < 12) throw new Error('durable_review_approval_reason_too_short');
}
