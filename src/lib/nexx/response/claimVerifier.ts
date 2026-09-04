import type { CapabilityDecision, DocumentCapabilitySnapshot } from '../capabilities/types';
import type { TurnExecutionPlan } from '../orchestration/types';
import { assessGenericAnswer } from '../legal-engine/genericAnswerPolicy';

export type ClaimVerificationError =
  | 'RESP_MISSING_DIRECT_ANSWER'
  | 'RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE'
  | 'RESP_UNSUPPORTED_PROPOSITION'
  | 'RESP_CITATION_MISMATCH'
  | 'RESP_FALSE_UNREADABLE_CLAIM'
  | 'RESP_FALSE_EXHAUSTIVE_CLAIM'
  | 'RESP_WRONG_TASK'
  | 'RESP_UNRESOLVED_REFERENT'
  | 'RESP_INTERNAL_PAYLOAD'
  | 'RESP_STALE_FOCUS'
  | 'RESP_DOCUMENT_ANALYSIS_ON_SOCIAL_TURN'
  | 'RESP_AWAITED_INPUT_NOT_ACKNOWLEDGED'
  | 'RESP_HISTORICAL_DOCUMENT_WHILE_AWAITING_UPLOAD'
  | 'RESP_FALSE_ACTION_COMPLETION'
  | 'RESP_SPEECH_ACT_MISMATCH'
  | 'RESP_ROUTE_INAPPROPRIATE'
  | 'RESP_UNREQUESTED_DOCUMENT_USE'
  | 'RESP_FUTURE_ACTION_EXECUTED_EARLY'
  | 'RESP_INTENT_NOT_FULFILLED'
  | 'RESP_GENERIC_MULTI_SENTENCE'
  | 'RESP_FALLBACK_NOT_CONTEXTUAL'
  | 'RESP_WRONG_DOCUMENT_SCOPE'
  | 'RESP_SELF_ASSESSMENT_WITHOUT_INSPECTION';

export type ClaimVerificationResult = {
  passed: boolean;
  errors: ClaimVerificationError[];
  checks: {
    responsiveness: boolean;
    evidence: boolean;
    capabilityClaims: boolean;
    continuity: boolean;
    contradictions: boolean;
    safety: boolean;
    internalPayload: boolean;
  };
  diagnostics: {
    genericSentenceCount: number;
    paddingSentenceCount: number;
    limitationSentenceCount: number;
    substantiveSentenceCount: number;
    genericReasonCodes: string[];
    speechAct?: string;
    requestedOperation?: string;
  };
};

const UNREADABLE_CLAIM = /\b(?:do\s+not|don't|cannot|can't|unable\s+to)\s+(?:currently\s+)?(?:read|access|see|search|open)\b.{0,100}\b(?:file|order|document|pdf|text|pages?)\b|\bdo\s+not\s+(?:currently\s+)?have\b.{0,80}\b(?:readable\s+(?:access|page\s+text)|(?:file|document|order|pdf)\s+(?:text|content))\b/i;
const EXHAUSTIVE_CLAIM = /\b(?:reviewed|checked|read|analy[sz]ed)\s+(?:the\s+)?(?:entire|whole|complete|full)\b|\bno\s+other\s+(?:relevant|controlling|applicable)\s+(?:language|provision|clause)\b/i;
const GENERIC = /^(?:this (?:order|document) contains the following relevant provisions\.?|here (?:is|are) (?:the|some) relevant (?:information|details|provisions)\.?|i can help (?:you )?with that\.?)$/i;
const INTERNAL_PAYLOAD = /(?:"(?:legalInterpretation|agenticOutcome|responseCompositionTrace|artifacts)"\s*:|<\/?(?:system|developer|assistant)>|BEGIN_INTERNAL)/i;
const DOCUMENT_ANALYSIS_CLAIM = /\b(?:according to|based on|under) (?:the|your|this|that) (?:order|document|file|pdf)\b|\b(?:the|your|this|that) (?:order|document|file|pdf) (?:says|states|contains|requires|provides|shows|means)\b|\b(?:file|document|order) (?:reference|name|text|pages?)\b|\b(?:controlling|applicable|relevant) (?:clause|provision|language)\b|\[(?:p|pp)\.\s*\d+/i;
const DOCUMENT_CONTEXT_MENTION = /\b(?:order|document|file|pdf|attachment|upload|pages?|clause|provision)\b/i;
const INPUT_WAIT_ACKNOWLEDGMENT = /\b(?:upload|re[- ]?upload|attach|send|provide)\b|\b(?:when|once) (?:it|you|the (?:file|document|order))\b/i;
const HISTORICAL_DOCUMENT_WORK = /\b(?:review|analy[sz]e|extract|read|process|check|use)\b.{0,60}\b(?:the\s+)?(?:existing|previous|prior|old|historical|current|available|uploaded|saved)?\s*(?:order|document|file|pdf)\b/i;
const ACTION_COMPLETION_CLAIM = /\b(?:i|we)(?:'ve| have)? (?:now )?(?:reviewed|analy[sz]ed|extracted|read|processed|completed|finished|checked)\b|\b(?:the\s+)?(?:review|analysis|extraction|processing|check)\s+(?:is|was|has been)\s+(?:complete|completed|finished|done)\b/i;
const SELF_ASSESSMENT_CLAIM = /\b(?:i|we)\s+(?:checked|rechecked|reassessed|inspected|reviewed|looked\s+again)\b/i;

export function verifyResponseClaims(args: {
  content: string;
  plan: TurnExecutionPlan;
  capabilitySnapshot: DocumentCapabilitySnapshot;
  capabilityDecision: CapabilityDecision;
  evidenceIds: string[];
  expectedFocusRevision: number;
  currentFocusRevision: number;
  supportedPropositions?: string[];
  supportedPropositionSource?: 'pre_generation_contract' | 'tool_receipt' | 'authorized_evidence';
  requiresDirectAnswer?: boolean;
  unresolvedReferent?: boolean;
  publicationV2?: boolean;
  speechAct?: string;
  requestedOperation?: string;
  citationVerificationPassed?: boolean;
  usedDocumentIds?: string[];
  selfCorrectionV2?: boolean;
  inspectionReceiptId?: string;
}) : ClaimVerificationResult {
  const content = args.content.trim();
  const errors: ClaimVerificationError[] = [];
  const readable = args.capabilitySnapshot.documents.some((document) =>
    document.authorized && (document.textExtracted || document.chunksAvailable));
  const exhaustiveReady = args.capabilitySnapshot.documents.length > 0 && args.capabilitySnapshot.documents.every((document) =>
    document.authorized && document.coverageStatus === 'complete' && document.fullDocumentReviewStatus === 'ready');

  if (args.requiresDirectAnswer && args.speechAct !== 'social' && content.length < 20) {
    errors.push('RESP_MISSING_DIRECT_ANSWER');
  }
  const genericAssessment = assessGenericAnswer(content);
  const generic = args.publicationV2 ? genericAssessment.isGeneric : GENERIC.test(content);
  if (generic && (args.evidenceIds.length > 0 || args.requiresDirectAnswer)) {
    errors.push('RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE');
    if (genericAssessment.sentenceCount > 1) errors.push('RESP_GENERIC_MULTI_SENTENCE');
    if (genericAssessment.paddingSentenceCount > 0 || genericAssessment.limitationSentenceCount > 0) {
      errors.push('RESP_FALLBACK_NOT_CONTEXTUAL');
    }
  }
  if (UNREADABLE_CLAIM.test(content) && readable && args.capabilityDecision.prohibitedClaims.includes('file_unreadable')) errors.push('RESP_FALSE_UNREADABLE_CLAIM');
  if (EXHAUSTIVE_CLAIM.test(content) && !exhaustiveReady) errors.push('RESP_FALSE_EXHAUSTIVE_CLAIM');
  if (args.plan.evidenceRequirements.includes('relevant_source_unit') && args.evidenceIds.length === 0 && args.capabilityDecision.allowed) errors.push('RESP_CITATION_MISMATCH');
  if (args.publicationV2 && args.citationVerificationPassed === false) {
    errors.push('RESP_CITATION_MISMATCH');
  }
  if (args.publicationV2 && (args.usedDocumentIds?.length ?? 0) > 0) {
    const selectedDocumentIds = new Set(args.plan.selectedDocumentIds.map(String));
    if (args.usedDocumentIds?.some((documentId) => !selectedDocumentIds.has(documentId))) {
      errors.push('RESP_WRONG_DOCUMENT_SCOPE', 'RESP_UNREQUESTED_DOCUMENT_USE');
    }
  }
  if (args.expectedFocusRevision !== args.currentFocusRevision) errors.push('RESP_STALE_FOCUS');
  if (args.unresolvedReferent && args.plan.responseAct !== 'clarify') errors.push('RESP_UNRESOLVED_REFERENT');
  if (INTERNAL_PAYLOAD.test(content)) errors.push('RESP_INTERNAL_PAYLOAD');

  if (args.publicationV2 && args.speechAct === 'social' && (
    DOCUMENT_CONTEXT_MENTION.test(content) || DOCUMENT_ANALYSIS_CLAIM.test(content)
  )) {
    errors.push('RESP_DOCUMENT_ANALYSIS_ON_SOCIAL_TURN', 'RESP_SPEECH_ACT_MISMATCH', 'RESP_UNREQUESTED_DOCUMENT_USE');
  }
  if (args.publicationV2 && args.requestedOperation === 'await_upload') {
    if (!INPUT_WAIT_ACKNOWLEDGMENT.test(content)) {
      errors.push('RESP_AWAITED_INPUT_NOT_ACKNOWLEDGED', 'RESP_INTENT_NOT_FULFILLED');
    }
    if (
      DOCUMENT_ANALYSIS_CLAIM.test(content) ||
      HISTORICAL_DOCUMENT_WORK.test(content) ||
      UNREADABLE_CLAIM.test(content)
    ) {
      errors.push(
        'RESP_HISTORICAL_DOCUMENT_WHILE_AWAITING_UPLOAD',
        'RESP_ROUTE_INAPPROPRIATE',
        'RESP_UNREQUESTED_DOCUMENT_USE',
      );
    }
    if (ACTION_COMPLETION_CLAIM.test(content)) {
      errors.push('RESP_FALSE_ACTION_COMPLETION', 'RESP_FUTURE_ACTION_EXECUTED_EARLY');
    }
  }
  if (
    args.selfCorrectionV2 &&
    ['challenge', 'correct', 'reassess'].includes(args.speechAct ?? '') &&
    SELF_ASSESSMENT_CLAIM.test(content) &&
    !args.inspectionReceiptId
  ) {
    errors.push('RESP_SELF_ASSESSMENT_WITHOUT_INSPECTION');
  }

  const normalizedSupported = args.supportedPropositionSource
    ? (args.supportedPropositions ?? []).map((item) => item.toLowerCase().replace(/\s+/g, ' ').trim())
    : [];
  if ((args.supportedPropositions?.length ?? 0) > 0 && !args.supportedPropositionSource) {
    errors.push('RESP_UNSUPPORTED_PROPOSITION');
  }
  if (normalizedSupported.length > 0 && args.plan.responseAct === 'answer') {
    const normalizedContent = content.toLowerCase().replace(/\s+/g, ' ');
    const hasSupported = normalizedSupported.some((proposition) => proposition.length >= 12 && normalizedContent.includes(proposition));
    if (!hasSupported && content.length > 80) errors.push('RESP_UNSUPPORTED_PROPOSITION');
  }

  const uniqueErrors = Array.from(new Set(errors));
  const has = (error: ClaimVerificationError) => uniqueErrors.includes(error);
  return {
    passed: uniqueErrors.length === 0,
    errors: uniqueErrors,
    checks: {
      responsiveness: !has('RESP_MISSING_DIRECT_ANSWER') &&
        !has('RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE') &&
        !has('RESP_GENERIC_MULTI_SENTENCE') &&
        !has('RESP_FALLBACK_NOT_CONTEXTUAL') &&
        !has('RESP_INTENT_NOT_FULFILLED') &&
        !has('RESP_AWAITED_INPUT_NOT_ACKNOWLEDGED'),
      evidence: !has('RESP_UNSUPPORTED_PROPOSITION') && !has('RESP_CITATION_MISMATCH'),
      capabilityClaims: !has('RESP_FALSE_UNREADABLE_CLAIM') && !has('RESP_FALSE_EXHAUSTIVE_CLAIM'),
      continuity: !has('RESP_WRONG_TASK') &&
        !has('RESP_UNRESOLVED_REFERENT') &&
        !has('RESP_STALE_FOCUS') &&
        !has('RESP_SPEECH_ACT_MISMATCH') &&
        !has('RESP_ROUTE_INAPPROPRIATE') &&
        !has('RESP_UNREQUESTED_DOCUMENT_USE') &&
        !has('RESP_WRONG_DOCUMENT_SCOPE') &&
        !has('RESP_DOCUMENT_ANALYSIS_ON_SOCIAL_TURN') &&
        !has('RESP_HISTORICAL_DOCUMENT_WHILE_AWAITING_UPLOAD'),
      contradictions: !has('RESP_UNSUPPORTED_PROPOSITION') &&
        !has('RESP_FALSE_ACTION_COMPLETION') &&
        !has('RESP_FUTURE_ACTION_EXECUTED_EARLY') &&
        !has('RESP_SELF_ASSESSMENT_WITHOUT_INSPECTION'),
      safety: true,
      internalPayload: !has('RESP_INTERNAL_PAYLOAD'),
    },
    diagnostics: {
      genericSentenceCount: genericAssessment.genericSentenceCount,
      paddingSentenceCount: genericAssessment.paddingSentenceCount,
      limitationSentenceCount: genericAssessment.limitationSentenceCount,
      substantiveSentenceCount: genericAssessment.substantiveSentenceCount,
      genericReasonCodes: genericAssessment.reasonCodes,
      speechAct: args.speechAct,
      requestedOperation: args.requestedOperation,
    },
  };
}
