/**
 * Assembly Integrity Validator — Pre-review structural completeness checks.
 *
 * Validates assembled structure viability BEFORE drafting.
 * Distinct from preflight, which validates the drafted/render-ready payload.
 *
 * Uses a 3-severity model:
 *   - critical → export cannot proceed (blocks "Approve & Draft")
 *   - error → export may proceed but has known quality issues
 *   - warning → informational, does not block
 *
 * Path-specific checks ensure each export type has minimum structural
 * requirements met before entering the review phase.
 */

import type { OrchestratorAssemblyResult } from '../orchestrator';
import type { ExportPath } from '../types/exports';
import type { AssemblyValidation, ValidationItem, ExportConfig } from '@/app/(app)/docuvault/context/ExportContext';

// ---------------------------------------------------------------------------
// Helper — generate unique IDs for validation items
// ---------------------------------------------------------------------------

let _validationCounter = 0;
function nextId(prefix: string): string {
    return `${prefix}_${++_validationCounter}`;
}

// ---------------------------------------------------------------------------
// Path-Specific Validators
// ---------------------------------------------------------------------------

function validateCourtDocument(
    result: OrchestratorAssemblyResult,
): { warnings: ValidationItem[]; errors: ValidationItem[]; critical: ValidationItem[] } {
    const warnings: ValidationItem[] = [];
    const errors: ValidationItem[] = [];
    const critical: ValidationItem[] = [];

    const { assembly, reviewItems, meta } = result;
    const includedItems = reviewItems.filter(i => i.includedInExport);

    // ── Critical ──
    if (includedItems.length === 0) {
        critical.push({
            id: nextId('court_crit'),
            label: 'No included content',
            detail: 'No workspace items are included in this export. Add case data before proceeding.',
        });
    }

    if (assembly.path === 'court_document') {
        const mapped = assembly.mappedSections;
        if (!mapped.captionData || (!mapped.captionData.courtName && !mapped.captionData.caseStyle)) {
            critical.push({
                id: nextId('court_crit'),
                label: 'Missing caption data',
                detail: 'Court document requires caption data (court name, case number). Add court profile information.',
            });
        }

        const sectionsPresent =
            mapped.factualBackground.length +
            mapped.legalGrounds.length +
            mapped.argumentSections.length;
        if (sectionsPresent === 0 && includedItems.length > 0) {
            critical.push({
                id: nextId('court_crit'),
                label: 'No valid sections produced',
                detail: 'Assembly produced classified nodes but no court sections mapped. Check node classification.',
            });
        }
    }

    // ── Error ──
    if (assembly.path === 'court_document') {
        const mapped = assembly.mappedSections;
        if (mapped.factualBackground.length === 0 && includedItems.length > 0) {
            errors.push({
                id: nextId('court_err'),
                label: 'Empty factual background',
                detail: 'No factual background sections were generated. This is a key section for court filings.',
            });
        }

        if (mapped.exhibitReferences.length > 0 && includedItems.filter(i => i.dominantType === 'evidence_reference').length === 0) {
            errors.push({
                id: nextId('court_err'),
                label: 'Exhibits referenced but no evidence',
                detail: 'The assembly references exhibits but no evidence items were classified. Add or re-classify items.',
            });
        }
    }

    // ── Warning ──
    if (meta.narrativeSections < 3) {
        warnings.push({
            id: nextId('court_warn'),
            label: 'Sparse timeline data',
            detail: `Only ${meta.narrativeSections} narrative section(s) built. A stronger timeline may improve output quality.`,
        });
    }

    const evidenceTypes = new Set(
        includedItems
            .filter(i => i.dominantType === 'evidence_reference')
            .map(i => i.suggestedSections[0])
    );
    if (includedItems.length > 3 && evidenceTypes.size <= 1) {
        warnings.push({
            id: nextId('court_warn'),
            label: 'Low evidence variety',
            detail: 'Most included items map to a single evidence category. Consider adding diverse evidence.',
        });
    }

    return { warnings, errors, critical };
}

function validateSummaryReport(
    result: OrchestratorAssemblyResult,
): { warnings: ValidationItem[]; errors: ValidationItem[]; critical: ValidationItem[] } {
    const warnings: ValidationItem[] = [];
    const errors: ValidationItem[] = [];
    const critical: ValidationItem[] = [];

    const { assembly, reviewItems, meta } = result;
    const includedItems = reviewItems.filter(i => i.includedInExport);

    // ── Critical ──
    if (includedItems.length === 0) {
        critical.push({
            id: nextId('summary_crit'),
            label: 'No included content',
            detail: 'No workspace items are included in this export. Add case data before proceeding.',
        });
    }

    if (assembly.path === 'case_summary') {
        const mapped = assembly.mappedSections;
        const sectionsPresent =
            mapped.timelineSummary.length +
            mapped.incidents.length +
            mapped.keyIssues.length +
            mapped.patternSummary.length;
        if (sectionsPresent === 0 && includedItems.length > 0) {
            critical.push({
                id: nextId('summary_crit'),
                label: 'No sections produced',
                detail: 'Assembly classified nodes but produced no summary sections. Try adding more varied case data.',
            });
        }
    }

    // ── Error ──
    if (assembly.path === 'case_summary') {
        const mapped = assembly.mappedSections;
        if (mapped.timelineSummary.length === 0 && meta.narrativeSections > 0) {
            errors.push({
                id: nextId('summary_err'),
                label: 'Missing chronology',
                detail: 'Narrative data exists but no chronological summary was produced.',
            });
        }

        const evidenceCount = includedItems.filter(i => i.dominantType === 'evidence_reference').length;
        if (evidenceCount <= 1 && includedItems.length > 5) {
            errors.push({
                id: nextId('summary_err'),
                label: 'Insufficient evidence items',
                detail: `Only ${evidenceCount} evidence item(s) found among ${includedItems.length} total items.`,
            });
        }
    }

    // ── Warning ──
    if (meta.narrativeSections < 2) {
        warnings.push({
            id: nextId('summary_warn'),
            label: 'Sparse narrative',
            detail: 'Very few narrative sections built. The summary may lack depth.',
        });
    }

    return { warnings, errors, critical };
}

function validateExhibitPacket(
    result: OrchestratorAssemblyResult,
): { warnings: ValidationItem[]; errors: ValidationItem[]; critical: ValidationItem[] } {
    const warnings: ValidationItem[] = [];
    const errors: ValidationItem[] = [];
    const critical: ValidationItem[] = [];

    const { assembly, reviewItems } = result;
    const includedItems = reviewItems.filter(i => i.includedInExport);

    // ── Critical ──
    if (assembly.path === 'exhibit_document') {
        const mapped = assembly.mappedSections;
        if (mapped.indexEntries.length === 0) {
            critical.push({
                id: nextId('exhibit_crit'),
                label: 'Zero exhibits',
                detail: 'No exhibit entries were produced. Add evidence or exhibit-linked items to your case.',
            });
        }
    }

    if (includedItems.length === 0) {
        critical.push({
            id: nextId('exhibit_crit'),
            label: 'No included content',
            detail: 'No workspace items are included in this export.',
        });
    }

    // ── Error ──
    if (assembly.path === 'exhibit_document') {
        const mapped = assembly.mappedSections;
        if (mapped.coverSheetSummaries.length === 0 && mapped.indexEntries.length > 0) {
            errors.push({
                id: nextId('exhibit_err'),
                label: 'Missing cover sheets',
                detail: 'Exhibits exist but no cover sheet summaries were generated.',
            });
        }
    }

    // ── Warning ──
    const evidenceTypes = new Set(
        includedItems
            .filter(i => i.dominantType === 'evidence_reference')
            .map(i => i.suggestedSections[0])
    );
    if (evidenceTypes.size <= 1 && includedItems.length > 2) {
        warnings.push({
            id: nextId('exhibit_warn'),
            label: 'Low exhibit variety',
            detail: 'All exhibits map to a single category. Consider adding diverse evidence types.',
        });
    }

    return { warnings, errors, critical };
}

// ---------------------------------------------------------------------------
// Main Validator
// ---------------------------------------------------------------------------

/**
 * Validate assembly output for structural completeness before review.
 *
 * This is called after runAssembly() and before entering the review phase.
 * It does NOT validate drafted content (that's preflight's responsibility).
 *
 * @param result  The orchestrator assembly result
 * @param config  The export config from the modal
 * @returns       3-severity validation result
 */
export function validateAssemblyOutput(
    result: OrchestratorAssemblyResult,
    config: ExportConfig,
): AssemblyValidation {
    // Reset counter for deterministic IDs per validation run
    _validationCounter = 0;

    switch (config.path) {
        case 'court_document':
            return validateCourtDocument(result);
        case 'case_summary':
            return validateSummaryReport(result);
        case 'exhibit_document':
            return validateExhibitPacket(result);
        default: {
            const _exhaustive: never = config.path;
            throw new Error(`Unknown export path: ${_exhaustive}`);
        }
    }
}
