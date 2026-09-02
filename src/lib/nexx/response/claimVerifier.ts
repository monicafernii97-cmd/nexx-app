import type { CapabilityDecision, DocumentCapabilitySnapshot } from '../capabilities/types';
import type { TurnExecutionPlan } from '../orchestration/types';

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
  | 'RESP_STALE_FOCUS';

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
};

const UNREADABLE_CLAIM = /\b(?:do\s+not|don't|cannot|can't|unable\s+to)\s+(?:currently\s+)?(?:read|access|see|search|open)\b.{0,100}\b(?:file|order|document|pdf|text|pages?)\b|\bdo\s+not\s+have\s+readable\s+access\b/i;
const EXHAUSTIVE_CLAIM = /\b(?:reviewed|checked|read|analy[sz]ed)\s+(?:the\s+)?(?:entire|whole|complete|full)\b|\bno\s+other\s+(?:relevant|controlling|applicable)\s+(?:language|provision|clause)\b/i;
const GENERIC = /^(?:this (?:order|document) contains the following relevant provisions\.?|here (?:is|are) (?:the|some) relevant (?:information|details|provisions)\.?|i can help (?:you )?with that\.?)$/i;
const INTERNAL_PAYLOAD = /(?:"(?:legalInterpretation|agenticOutcome|responseCompositionTrace|artifacts)"\s*:|<\/?(?:system|developer|assistant)>|BEGIN_INTERNAL)/i;

export function verifyResponseClaims(args: {
  content: string;
  plan: TurnExecutionPlan;
  capabilitySnapshot: DocumentCapabilitySnapshot;
  capabilityDecision: CapabilityDecision;
  evidenceIds: string[];
  expectedFocusRevision: number;
  currentFocusRevision: number;
  supportedPropositions?: string[];
  requiresDirectAnswer?: boolean;
  unresolvedReferent?: boolean;
}) : ClaimVerificationResult {
  const content = args.content.trim();
  const errors: ClaimVerificationError[] = [];
  const readable = args.capabilitySnapshot.documents.some((document) =>
    document.authorized && (document.textExtracted || document.chunksAvailable));
  const exhaustiveReady = args.capabilitySnapshot.documents.length > 0 && args.capabilitySnapshot.documents.every((document) =>
    document.authorized && document.coverageStatus === 'complete' && document.fullDocumentReviewStatus === 'ready');

  if (args.requiresDirectAnswer && content.length < 20) errors.push('RESP_MISSING_DIRECT_ANSWER');
  if (GENERIC.test(content) && args.evidenceIds.length > 0) errors.push('RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE');
  if (UNREADABLE_CLAIM.test(content) && readable && args.capabilityDecision.prohibitedClaims.includes('file_unreadable')) errors.push('RESP_FALSE_UNREADABLE_CLAIM');
  if (EXHAUSTIVE_CLAIM.test(content) && !exhaustiveReady) errors.push('RESP_FALSE_EXHAUSTIVE_CLAIM');
  if (args.plan.selectedDocumentIds.length > 0 && args.evidenceIds.length === 0 && args.capabilityDecision.allowed) errors.push('RESP_CITATION_MISMATCH');
  if (args.expectedFocusRevision !== args.currentFocusRevision) errors.push('RESP_STALE_FOCUS');
  if (args.unresolvedReferent && args.plan.responseAct !== 'clarify') errors.push('RESP_UNRESOLVED_REFERENT');
  if (INTERNAL_PAYLOAD.test(content)) errors.push('RESP_INTERNAL_PAYLOAD');

  const normalizedSupported = (args.supportedPropositions ?? []).map((item) => item.toLowerCase().replace(/\s+/g, ' ').trim());
  if (normalizedSupported.length > 0 && args.plan.responseAct === 'answer') {
    const normalizedContent = content.toLowerCase().replace(/\s+/g, ' ');
    const hasSupported = normalizedSupported.some((proposition) => proposition.length >= 12 && normalizedContent.includes(proposition));
    if (!hasSupported && content.length > 80) errors.push('RESP_UNSUPPORTED_PROPOSITION');
  }

  const has = (error: ClaimVerificationError) => errors.includes(error);
  return {
    passed: errors.length === 0,
    errors,
    checks: {
      responsiveness: !has('RESP_MISSING_DIRECT_ANSWER') && !has('RESP_GENERIC_WHEN_EVIDENCE_AVAILABLE'),
      evidence: !has('RESP_UNSUPPORTED_PROPOSITION') && !has('RESP_CITATION_MISMATCH'),
      capabilityClaims: !has('RESP_FALSE_UNREADABLE_CLAIM') && !has('RESP_FALSE_EXHAUSTIVE_CLAIM'),
      continuity: !has('RESP_WRONG_TASK') && !has('RESP_UNRESOLVED_REFERENT') && !has('RESP_STALE_FOCUS'),
      contradictions: !has('RESP_UNSUPPORTED_PROPOSITION'),
      safety: true,
      internalPayload: !has('RESP_INTERNAL_PAYLOAD'),
    },
  };
}

