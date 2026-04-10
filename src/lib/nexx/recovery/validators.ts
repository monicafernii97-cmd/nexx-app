/**
 * Response validators for the recovery pipeline.
 * Checks structural validity of parsed responses.
 */

/**
 * Validate that a parsed object matches the NexxAssistantResponse shape.
 */
export function validateAssistantResponse(parsed: unknown): boolean {
  if (!parsed || typeof parsed !== 'object') return false;

  const obj = parsed as Record<string, unknown>;

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
