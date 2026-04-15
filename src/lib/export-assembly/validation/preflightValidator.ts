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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Severity levels for preflight checks. */
export type PreflightSeverity = 'pass' | 'warning' | 'error';

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

    // Party names
    const hasPetitioner = Boolean(courtSettings.petitionerLegalName?.trim());
    checks.push({
        id: 'party_petitioner',
        label: 'Filing Party Name',
        severity: hasPetitioner ? 'pass' : 'error',
        detail: hasPetitioner ? undefined : 'Filing party legal name is required for court documents.',
        category: 'required_content',
    });

    const hasRespondent = Boolean(courtSettings.respondentLegalName?.trim());
    checks.push({
        id: 'party_respondent',
        label: 'Opposing Party Name',
        severity: hasRespondent ? 'pass' : 'warning',
        detail: hasRespondent ? undefined : 'Opposing party name not set. Document may be incomplete.',
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
    _config: SummaryConfig,
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

    const hasTimeline = mappedSections.timelineSummary.length > 0;
    checks.push({
        id: 'timeline',
        label: 'Timeline Events',
        severity: hasTimeline ? 'pass' : 'warning',
        detail: hasTimeline ? undefined : 'No timeline events mapped.',
        category: 'required_content',
    });

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
    const errorCount = checks.filter(c => c.severity === 'error').length;
    const warningCount = checks.filter(c => c.severity === 'warning').length;
    const passCount = checks.filter(c => c.severity === 'pass').length;
    const total = checks.length;

    // Score: each pass = full points, each warning = half points, each error = 0
    const rawScore = total > 0
        ? ((passCount + warningCount * 0.5) / total) * 100
        : 100;
    const readinessScore = Math.round(rawScore);

    return {
        checks,
        errorCount,
        warningCount,
        readinessScore,
        canProceed: errorCount === 0,
    };
}
