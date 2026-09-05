import { assessGenericAnswer } from '../legal-engine/genericAnswerPolicy';

export type RecoveryPublicationCode =
  | 'context_unavailable'
  | 'provider_unavailable'
  | 'worker_interrupted'
  | 'validation_exhausted';

export type RecoveryConversationContext = {
  latestUserMessage: string;
  speechAct?: string;
  requestedOperation?: string;
  documentContextActive: boolean;
};

const GREETING_ONLY = /^(?:hi|hey|hello|hiya|howdy|good\s+(?:morning|afternoon|evening))[!.?\s]*$/i;

function contextKind(context: RecoveryConversationContext) {
  if (context.requestedOperation === 'await_upload' || /\b(?:i(?:'ll| will)?|let me)\s+(?:re-?upload|upload|attach)\b/i.test(context.latestUserMessage)) {
    return 'await_upload' as const;
  }
  if (context.speechAct === 'social' || GREETING_ONLY.test(context.latestUserMessage.trim())) {
    return 'social' as const;
  }
  return context.documentContextActive ? 'document' as const : 'general' as const;
}

export function buildContextualRecoveryContent(args: {
  recoveryCode: RecoveryPublicationCode;
  context: RecoveryConversationContext;
}) {
  const kind = contextKind(args.context);
  if (kind === 'social') return 'Hi! What would you like help with?';
  if (kind === 'await_upload') {
    return 'Understood—upload the new file when you’re ready. Once it arrives, I’ll perform a fresh extraction and review that upload.';
  }
  if (kind === 'document') {
    if (args.recoveryCode === 'validation_exhausted') {
      return 'I retrieved the order, but I could not verify a complete answer. The saved evidence is intact, so you can retry this response without uploading the file again.';
    }
    if (args.recoveryCode === 'context_unavailable') {
      return 'I could not safely reload the order context for this turn. The file is still saved, so retry this response; you do not need to upload it again.';
    }
    return 'I retrieved the order, but the analysis was interrupted before I could verify the answer. The saved evidence is intact, so retry this response; you do not need to upload it again.';
  }
  if (args.recoveryCode === 'validation_exhausted') {
    return 'I completed a draft response, but I could not verify it well enough to publish. Retry this response and I’ll reassess it from the saved conversation state.';
  }
  return 'I saved your message, but the response was interrupted before I could verify it. Retry this response and I’ll continue from the saved conversation state.';
}

export function assessRecoveryPublication(args: {
  content: string;
  context: RecoveryConversationContext;
}) {
  const kind = contextKind(args.context);
  const lower = args.content.toLowerCase();
  const rejectionCodes: string[] = [];
  if (args.content.trim().length < 12) rejectionCodes.push('recovery_too_short');
  if (/\b(?:source[_ ]?id|chunk[_ ]?id|provider[_ ]?response[_ ]?id|backend|raw json|validator)\b/i.test(args.content)) {
    rejectionCodes.push('recovery_internal_language');
  }
  if (kind === 'social' && /\b(?:document|order|upload|retry|interrupted|error|failed)\b/i.test(args.content)) {
    rejectionCodes.push('recovery_social_context_mismatch');
  }
  if (kind === 'await_upload' && (!/\bupload\b/i.test(args.content) || /\b(?:historical|previous)\s+(?:document|order)\b/i.test(args.content))) {
    rejectionCodes.push('recovery_await_upload_context_mismatch');
  }
  if ((kind === 'social' || kind === 'general') && /\b(?:the |signed )?order\b/i.test(args.content)) {
    rejectionCodes.push('recovery_unrequested_document_reference');
  }
  const genericAssessment = assessGenericAnswer(args.content);
  if (genericAssessment.isGeneric) rejectionCodes.push('recovery_generic_answer');
  if (/\b(?:i am|i’m|i'm) retrying\b/i.test(lower)) {
    rejectionCodes.push('recovery_claims_unscheduled_retry');
  }
  return {
    passed: rejectionCodes.length === 0,
    contextKind: kind,
    rejectionCodes,
    genericAssessment,
  };
}
