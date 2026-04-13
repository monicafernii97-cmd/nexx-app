/**
 * Template Context — Builds context from case graph for template compatibility checking.
 *
 * Used by the template system to determine:
 * - Which templates are compatible with the current case
 * - What facts are missing before a template can be used
 * - Dynamic section selection based on case attributes
 */

import type { CaseGraph } from '@/lib/nexx/caseGraph';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateContext {
    /** State abbreviation (e.g. "TX") */
    state: string;
    /** County name */
    county?: string;
    /** Full court name */
    courtName?: string;
    /** Case type (e.g. "divorce", "custody", "modification") */
    caseType: string;
    /** Whether the case is currently open */
    caseOpen: boolean;
    /** Whether the parties were/are married */
    married: boolean;
    /** Whether children are involved */
    childrenInvolved: boolean;
    /** User's role in the case */
    partyRole: 'petitioner' | 'respondent' | 'unknown';
    /** Whether the user has legal representation */
    represented: boolean;
    /** Court cause number */
    causeNumber?: string;
    /** Party names for caption */
    partyNames: {
        petitioner?: string;
        respondent?: string;
        childrenInitials?: string[];
    };
}

export interface TemplateCompatibility {
    /** Whether the template can be used with current case context */
    compatible: boolean;
    /** Facts that ARE present in the case graph */
    availableFacts: string[];
    /** Required facts that are MISSING */
    missingFacts: string[];
    /** Optional facts that would improve the draft */
    optionalMissing: string[];
    /** Compatibility score 0-100 */
    score: number;
}

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

/**
 * Build a TemplateContext from the structured CaseGraph.
 * Returns sensible defaults when fields are missing.
 */
export function buildTemplateContext(caseGraph: CaseGraph): TemplateContext {
    const jurisdiction = caseGraph.jurisdiction;
    const children = caseGraph.children ?? [];
    const parties = caseGraph.parties;

    return {
        state: jurisdiction?.state ?? '',
        county: jurisdiction?.county,
        courtName: jurisdiction?.courtType
            ? `${jurisdiction.county ?? ''} ${jurisdiction.courtType} Court`.trim()
            : undefined,
        // A10: Don't derive caseType from openIssues — it misclassifies templates.
        // Should come from a dedicated field when available.
        caseType: 'general',
        caseOpen: true,
        // A11: Don't assume married — default to false unless explicitly known
        married: false,
        childrenInvolved: children.length > 0,
        partyRole: (parties?.userRole === 'petitioner' || parties?.userRole === 'respondent')
            ? parties.userRole
            : 'unknown',
        represented: parties?.userHasAttorney ?? false,
        causeNumber: jurisdiction?.caseNumber,
        partyNames: {
            petitioner: parties?.userRole === 'petitioner' ? parties?.userName : parties?.opposingPartyName,
            respondent: parties?.userRole === 'respondent' ? parties?.userName : parties?.opposingPartyName,
            childrenInitials: children.map(c => c.initials).filter(Boolean),
        },
    };
}

// ---------------------------------------------------------------------------
// Compatibility checker
// ---------------------------------------------------------------------------

/** Standard required facts for common template types. */
const TEMPLATE_REQUIREMENTS: Record<string, { required: string[]; optional: string[] }> = {
    motion_temporary_orders: {
        required: ['state', 'caseType', 'partyRole', 'childrenInvolved'],
        optional: ['county', 'courtName', 'causeNumber', 'married'],
    },
    motion_modify: {
        required: ['state', 'caseType', 'partyRole'],
        optional: ['county', 'courtName', 'causeNumber', 'childrenInvolved'],
    },
    affidavit: {
        required: ['state', 'partyRole'],
        optional: ['county', 'courtName', 'causeNumber'],
    },
    motion_enforce: {
        required: ['state', 'caseType', 'partyRole'],
        optional: ['county', 'courtName', 'causeNumber'],
    },
    general: {
        required: ['state'],
        optional: ['county', 'caseType'],
    },
};

// A12: Boolean facts that must be `true` to count as "available"
const REQUIRED_TRUE_FACTS = new Set(['childrenInvolved', 'married']);

/**
 * Check whether a template is compatible with the current case context.
 */
export function checkTemplateCompatibility(
    templateType: string,
    context: TemplateContext,
): TemplateCompatibility {
    const requirements = TEMPLATE_REQUIREMENTS[templateType] ?? TEMPLATE_REQUIREMENTS.general;

    const available: string[] = [];
    const missing: string[] = [];
    const optionalMissing: string[] = [];

    for (const fact of requirements.required) {
        const value = context[fact as keyof TemplateContext];
        const isTruthyEnough = REQUIRED_TRUE_FACTS.has(fact)
            ? value === true
            : value !== undefined && value !== '' && value !== 'unknown';
        if (isTruthyEnough) {
            available.push(fact);
        } else {
            missing.push(fact);
        }
    }

    for (const fact of requirements.optional) {
        const value = context[fact as keyof TemplateContext];
        if (value !== undefined && value !== '' && value !== 'unknown') {
            available.push(fact);
        } else {
            optionalMissing.push(fact);
        }
    }

    const totalFacts = requirements.required.length + requirements.optional.length;
    const score = totalFacts > 0 ? Math.round((available.length / totalFacts) * 100) : 100;

    return {
        compatible: missing.length === 0,
        availableFacts: available,
        missingFacts: missing,
        optionalMissing,
        score,
    };
}
