/**
 * Issue Tagger — Issue, pattern, and section suggestion assignment.
 *
 * Takes a ClassifiedNode and:
 * 1. Assigns issue tags (e.g., 'electronic_communication', 'school_stability')
 * 2. Assigns pattern tags (e.g., 'flexibility_reversion', 'delay_tactics')
 * 3. Suggests destination sections per export path based on score thresholds
 */

import type { ClassifiedNode, ContentScoreSet } from '../types/classification';

// ---------------------------------------------------------------------------
// Issue Tag Detection
// ---------------------------------------------------------------------------

/** Issue category definition with keyword triggers. */
interface IssueCategory {
    tag: string;
    keywords: string[];
}

const ISSUE_CATEGORIES: IssueCategory[] = [
    {
        tag: 'electronic_communication',
        keywords: [
            'facetime', 'video call', 'phone call', 'virtual call',
            'appclos', 'app close', 'text', 'email', 'message',
            'communication', 'contact', 'midweek call',
        ],
    },
    {
        tag: 'school_stability',
        keywords: [
            'school', 'enrollment', 'tutor', 'homework', 'grades',
            'academic', 'teacher', 'classroom', 'education',
            'school district', 'school night', 'school week',
        ],
    },
    {
        tag: 'schedule_compliance',
        keywords: [
            'schedule', 'possession', 'visitation', 'pickup', 'drop-off',
            'exchange', 'period of possession', 'standard possession',
            'expanded possession', 'modification',
        ],
    },
    {
        tag: 'travel_safety',
        keywords: [
            'travel', 'trip', 'vacation', 'out of state', 'out of country',
            'passport', 'itinerary', 'destination', 'safety',
            'car seat', 'seatbelt', 'transportation',
        ],
    },
    {
        tag: 'medical_communication',
        keywords: [
            'medical', 'doctor', 'hospital', 'therapy', 'therapist',
            'medication', 'health', 'dental', 'counselor', 'diagnosis',
            'treatment', 'prescription', 'illness', 'injury',
        ],
    },
    {
        tag: 'financial_dispute',
        keywords: [
            'child support', 'payment', 'reimbursement', 'expense',
            'tuition', 'insurance', 'medical bill', 'cost',
            'financial', 'income', 'arrears',
        ],
    },
    {
        tag: 'notice_location',
        keywords: [
            'notice', 'notification', 'inform', 'prior notice',
            'location', 'address', 'whereabouts', 'residence',
            'move', 'relocation', 'geographic restriction',
        ],
    },
    {
        tag: 'parenting_conduct',
        keywords: [
            'co-parent', 'coparent', 'parenting', 'discipline',
            'supervision', 'neglect', 'abuse', 'substance',
            'alcohol', 'drug', 'endangerment', 'exposure',
        ],
    },
    {
        tag: 'court_procedure',
        keywords: [
            'filed', 'motion', 'hearing', 'court', 'order',
            'decree', 'ruling', 'judgment', 'contempt',
            'enforcement', 'modification', 'appeal',
        ],
    },
    {
        tag: 'delay_litigation',
        keywords: [
            'delay', 'postpone', 'continuance', 'reschedule',
            'stall', 'non-responsive', 'failed to respond',
            'ignored', 'unavailable', 'missed deadline',
        ],
    },
];

/**
 * Assign issue tags based on text content and entity analysis.
 */
export function assignIssueTags(node: ClassifiedNode): string[] {
    const tags: string[] = [];
    const lower = node.rawText.toLowerCase();

    for (const category of ISSUE_CATEGORIES) {
        const matchCount = category.keywords.filter(kw => lower.includes(kw)).length;
        // Require at least 2 keyword matches to assign an issue tag
        if (matchCount >= 2) {
            tags.push(category.tag);
        }
    }

    return [...new Set(tags)];
}

// ---------------------------------------------------------------------------
// Pattern Tag Detection
// ---------------------------------------------------------------------------

/** Pattern definition with text markers. */
interface PatternDefinition {
    tag: string;
    markers: string[];
}

const PATTERN_DEFINITIONS: PatternDefinition[] = [
    {
        tag: 'flexibility_history',
        markers: [
            'historically flexible', 'prior practice', 'informally agreed',
            'have always', 'we used to', 'for years', 'longstanding',
            'established practice', 'mutual understanding', 'worked well',
        ],
    },
    {
        tag: 'flexibility_reversion',
        markers: [
            'now demands', 'suddenly', 'changed position', 'reversed',
            'no longer willing', 'strict enforcement', 'insists on',
            'new demand', 'departed from', 'unilaterally',
        ],
    },
    {
        tag: 'noncompliance_allegations',
        markers: [
            'violation', 'noncompliance', 'failed to comply', 'in contempt',
            'did not follow', 'ignored the order', 'disregard',
            'breach', 'defied', 'refused to',
        ],
    },
    {
        tag: 'interpretation_dispute',
        markers: [
            'interpretation', 'ambiguous', 'unclear', 'vague',
            'reading of the order', 'meaning of', 'construed',
            'different understanding', 'does not say', 'order states',
        ],
    },
    {
        tag: 'routine_disruption',
        markers: [
            'routine disrupted', 'disrupts routine', 'inconsistent schedule',
            'confusion', 'instability', 'unpredictable', 'last minute',
            'no notice', 'surprise', 'uprooted',
        ],
    },
    {
        tag: 'delay_tactics',
        markers: [
            'delay', 'postpone', 'stalled', 'dragged out',
            'non-responsive', 'ignored requests', 'failed to respond',
            'slow-walked', 'continuance after continuance',
        ],
    },
    {
        tag: 'procedural_friction',
        markers: [
            'procedural', 'technical objection', 'improper service',
            'defective notice', 'filing error', 'administrative',
            'clerical', 'jurisdictional challenge',
        ],
    },
    {
        tag: 'expansion_attempt',
        markers: [
            'expand', 'additional', 'more time', 'increase',
            'beyond what the order', 'not in the order',
            'exceeds', 'overstep', 'extra requirements',
        ],
    },
];

/**
 * Assign pattern tags based on text content.
 */
export function assignPatternTags(node: ClassifiedNode): string[] {
    const tags: string[] = [];
    const lower = node.rawText.toLowerCase();

    for (const pattern of PATTERN_DEFINITIONS) {
        const matchCount = pattern.markers.filter(m => lower.includes(m)).length;
        // Require at least 2 marker matches to assign a pattern tag
        if (matchCount >= 2) {
            tags.push(pattern.tag);
        }
    }

    return [...new Set(tags)];
}

// ---------------------------------------------------------------------------
// Section Suggestion Rules
// ---------------------------------------------------------------------------

/**
 * Suggest destination sections per export path based on score thresholds.
 *
 * Rules from spec:
 *
 * Case Summary:
 *   fact > 0.6 && timeline_event > 0.45 → "timelineSummary"
 *   issue > 0.45 → "keyIssues"
 *   risk > 0.45 → "gapsOrOpenQuestions"
 *   evidence_reference > 0.5 → "evidenceOverview"
 *   argument > 0.5 → "patternSummary"
 *
 * Court Document:
 *   fact > 0.6 → "factualBackground"
 *   argument > 0.55 → "argumentSections"
 *   request > 0.55 → "requestedRelief"
 *   procedure > 0.5 → "procedureNotes"
 *   evidence_reference > 0.5 → "exhibitReferences"
 *
 * Exhibit Document:
 *   evidence_reference > 0.55 → "indexEntries"
 *   fact > 0.45 && linkedEvidenceIds.length > 0 → "coverSheetSummaries"
 *   timeline_event > 0.45 → "groupedExhibits"
 */
export function suggestSections(
    scores: ContentScoreSet,
    hasLinkedEvidence: boolean,
): {
    case_summary: string[];
    court_document: string[];
    exhibit_document: string[];
} {
    const caseSummary: string[] = [];
    const courtDocument: string[] = [];
    const exhibitDocument: string[] = [];

    // ── Case Summary ──
    if (scores.fact > 0.6 && scores.timeline_event > 0.45) {
        caseSummary.push('timelineSummary');
    }
    if (scores.fact > 0.5) caseSummary.push('incidents');
    if (scores.issue > 0.45) caseSummary.push('keyIssues');
    if (scores.risk > 0.45) caseSummary.push('gapsOrOpenQuestions');
    if (scores.evidence_reference > 0.5) caseSummary.push('evidenceOverview');
    if (scores.argument > 0.5) caseSummary.push('patternSummary');
    if (scores.argument > 0.4 || scores.request > 0.4) {
        caseSummary.push('recommendedNextSteps');
    }

    // ── Court Document ──
    if (scores.fact > 0.6) courtDocument.push('factualBackground');
    if (scores.fact > 0.4 && scores.timeline_event > 0.3) {
        courtDocument.push('factualBackground');
    }
    if (scores.argument > 0.55) courtDocument.push('argumentSections');
    if (scores.argument > 0.4 && scores.issue > 0.3) {
        courtDocument.push('legalGrounds');
    }
    if (scores.request > 0.55) courtDocument.push('requestedRelief');
    if (scores.procedure > 0.5) courtDocument.push('procedureNotes');
    if (scores.evidence_reference > 0.5) courtDocument.push('exhibitReferences');

    // ── Exhibit Document ──
    if (scores.evidence_reference > 0.55) exhibitDocument.push('indexEntries');
    if (scores.fact > 0.45 && hasLinkedEvidence) {
        exhibitDocument.push('coverSheetSummaries');
    }
    if (scores.timeline_event > 0.45) exhibitDocument.push('groupedExhibits');

    return {
        case_summary: [...new Set(caseSummary)],
        court_document: [...new Set(courtDocument)],
        exhibit_document: [...new Set(exhibitDocument)],
    };
}
