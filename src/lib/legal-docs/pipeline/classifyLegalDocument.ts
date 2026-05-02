/**
 * Legal Document Classifier
 *
 * Detects the kind of legal document from normalized text content.
 * Uses signal patterns (CAUSE NO., IN THE INTEREST OF, §, COMES NOW, etc.)
 * to determine document type, pleading type, jurisdiction, and document family.
 *
 * This is step 2 of the unified pipeline:
 *   normalizeLegalInput() → classifyLegalDocument() → parseLegalDocumentStructure() → ...
 */

// ═══════════════════════════════════════════════════════════════
// Output Types
// ═══════════════════════════════════════════════════════════════

export type PleadingType =
  | 'motion'
  | 'petition'
  | 'response'
  | 'answer'
  | 'notice'
  | 'order'
  | 'certificate'
  | 'affidavit'
  | 'declaration'
  | 'discovery_response'
  | 'exhibit_cover'
  | 'unknown';

export type DocumentFamily = 'family-law' | 'general-civil';

export type LegalDocumentClassification = {
  documentKind: 'court_document';
  pleadingType: PleadingType;
  documentFamily: DocumentFamily;
  jurisdictionLikely: {
    state?: string;
    county?: string;
    court?: string;
    district?: string;
  };
  confidence: number;
};

// ═══════════════════════════════════════════════════════════════
// Signal Patterns
// ═══════════════════════════════════════════════════════════════

const TEXAS_SIGNALS = [
  /CAUSE\s+NO\./i,
  /IN THE INTEREST OF/i,
  /§/,
  /DISTRICT COURT/i,
  /JUDICIAL DISTRICT/i,
  /COUNTY,\s*TEXAS/i,
] as const;

const COURT_DOCUMENT_SIGNALS = [
  /TO THE HONORABLE/i,
  /COMES NOW/i,
  /PRAYER/i,
  /Respectfully submitted/i,
  /CERTIFICATE OF SERVICE/i,
  /CAUSE\s+NO\./i,
] as const;

const FAMILY_LAW_SIGNALS = [
  /IN THE INTEREST OF/i,
  /PARENT.?CHILD RELATIONSHIP/i,
  /CUSTODY/i,
  /POSSESSION/i,
  /CHILD SUPPORT/i,
  /CONSERVATOR/i,
  /A CHILD/i,
  /CHILDREN/i,
  /TEMPORARY ORDERS/i,
] as const;

const PLEADING_TYPE_SIGNALS: Record<PleadingType, RegExp[]> = {
  motion: [/\bMOTION\b/i, /MOVES THE COURT/i],
  petition: [/\bPETITION\b/i, /PETITIONER/i],
  response: [/\bRESPONSE\b/i, /RESPONDENT.S.*(?:RESPONSE|ANSWER)/i],
  answer: [/\bANSWER\b/i, /\bGENERAL DENIAL\b/i],
  notice: [/NOTICE OF HEARING/i, /NOTICE OF/i],
  order: [/\bORDER\b/i, /IT IS (?:HEREBY )?ORDERED/i],
  certificate: [/CERTIFICATE OF SERVICE/i],
  affidavit: [/\bAFFIDAVIT\b/i, /SWORN/i],
  declaration: [/\bDECLARATION\b/i],
  discovery_response: [/INTERROGATOR/i, /REQUEST(?:S)? FOR (?:PRODUCTION|ADMISSION)/i],
  exhibit_cover: [/\bEXHIBIT\b/i],
  unknown: [],
};

// ═══════════════════════════════════════════════════════════════
// Classifier
// ═══════════════════════════════════════════════════════════════

/**
 * Classify a normalized legal document text.
 *
 * Returns classification with pleading type, jurisdiction, and confidence.
 * Does NOT modify the input — purely analytical.
 */
export function classifyLegalDocument(text: string): LegalDocumentClassification {
  // ── Count court document signals ──────────────────────────
  let courtSignalCount = 0;
  for (const pattern of COURT_DOCUMENT_SIGNALS) {
    if (pattern.test(text)) courtSignalCount++;
  }

  // ── Detect jurisdiction ───────────────────────────────────
  const jurisdictionLikely: LegalDocumentClassification['jurisdictionLikely'] = {};

  let texasSignalCount = 0;
  for (const pattern of TEXAS_SIGNALS) {
    if (pattern.test(text)) texasSignalCount++;
  }
  if (texasSignalCount >= 2) {
    jurisdictionLikely.state = 'TX';
  }

  // Extract county from "COUNTY, TEXAS" pattern
  const countyMatch = text.match(/([A-Z][A-Z\s]+)\s+COUNTY,\s*TEXAS/i);
  if (countyMatch) {
    jurisdictionLikely.county = countyMatch[1].trim();
  }

  // Extract court from "IN THE DISTRICT COURT" or similar
  const courtMatch = text.match(/IN THE\s+((?:DISTRICT|COUNTY|FAMILY)\s+COURT)/i);
  if (courtMatch) {
    jurisdictionLikely.court = courtMatch[1].trim();
  }

  // Extract district from "387TH JUDICIAL DISTRICT" pattern
  const districtMatch = text.match(/(\d+\w*)\s+JUDICIAL DISTRICT/i);
  if (districtMatch) {
    jurisdictionLikely.district = `${districtMatch[1]} Judicial District`;
  }

  // ── Detect document family ────────────────────────────────
  let familyLawSignalCount = 0;
  for (const pattern of FAMILY_LAW_SIGNALS) {
    if (pattern.test(text)) familyLawSignalCount++;
  }
  const documentFamily: DocumentFamily = familyLawSignalCount >= 2
    ? 'family-law'
    : 'general-civil';

  // ── Detect pleading type ──────────────────────────────────
  let detectedType: PleadingType = 'unknown';
  let maxTypeSignals = 0;

  for (const [type, patterns] of Object.entries(PLEADING_TYPE_SIGNALS)) {
    if (type === 'unknown') continue;
    let count = 0;
    for (const pattern of patterns) {
      if (pattern.test(text)) count++;
    }
    if (count > maxTypeSignals) {
      maxTypeSignals = count;
      detectedType = type as PleadingType;
    }
  }

  // ── Calculate confidence ──────────────────────────────────
  // Court document signals: each adds ~0.15 to confidence
  // Max realistic: 6 signals × 0.15 = 0.90
  const confidence = Math.min(
    courtSignalCount * 0.15 + (texasSignalCount >= 2 ? 0.1 : 0),
    1.0,
  );

  return {
    documentKind: 'court_document',
    pleadingType: detectedType,
    documentFamily,
    jurisdictionLikely,
    confidence,
  };
}
