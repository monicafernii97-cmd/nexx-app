import type { DocumentReferenceDetection } from '../documentReferenceDetection';
import {
  TEXAS_POSSESSION_BUCKET_QUERIES,
  TEXAS_POSSESSION_ISSUE_TERMS,
} from './issuePacks/texasPossession';

export type ClauseRetrievalBucket =
  | 'controlling_specific_clause'
  | 'competing_general_clause'
  | 'exception_priority_language'
  | 'later_modification_language'
  | 'definition_language';

export type ClauseRetrievalBucketPlan = {
  bucket: ClauseRetrievalBucket;
  queries: string[];
};

const LEGAL_INTERPRETATION_REFERENCE_TYPES = new Set<DocumentReferenceDetection['referenceType']>([
  'possession_schedule_interpretation',
  'clause_conflict_interpretation',
]);

const BUCKET_ORDER: ClauseRetrievalBucket[] = [
  'controlling_specific_clause',
  'competing_general_clause',
  'exception_priority_language',
  'later_modification_language',
  'definition_language',
];

function normalizeForIssuePack(value: string) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function needsTexasPossessionIssuePack(message: string, detection: DocumentReferenceDetection) {
  if (LEGAL_INTERPRETATION_REFERENCE_TYPES.has(detection.referenceType)) return true;

  const combined = normalizeForIssuePack([
    message,
    ...detection.requestedTerms,
  ].join(' '));

  return TEXAS_POSSESSION_ISSUE_TERMS.some((term) =>
    new RegExp(`\\b${normalizeForIssuePack(term).replace(/\s+/g, '\\s+')}\\b`, 'i').test(combined)
  ) && /\b(?:possession|schedule|start|begin|end|pickup|exchange|weekend|clause|provision)\b/i.test(combined);
}

export function buildClauseRetrievalPlan(
  message: string,
  detection: DocumentReferenceDetection
): ClauseRetrievalBucketPlan[] {
  if (!needsTexasPossessionIssuePack(message, detection)) return [];

  return BUCKET_ORDER.map((bucket) => ({
    bucket,
    queries: TEXAS_POSSESSION_BUCKET_QUERIES[bucket],
  }));
}
