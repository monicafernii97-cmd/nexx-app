/**
 * Preflight Validation Engine
 *
 * Computes a PreflightResult from CourtDocumentDraftState.
 * This is the GATEKEEPER for PDF export.
 *
 * Status Rules:
 *   empty     → blocks export (BLOCKER)
 *   drafted   → does NOT block export
 *   court_ready → does NOT block export
 *   locked    → does NOT block export
 *
 * Only truly empty required sections are blockers.
 * "Court-safe over strictness."
 */

import type {
  CourtDocumentDraftState,
  PreflightResult,
  PreflightCheckItem,
  PreflightCheckStatus,
} from './types';
import { deriveRequiredSections } from './deriveRequiredSections';

/**
 * Validate the current draft state against structural requirements.
 *
 * @param state - The current CourtDocumentDraftState
 * @returns PreflightResult with item-level status and export gate
 */
export function validatePreflight(state: CourtDocumentDraftState): PreflightResult {
  const sectionDefs = deriveRequiredSections(state.documentType);
  const items: PreflightCheckItem[] = [];

  for (const def of sectionDefs) {
    const section = state.sections.find(s => s.id === def.id);

    if (!section) {
      // Section exists in template but not in state — missing entirely
      if (def.required) {
        items.push({
          id: def.id,
          label: def.heading,
          status: 'missing',
          description: 'Required section not found in document',
          sectionId: def.id,
        });
      }
      continue;
    }

    const status = resolveSectionCheckStatus(section.status, section.content, def.required);
    const description = getStatusDescription(section.status, def.required);

    items.push({
      id: def.id,
      label: def.heading,
      status,
      description,
      sectionId: def.id,
    });
  }

  // Additional structural checks
  items.push(...getStructuralChecks(state));

  const blockers = items.filter(i => i.status === 'missing').length;
  const warnings = items.filter(i => i.status === 'warning').length;
  const complete = items.filter(i => i.status === 'complete').length;
  const total = items.length;

  return {
    items,
    completionPct: total > 0 ? Math.round((complete / total) * 100) : 0,
    blockers,
    warnings,
    canExport: blockers === 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Map section status + content to a preflight check status.
 *
 * Key rule: `drafted` does NOT block export.
 */
function resolveSectionCheckStatus(
  sectionStatus: string,
  content: string,
  isRequired: boolean,
): PreflightCheckStatus {
  const hasContent = content.trim().length > 0;

  switch (sectionStatus) {
    case 'locked':
    case 'court_ready':
      return 'complete';
    case 'drafted':
      // Drafted but has content = warning (could be polished), not a blocker
      return hasContent ? 'warning' : (isRequired ? 'missing' : 'warning');
    case 'empty':
    default:
      return isRequired ? 'missing' : 'warning';
  }
}

function getStatusDescription(sectionStatus: string, isRequired: boolean): string | undefined {
  switch (sectionStatus) {
    case 'locked':
      return 'Locked and finalized';
    case 'court_ready':
      return 'Reviewed and court-ready';
    case 'drafted':
      return 'Draft content present — consider reviewing';
    case 'empty':
      return isRequired
        ? 'Required section is empty — add content to proceed'
        : 'Optional section is empty';
    default:
      return undefined;
  }
}

/**
 * Structural checks beyond individual sections.
 */
function getStructuralChecks(state: CourtDocumentDraftState): PreflightCheckItem[] {
  const checks: PreflightCheckItem[] = [];

  // Document type must be identified
  checks.push({
    id: 'doc_type',
    label: 'Document Type Identified',
    status: state.documentType !== 'unknown' ? 'complete' : 'warning',
    description: state.documentType !== 'unknown'
      ? `Type: ${state.documentType}`
      : 'Document type could not be classified',
  });

  // Jurisdiction should be set
  const hasJurisdiction = !!(state.jurisdiction.state || state.jurisdiction.courtName);
  checks.push({
    id: 'jurisdiction',
    label: 'Jurisdiction Set',
    status: hasJurisdiction ? 'complete' : 'warning',
    description: hasJurisdiction
      ? `${state.jurisdiction.state ?? ''}${state.jurisdiction.county ? `, ${state.jurisdiction.county}` : ''}`
      : 'No jurisdiction configured — document will use default formatting',
  });

  return checks;
}
