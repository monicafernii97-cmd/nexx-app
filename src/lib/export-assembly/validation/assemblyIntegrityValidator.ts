/**
 * Assembly Integrity Validator — Pre-review structural completeness checks.
 *
 * Validates assembled structure viability BEFORE drafting.
 * Distinct from preflight, which validates the drafted/render-ready payload.
 *
 * Uses a 3-severity model:
 *   - critical → blocks "Approve & Draft" (ONLY fires on zero content)
 *   - error → reserved for future quality-gate checks (currently unused)
 *   - warning → informational hints, does not block
 */

import type { OrchestratorAssemblyResult } from '../orchestrator';
import type { AssemblyValidation, ValidationItem, ExportConfig } from '@/app/(app)/docuvault/context/ExportContext';

// ---------------------------------------------------------------------------
// Helper — generate unique IDs for validation items
// ---------------------------------------------------------------------------

let _validationCounter = 0;
/** Generate a unique sequential ID for a validation item within a single run. */
function nextId(prefix: string): string {
    return `${prefix}_${++_validationCounter}`;
}

// ---------------------------------------------------------------------------
// Path-Specific Validators
// ---------------------------------------------------------------------------

/** Validate court document assembly for structural completeness. */
function validateCourtDocument(
    result: OrchestratorAssemblyResult,
): { warnings: ValidationItem[]; errors: ValidationItem[]; critical: ValidationItem[] } {
    const warnings: ValidationItem[] = [];
    const errors: ValidationItem[] = [];
    const critical: ValidationItem[] = [];

    const { assembly, reviewItems, meta } = result;
    const includedItems = reviewItems.filter(i => i.includedInExport);
    const hasAnyDiscoveredContent = reviewItems.length > 0;

    // ── Critical — ONLY when zero data (nothing to build a document from) ──
    if (!hasAnyDiscoveredContent) {
        critical.push({
            id: nextId('court_crit'),
            label: 'No content available',
            detail: 'No content is available for this export. Paste document text or add case data first.',
        });
    }

    // ── Warnings — informational, do NOT block ──
    if (assembly.path === 'court_document') {
        const mapped = assembly.mappedSections;
        if (!mapped.captionData || (!mapped.captionData.courtName && !mapped.captionData.caseStyle)) {
            warnings.push({
                id: nextId('court_warn'),
                label: 'No caption data',
                detail: 'Court caption (court name, case number) not found. The document will generate without a formal caption.',
            });
        }

        const sectionsPresent =
            mapped.factualBackground.length +
            mapped.legalGrounds.length +
            mapped.argumentSections.length;
        if (sectionsPresent === 0 && includedItems.length > 0) {
            warnings.push({
                id: nextId('court_warn'),
                label: 'No structured sections mapped',
                detail: 'Content will be included as-is without section classification.',
            });
        }

        if (mapped.factualBackground.length === 0 && includedItems.length > 0) {
            warnings.push({
                id: nextId('court_warn'),
                label: 'No factual background section',
                detail: 'No factual background was generated. Consider adding more case facts.',
            });
        }

        if (mapped.exhibitReferences.length > 0 && includedItems.filter(i => i.dominantType === 'evidence_reference').length === 0) {
            warnings.push({
                id: nextId('court_warn'),
                label: 'Exhibits referenced but no evidence',
                detail: 'The assembly references exhibits but no evidence items were classified.',
            });
        }
    }

    // Skip timeline warning for pre-drafted content (no timeline analysis was requested)
    const isFastPath = assembly.classifiedNodes.length === 1
        && assembly.classifiedNodes[0].tags?.includes('pre_drafted');
    if (meta.narrativeSections < 3 && !isFastPath) {
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
            .filter(Boolean)
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

/** Validate case summary assembly for structural completeness. */
function validateSummaryReport(
    result: OrchestratorAssemblyResult,
): { warnings: ValidationItem[]; errors: ValidationItem[]; critical: ValidationItem[] } {
    const warnings: ValidationItem[] = [];
    const errors: ValidationItem[] = [];
    const critical: ValidationItem[] = [];

    const { assembly, reviewItems, meta } = result;
    const includedItems = reviewItems.filter(i => i.includedInExport);
    const hasAnyDiscoveredContent = reviewItems.length > 0;

    // ── Critical — ONLY when zero data ──
    if (!hasAnyDiscoveredContent) {
        critical.push({
            id: nextId('summary_crit'),
            label: 'No content available',
            detail: 'No content is available for this export. Paste document text or add case data first.',
        });
    }

    // ── Warnings — informational, do NOT block ──
    if (assembly.path === 'case_summary') {
        const mapped = assembly.mappedSections;
        const sectionsPresent =
            mapped.timelineSummary.length +
            mapped.incidents.length +
            mapped.keyIssues.length +
            mapped.patternSummary.length;
        if (sectionsPresent === 0 && includedItems.length > 0) {
            warnings.push({
                id: nextId('summary_warn'),
                label: 'No structured sections mapped',
                detail: 'Content will be included as-is without section classification.',
            });
        }

        if (mapped.timelineSummary.length === 0 && meta.narrativeSections > 0) {
            warnings.push({
                id: nextId('summary_warn'),
                label: 'Missing chronology',
                detail: 'Narrative data exists but no chronological summary was produced.',
            });
        }

        const evidenceCount = includedItems.filter(i => i.dominantType === 'evidence_reference').length;
        if (evidenceCount <= 1 && includedItems.length > 5) {
            warnings.push({
                id: nextId('summary_warn'),
                label: 'Few evidence items',
                detail: `Only ${evidenceCount} evidence item(s) found among ${includedItems.length} total items.`,
            });
        }
    }

    if (meta.narrativeSections < 2) {
        warnings.push({
            id: nextId('summary_warn'),
            label: 'Sparse narrative',
            detail: 'Very few narrative sections built. The summary may lack depth.',
        });
    }

    return { warnings, errors, critical };
}

/** Validate exhibit packet assembly for structural completeness. */
function validateExhibitPacket(
    result: OrchestratorAssemblyResult,
): { warnings: ValidationItem[]; errors: ValidationItem[]; critical: ValidationItem[] } {
    const warnings: ValidationItem[] = [];
    const errors: ValidationItem[] = [];
    const critical: ValidationItem[] = [];

    const { assembly, reviewItems } = result;
    const includedItems = reviewItems.filter(i => i.includedInExport);
    const hasAnyDiscoveredContent = reviewItems.length > 0;

    // ── Critical — ONLY when zero data ──
    if (!hasAnyDiscoveredContent) {
        critical.push({
            id: nextId('exhibit_crit'),
            label: 'No content available',
            detail: 'No content is available for this export. Paste document text or add case data first.',
        });
    }

    // ── Warnings — informational, do NOT block ──
    if (assembly.path === 'exhibit_document') {
        const mapped = assembly.mappedSections;
        if (mapped.indexEntries.length === 0 && includedItems.length > 0) {
            warnings.push({
                id: nextId('exhibit_warn'),
                label: 'No exhibit entries mapped',
                detail: 'Content is available but no exhibits were classified. The document will use content as-is.',
            });
        }

        if (mapped.coverSheetSummaries.length === 0 && mapped.indexEntries.length > 0) {
            warnings.push({
                id: nextId('exhibit_warn'),
                label: 'Missing cover sheets',
                detail: 'Exhibits exist but no cover sheet summaries were generated.',
            });
        }
    }

    const evidenceTypes = new Set(
        includedItems
            .filter(i => i.dominantType === 'evidence_reference')
            .map(i => i.suggestedSections[0])
            .filter(Boolean)
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
