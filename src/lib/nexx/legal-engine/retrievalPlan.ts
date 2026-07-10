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

export type FilingRetrievalBucket =
  | 'caption_and_document_type'
  | 'relief_and_prayer'
  | 'allegations_and_grounds'
  | 'hearing_and_deadline'
  | 'service_and_certificate'
  | 'signature_and_filed_date'
  | 'current_order_references';

export type ClauseRetrievalBucketPlan = {
  bucket: ClauseRetrievalBucket;
  queries: string[];
};

export type FilingRetrievalBucketPlan = {
  bucket: FilingRetrievalBucket;
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

const FILING_BUCKET_ORDER: FilingRetrievalBucket[] = [
  'caption_and_document_type',
  'relief_and_prayer',
  'allegations_and_grounds',
  'hearing_and_deadline',
  'service_and_certificate',
  'signature_and_filed_date',
  'current_order_references',
];

const FILING_BUCKET_QUERIES: Record<FilingRetrievalBucket, string[]> = {
  caption_and_document_type: [
    'caption',
    'cause number',
    'case number',
    'style',
    'in the interest',
    'original petition',
    'petition to modify',
    'motion to enforce',
    'motion for temporary orders',
    'respondent',
    'petitioner',
    'movant',
  ],
  relief_and_prayer: [
    'prayer',
    'relief requested',
    'requests that the court',
    'asks the court',
    'requested relief',
    'grant the relief',
    'order respondent to',
    'award judgment',
  ],
  allegations_and_grounds: [
    'alleges',
    'allegations',
    'grounds',
    'failed to',
    'refused to',
    'violated',
    'contempt',
    'facts',
    'supporting affidavit',
  ],
  hearing_and_deadline: [
    'notice of hearing',
    'hearing',
    'court date',
    'response deadline',
    'answer due',
    'no later than',
    'within 14 days',
    'within 20 days',
    'within 30 days',
  ],
  service_and_certificate: [
    'certificate of service',
    'return of service',
    'service of process',
    'method of service',
    'served on',
    'served by',
    'e-service',
  ],
  signature_and_filed_date: [
    'signature',
    'signed',
    'file stamp',
    'date filed',
    'clerk of the court',
    'respectfully submitted',
    'submitted by',
  ],
  current_order_references: [
    'current order',
    'prior order',
    'final order',
    'temporary order',
    'parenting plan',
    'order signed',
    'possession order',
  ],
};

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

export function needsFilingRetrievalPlan(message: string, detection: DocumentReferenceDetection) {
  const text = normalizeForIssuePack([
    message,
    ...detection.requestedTerms,
    ...detection.requestedDocumentTypes,
  ].join(' '));

  return /\b(?:what do i file|what should i file|file next|response|answer|motion|petition|served|hearing|court date|relief|prayer|certificate of service)\b/i.test(text);
}

export function buildFilingRetrievalPlan(
  message: string,
  detection: DocumentReferenceDetection
): FilingRetrievalBucketPlan[] {
  if (!needsFilingRetrievalPlan(message, detection)) return [];

  return FILING_BUCKET_ORDER.map((bucket) => ({
    bucket,
    queries: FILING_BUCKET_QUERIES[bucket],
  }));
}
