import { validateLegalInterpretationAnswerShape } from '../legal-engine/legalInterpretationSchema';
import { validateLitigationNavigationResponseShape } from '../legal-engine/litigationNavigationSchema';
import { validateLegalDocumentAnswerShape } from '../legalDocumentAnswer';

/**
 * Response validators for the recovery pipeline.
 * Checks structural validity of parsed responses.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOptionalString(value: unknown) {
  return value === undefined || value === null || typeof value === 'string';
}

function validateLocalResourceLookup(value: unknown) {
  if (value === null) return true;
  if (!isObject(value)) return false;
  if (!isObject(value.jurisdiction)) return false;
  if (!isOptionalString(value.jurisdiction.state) || !isOptionalString(value.jurisdiction.county) || !isOptionalString(value.jurisdiction.courtName)) return false;
  if (!Array.isArray(value.feeSources) || !Array.isArray(value.resources) || !Array.isArray(value.exactFeeFindings)) return false;
  return isStringArray(value.warnings);
}

function validateProSeDraftingReadiness(value: unknown) {
  if (value === null) return true;
  if (!isObject(value)) return false;
  return typeof value.requestedDocument === 'string' &&
    typeof value.readinessStage === 'string' &&
    typeof value.isFilingReady === 'boolean' &&
    isStringArray(value.confirmedFacts) &&
    isStringArray(value.missingFacts) &&
    isStringArray(value.notApplicableFacts) &&
    typeof value.draftingNote === 'string';
}

function validateOrderVersion(value: unknown) {
  if (value === null) return true;
  if (!isObject(value) || !isObject(value.authorityStatus)) return false;
  return isOptionalString(value.activeOrderFileId) &&
    isOptionalString(value.activeOrderFileName) &&
    typeof value.candidateCount === 'number' &&
    typeof value.needsUserSelection === 'boolean' &&
    typeof value.authorityStatus.status === 'string' &&
    typeof value.authorityStatus.enforceabilityConfirmed === 'boolean' &&
    isStringArray(value.authorityStatus.sourceIds);
}

function validateLegalBasis(value: unknown) {
  return Array.isArray(value) && value.every((basis) =>
    isObject(basis) &&
    typeof basis.basisType === 'string' &&
    typeof basis.proposition === 'string' &&
    isStringArray(basis.sourceIds)
  );
}

function validateDeadlineAnalysis(value: unknown) {
  if (value === null) return true;
  if (!isObject(value)) return false;
  return typeof value.status === 'string' &&
    isOptionalString(value.trigger) &&
    isOptionalString(value.serviceMethod) &&
    isOptionalString(value.governingRule) &&
    isOptionalString(value.jurisdiction) &&
    isOptionalString(value.timezone) &&
    isOptionalString(value.calendarTreatment) &&
    isOptionalString(value.calendarDate) &&
    Array.isArray(value.sourcedDates) &&
    isStringArray(value.missingInputs) &&
    typeof value.explanation === 'string';
}

/**
 * Validate that a parsed object matches the NexxAssistantResponse shape.
 */
export function validateAssistantResponse(parsed: unknown): boolean {
  if (!isObject(parsed)) return false;

  const obj = parsed;

  // Must have a non-empty message string
  if (typeof obj.message !== 'string' || obj.message.length === 0) return false;

  // Must have an artifacts object
  if (!obj.artifacts || typeof obj.artifacts !== 'object') return false;

  const artifacts = obj.artifacts as Record<string, unknown>;

  // Each artifact must be either null or an object
  const artifactKeys = [
    'draftReady', 'timelineReady', 'exhibitReady',
    'judgeSimulation', 'oppositionSimulation', 'confidence',
  ];
  for (const key of artifactKeys) {
    if (!(key in artifacts)) return false;
    const val = artifacts[key];
    if (val !== null && (typeof val !== 'object' || Array.isArray(val))) return false;
  }

  if (!('documentAnswer' in obj)) return false;
  if (obj.documentAnswer !== null && !validateLegalDocumentAnswerShape(obj.documentAnswer)) return false;
  if (!('legalInterpretation' in obj)) return false;
  if (obj.legalInterpretation !== null && !validateLegalInterpretationAnswerShape(obj.legalInterpretation)) return false;
  if (!('litigationNavigation' in obj)) return false;
  if (obj.litigationNavigation !== null && !validateLitigationNavigationResponseShape(obj.litigationNavigation)) return false;
  if (!('localResourceLookup' in obj) || !validateLocalResourceLookup(obj.localResourceLookup)) return false;
  if (!('proSeDraftingReadiness' in obj) || !validateProSeDraftingReadiness(obj.proSeDraftingReadiness)) return false;
  if (!('orderVersion' in obj) || !validateOrderVersion(obj.orderVersion)) return false;
  if (!('legalBasis' in obj) || !validateLegalBasis(obj.legalBasis)) return false;
  if (!('deadlineAnalysis' in obj) || !validateDeadlineAnalysis(obj.deadlineAnalysis)) return false;

  return true;
}

/**
 * Validate a draft artifact has substantive content.
 */
export function validateDraft(draft: unknown): boolean {
  if (!draft || typeof draft !== 'object') return false;
  const d = draft as Record<string, unknown>;
  return typeof d.body === 'string' && d.body.length > 50;
}

/**
 * Validate a timeline artifact has enough events.
 */
export function validateTimeline(timeline: unknown): boolean {
  if (!timeline || typeof timeline !== 'object') return false;
  const t = timeline as Record<string, unknown>;
  return Array.isArray(t.events) && t.events.length >= 2;
}

/**
 * Validate an exhibit artifact has evidence references.
 */
export function validateExhibit(exhibit: unknown): boolean {
  if (!exhibit || typeof exhibit !== 'object') return false;
  const e = exhibit as Record<string, unknown>;
  return Array.isArray(e.exhibits) && e.exhibits.length > 0;
}

/**
 * Validate a judge simulation has meaningful scores.
 */
export function validateJudgeSimulation(sim: unknown): boolean {
  if (!sim || typeof sim !== 'object') return false;
  const s = sim as Record<string, unknown>;
  return (
    typeof s.credibilityScore === 'number' && s.credibilityScore > 0 &&
    typeof s.neutralityScore === 'number' && s.neutralityScore > 0 &&
    typeof s.clarityScore === 'number' && s.clarityScore > 0 &&
    Array.isArray(s.strengths) && s.strengths.length > 0
  );
}

/**
 * Validate an opposition simulation has attack points.
 */
export function validateOppositionSimulation(sim: unknown): boolean {
  if (!sim || typeof sim !== 'object') return false;
  const s = sim as Record<string, unknown>;
  return Array.isArray(s.likelyAttackPoints) && s.likelyAttackPoints.length > 0;
}

/**
 * Validate a confidence assessment has a basis.
 */
export function validateConfidence(conf: unknown): boolean {
  if (!conf || typeof conf !== 'object') return false;
  const c = conf as Record<string, unknown>;
  return (
    typeof c.confidence === 'string' &&
    ['high', 'moderate', 'low'].includes(c.confidence) &&
    typeof c.basis === 'string' && c.basis.length > 0
  );
}
