/**
 * Preflight Validator — Filing-readiness checks for the Review Hub.
 *
 * Runs BEFORE GPT drafting to ensure the export is complete and valid.
 * Produces a visual checklist for the Preflight Panel:
 *   ✅ Caption complete
 *   ✅ Parties defined
 *   ❌ Missing certificate of service
 *   ⚠️  3 low-confidence items
 *
 * Two layers of validation:
 * 1. **Content completeness** — are required sections present? are fields filled?
 * 2. **Quality signals** — low-confidence nodes, empty sections, missing evidence
 *
 * Note: Formatting compliance (margins, fonts, page numbering) is handled
 * separately by complianceChecker.ts and runs AFTER drafting.
 */

import type {
    CourtConfig,
    SummaryConfig,
    ExhibitConfig,
    CourtMappedSections,
    SummaryMappedSections,
    ExhibitMappedSections,
    MappingReviewItem,
} from '../types/exports';
import type { ExportOverrides } from '../orchestrator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Severity levels for preflight checks. */
export type PreflightSeverity = 'pass' | 'warning' | 'error' | 'critical';

/** A single preflight check result. */
export interface PreflightCheck {
    /** Unique identifier for this check */
    id: string;
    /** Human-readable label for the checklist */
    label: string;
    /** Check result */
    severity: PreflightSeverity;
    /** Detailed explanation when not passing */
    detail?: string;
    /** Category for grouping in the UI */
    category: 'required_content' | 'quality' | 'compliance' | 'evidence';
}

/** Aggregate preflight result. */
export interface PreflightResult {
    checks: PreflightCheck[];
    /** Number of critical issues (blocks generation with highest severity) */
    criticalCount: number;
    /** Number of errors (blocks generation) */
    errorCount: number;
    /** Number of warnings (advisory only) */
    warningCount: number;
    /** Overall readiness score (0-100) */
    readinessScore: number;
    /** Whether generation should proceed */
    canProceed: boolean;
}

// ---------------------------------------------------------------------------
// Court Document Preflight
// ---------------------------------------------------------------------------

/** Court settings shape (from userCourtSettings table). */
export interface CourtSettingsForPreflight {
    state?: string;
    county?: string;
    courtName?: string;
    causeNumber?: string;
    petitionerLegalName?: string;
    respondentLegalName?: string;
    petitionerRole?: 'petitioner' | 'respondent';
    children?: { name: string; age: number }[];
}

/**
 * Run preflight checks for a court document export.
 *
 * @param config          Court export configuration from the modal
 * @param mappedSections  The mapped sections from the assembly engine
 * @param courtSettings   The user's court settings
 * @param reviewItems     The review items with confidence scores
 * @returns               Preflight result with checklist
 */
export function preflightCourt(
    config: CourtConfig,
    mappedSections: CourtMappedSections,
    courtSettings: CourtSettingsForPreflight,
    reviewItems: MappingReviewItem[],
): PreflightResult {
    const checks: PreflightCheck[] = [];

    // ── Required Content Checks ──

    // Caption data
    if (config.includeCaption) {
        const hasCauseNumber = Boolean(courtSettings.causeNumber?.trim());
        checks.push({
            id: 'caption_cause_number',
            label: 'Cause Number',
            severity: hasCauseNumber ? 'pass' : 'warning',
            detail: hasCauseNumber ? undefined : 'No cause number set. Document will use placeholder.',
            category: 'required_content',
        });

        const hasCourtName = Boolean(courtSettings.courtName?.trim());
        checks.push({
            id: 'caption_court_name',
            label: 'Court Name',
            severity: hasCourtName ? 'pass' : 'warning',
            detail: hasCourtName ? undefined : 'No court name set. Generic "District Court" will be used.',
            category: 'required_content',
        });
    }

    // Party names — determine filing vs opposing based on petitionerRole
    const filingPartyRole = courtSettings.petitionerRole ?? 'petitioner';
    const hasPetitioner = Boolean(courtSettings.petitionerLegalName?.trim());
    const hasRespondent = Boolean(courtSettings.respondentLegalName?.trim());
    const hasFilingParty = filingPartyRole === 'petitioner' ? hasPetitioner : hasRespondent;
    checks.push({
        id: 'party_filing',
        label: 'Filing Party Name',
        severity: hasFilingParty ? 'pass' : 'error',
        detail: hasFilingParty ? undefined : 'Filing party legal name is required for court documents.',
        category: 'required_content',
    });

    const hasOpposingParty = filingPartyRole === 'petitioner' ? hasRespondent : hasPetitioner;
    checks.push({
        id: 'party_opposing',
        label: 'Opposing Party Name',
        severity: hasOpposingParty ? 'pass' : 'warning',
        detail: hasOpposingParty ? undefined : 'Opposing party name not set. Document may be incomplete.',
        category: 'required_content',
    });

    // Jurisdiction
    const hasState = Boolean(courtSettings.state?.trim());
    const hasCounty = Boolean(courtSettings.county?.trim());
    checks.push({
        id: 'jurisdiction',
        label: 'Jurisdiction (State & County)',
        severity: hasState && hasCounty ? 'pass' : 'error',
        detail: hasState && hasCounty ? undefined : 'State and county are required for court formatting rules.',
        category: 'required_content',
    });

    // Required sections based on document type
    const hasFactualBackground = mappedSections.factualBackground.length > 0;
    checks.push({
        id: 'section_facts',
        label: 'Factual Background',
        severity: hasFactualBackground ? 'pass' : 'warning',
        detail: hasFactualBackground ? undefined : 'No factual background content mapped. Document may lack substance.',
        category: 'required_content',
    });

    // Certificate of Service
    if (config.includeCertificateOfService) {
        checks.push({
            id: 'certificate_of_service',
            label: 'Certificate of Service',
            severity: 'pass', // Will be generated by template
            category: 'required_content',
        });
    }

    // Prayer for relief
    if (config.includePrayer) {
        const hasPrayer = mappedSections.requestedRelief.length > 0;
        checks.push({
            id: 'prayer_for_relief',
            label: 'Prayer for Relief',
            severity: hasPrayer ? 'pass' : 'warning',
            detail: hasPrayer ? undefined : 'No relief items mapped. Consider adding requested relief.',
            category: 'required_content',
        });
    }

    // ── Quality Checks ──

    // Low-confidence items
    const lowConfidenceItems = reviewItems.filter(
        item => item.includedInExport && item.confidence < 0.5,
    );
    checks.push({
        id: 'low_confidence',
        label: 'Content Confidence',
        severity: lowConfidenceItems.length === 0 ? 'pass'
            : lowConfidenceItems.length <= 3 ? 'warning' : 'error',
        detail: lowConfidenceItems.length > 0
            ? `${lowConfidenceItems.length} item(s) have low classification confidence. Review these in the mapping canvas.`
            : undefined,
        category: 'quality',
    });

    // Empty sections
    const emptySections: string[] = [];
    if (mappedSections.factualBackground.length === 0) emptySections.push('Factual Background');
    if (mappedSections.legalGrounds.length === 0) emptySections.push('Legal Grounds');
    if (mappedSections.argumentSections.length === 0) emptySections.push('Arguments');

    if (emptySections.length > 0) {
        checks.push({
            id: 'empty_sections',
            label: 'Section Coverage',
            severity: 'warning',
            detail: `Empty sections: ${emptySections.join(', ')}. These will be omitted from the document.`,
            category: 'quality',
        });
    }

    // ── Evidence Checks ──

    // Exhibit references that don't match selected exhibits
    if (config.linkedExhibitIds && config.linkedExhibitIds.length > 0) {
        const referencedExhibitIds = new Set(
            mappedSections.exhibitReferences.map(e => e.linkedEvidenceId),
        );
        const unreferenced = config.linkedExhibitIds.filter(
            id => !referencedExhibitIds.has(id),
        );
        if (unreferenced.length > 0) {
            checks.push({
                id: 'unlinked_exhibits',
                label: 'Exhibit References',
                severity: 'warning',
                detail: `${unreferenced.length} selected exhibit(s) are not referenced in the document body.`,
                category: 'evidence',
            });
        }
    }

    return buildResult(checks);
}

// ---------------------------------------------------------------------------
// Summary Document Preflight
// ---------------------------------------------------------------------------

/**
 * Run preflight checks for a case summary export.
 */
export function preflightSummary(
    config: SummaryConfig,
    mappedSections: SummaryMappedSections,
    reviewItems: MappingReviewItem[],
): PreflightResult {
    const checks: PreflightCheck[] = [];

    // Content checks
    const hasIssues = mappedSections.keyIssues.length > 0;
    checks.push({
        id: 'key_issues',
        label: 'Key Issues Identified',
        severity: hasIssues ? 'pass' : 'warning',
        detail: hasIssues ? undefined : 'No key issues were identified. Summary may be incomplete.',
        category: 'required_content',
    });

    // Only check timeline if config includes it
    if (config.includeTimeline !== false) {
        const hasTimeline = mappedSections.timelineSummary.length > 0;
        checks.push({
            id: 'timeline',
            label: 'Timeline Events',
            severity: hasTimeline ? 'pass' : 'warning',
            detail: hasTimeline ? undefined : 'No timeline events mapped.',
            category: 'required_content',
        });
    }

    // Quality checks
    const lowConfidence = reviewItems.filter(
        item => item.includedInExport && item.confidence < 0.5,
    );
    if (lowConfidence.length > 0) {
        checks.push({
            id: 'low_confidence',
            label: 'Content Confidence',
            severity: 'warning',
            detail: `${lowConfidence.length} item(s) have low classification confidence.`,
            category: 'quality',
        });
    }

    return buildResult(checks);
}

// ---------------------------------------------------------------------------
// Exhibit Document Preflight
// ---------------------------------------------------------------------------

/**
 * Run preflight checks for an exhibit packet export.
 */
export function preflightExhibit(
    config: ExhibitConfig,
    mappedSections: ExhibitMappedSections,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _reviewItems: MappingReviewItem[],
): PreflightResult {
    const checks: PreflightCheck[] = [];

    // Must have at least one exhibit
    const hasExhibits = mappedSections.indexEntries.length > 0;
    checks.push({
        id: 'exhibit_count',
        label: 'Exhibits Selected',
        severity: hasExhibits ? 'pass' : 'error',
        detail: hasExhibits
            ? `${mappedSections.indexEntries.length} exhibit(s) in packet.`
            : 'No exhibits selected. Cannot generate an empty exhibit packet.',
        category: 'required_content',
    });

    // Cover sheets
    if (config.includeCoverSheets) {
        const hasCoverData = mappedSections.coverSheetSummaries.length > 0;
        checks.push({
            id: 'cover_sheets',
            label: 'Cover Sheet Data',
            severity: hasCoverData ? 'pass' : 'warning',
            detail: hasCoverData ? undefined : 'No cover sheet summaries generated. Cover sheets may be minimal.',
            category: 'required_content',
        });
    }

    // Bates numbering
    if (config.includeBatesNumbers) {
        checks.push({
            id: 'bates_numbering',
            label: 'Bates Numbering',
            severity: 'pass',
            detail: 'Bates numbers will be applied during PDF rendering.',
            category: 'compliance',
        });
    }

    return buildResult(checks);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compute aggregate result from individual checks. */
function buildResult(checks: PreflightCheck[]): PreflightResult {
    const criticalCount = checks.filter(c => c.severity === 'critical').length;
    const errorCount = checks.filter(c => c.severity === 'error').length;
    const warningCount = checks.filter(c => c.severity === 'warning').length;
    const passCount = checks.filter(c => c.severity === 'pass').length;
    const total = checks.length;

    // Score: each pass = full points, each warning = half points, error/critical = 0
    const rawScore = total > 0
        ? ((passCount + warningCount * 0.5) / total) * 100
        : 100;
    const readinessScore = Math.round(rawScore);

    return {
        checks,
        criticalCount,
        errorCount,
        warningCount,
        readinessScore,
        canProceed: criticalCount === 0 && errorCount === 0,
    };
}

// ---------------------------------------------------------------------------
// Generic Entry Point
// ---------------------------------------------------------------------------

/** Input for the generic preflight dispatcher. */
export interface RunPreflightInput {
    exportPath: string;
    config: Record<string, unknown>;
    reviewItems: MappingReviewItem[];
    overrides: ExportOverrides;
}

/**
 * Run preflight checks for any export path.
 *
 * Routes to the correct path-specific validator. Used by both:
 * - Manual preflight button (ReviewHubContent)
 * - Auto-preflight in the SSE pipeline (stream/route.ts)
 *
 * Same function, same config, same output — guaranteed consistency.
 */
export function runPreflightChecks(input: RunPreflightInput): PreflightResult {
    const { exportPath, config, reviewItems } = input;

    // Build a minimal quality-only check from review items
    // (the full path-specific validators need typed config + mapped sections,
    //  which may not be available in the generic path)
    const checks: PreflightCheck[] = [];

    // ── Quality: Low confidence items ──
    const lowConfCount = reviewItems.filter(
        item => item.includedInExport && item.confidence < 0.5,
    ).length;
    checks.push({
        id: 'low_confidence_items',
        label: 'Low confidence items',
        severity: lowConfCount > 0 ? 'warning' : 'pass',
        detail: lowConfCount > 0
            ? `${lowConfCount} item${lowConfCount > 1 ? 's' : ''} below 50% confidence`
            : 'All items above 50% confidence',
        category: 'quality',
    });

    // ── Critical: Zero included items ──
    const includedCount = reviewItems.filter(item => item.includedInExport).length;
    if (includedCount === 0) {
        checks.push({
            id: 'no_included_items',
            label: 'No items included',
            severity: 'critical',
            detail: exportPath === 'exhibit_document'
                ? 'Exhibit packet requires at least one exhibit entry.'
                : 'No items are included in the export. Cannot generate an empty document.',
            category: 'required_content',
        });
    } else {
        checks.push({
            id: 'items_included',
            label: 'Items included in export',
            severity: 'pass',
            detail: `${includedCount} item${includedCount > 1 ? 's' : ''} included`,
            category: 'required_content',
        });
    }

    // ── Critical: Court doc without caption data (both fields required) ──
    if (exportPath === 'court_document') {
        const hasCaption = !!config.courtState && !!config.petitionerName;
        if (!hasCaption) {
            checks.push({
                id: 'missing_caption',
                label: 'Missing caption data',
                severity: 'critical',
                detail: 'Court document requires caption data (court, parties). Set court profile first.',
                category: 'required_content',
            });
        }
    }

    // ── Required: Court settings (for court document path) ──
    if (exportPath === 'court_document') {
        const hasState = !!config.courtState;
        const hasCounty = !!config.courtCounty;
        checks.push({
            id: 'court_jurisdiction',
            label: 'Court jurisdiction specified',
            severity: hasState && hasCounty ? 'pass' : 'error',
            detail: hasState && hasCounty
                ? `${config.courtState}, ${config.courtCounty} County`
                : 'Missing court state or county',
            category: 'required_content',
        });

        const hasPetitioner = !!config.petitionerName;
        checks.push({
            id: 'petitioner_name',
            label: 'Petitioner identified',
            severity: hasPetitioner ? 'pass' : 'warning',
            detail: hasPetitioner ? String(config.petitionerName) : 'Petitioner name not set',
            category: 'required_content',
        });
    }

    // ── Evidence: Variety of evidence types ──
    const includedForVariety = reviewItems.filter(item => item.includedInExport);
    const types = new Set(includedForVariety.map(item => item.dominantType));
    checks.push({
        id: 'evidence_variety',
        label: 'Evidence type coverage',
        severity: includedForVariety.length === 0 ? 'error' : types.size >= 2 ? 'pass' : 'warning',
        detail: `${types.size} evidence type${types.size !== 1 ? 's' : ''} represented`,
        category: 'evidence',
    });

    return buildResult(checks);
}

