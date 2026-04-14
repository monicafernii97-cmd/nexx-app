/**
 * Relief Mapper — Connects issue clusters to candidate relief with evidence.
 *
 * Takes detected issues from classified nodes and timeline events,
 * then suggests appropriate relief with supporting evidence chains.
 *
 * Each ReliefConnection maps:
 *   issue → supporting events/evidence → suggested relief → reasoning
 */

import type { ClassifiedNode } from '../types/classification';
import type { TimelineEventNode, ReliefConnection } from '../types/narrative';

// ---------------------------------------------------------------------------
// Issue → Relief Mapping Rules
// ---------------------------------------------------------------------------

interface ReliefRule {
    issueTag: string;
    suggestedRelief: string;
    reasoningTemplate: string;
    /** Minimum node support to generate this relief connection */
    minNodeSupport: number;
    /** Keywords in events that strengthen this relief */
    eventKeywords: string[];
}

const RELIEF_RULES: ReliefRule[] = [
    {
        issueTag: 'electronic_communication',
        suggestedRelief:
            'Temporary clarification limiting calls to one scheduled weekly call during non-possession weeks',
        reasoningTemplate:
            'The prior reduced arrangement functioned for {years} and better aligns with the child\'s current school-week routine. {supportCount} documenting the ongoing dispute support this request.',
        minNodeSupport: 2,
        eventKeywords: [
            'facetime', 'video call', 'phone call', 'communication',
            'midweek', 'call', 'appclos', 'app close',
        ],
    },
    {
        issueTag: 'school_stability',
        suggestedRelief:
            'Order clarifying that the child\'s school-week routine shall not be disrupted by additional contact requirements',
        reasoningTemplate:
            'Evidence shows the child\'s school performance and routine stability are affected by scheduling conflicts. Supported by {supportCount} data points.',
        minNodeSupport: 2,
        eventKeywords: [
            'school', 'homework', 'grades', 'bedtime', 'routine',
            'academic', 'enrollment',
        ],
    },
    {
        issueTag: 'schedule_compliance',
        suggestedRelief:
            'Enforcement of the current possession schedule as written, or modification to reflect the parties\' established practice',
        reasoningTemplate:
            'The parties have operated under a {practice_type} arrangement. The recent departure from this practice has created instability. Supported by {supportCount} data points.',
        minNodeSupport: 3,
        eventKeywords: [
            'schedule', 'possession', 'pickup', 'drop-off', 'exchange',
            'visitation', 'modification',
        ],
    },
    {
        issueTag: 'travel_safety',
        suggestedRelief:
            'Order requiring advance notice and itinerary for out-of-area travel during periods of possession',
        reasoningTemplate:
            'Safety concerns regarding travel have been documented across {supportCount} instances. Prior notice requirements would address these concerns.',
        minNodeSupport: 2,
        eventKeywords: [
            'travel', 'trip', 'vacation', 'destination', 'safety',
            'out of state', 'passport',
        ],
    },
    {
        issueTag: 'medical_communication',
        suggestedRelief:
            'Order requiring both parties to share medical information and decisions within 24 hours',
        reasoningTemplate:
            'Medical communication breakdowns have been documented {supportCount} times. A clear communication protocol would serve the child\'s health interests.',
        minNodeSupport: 2,
        eventKeywords: [
            'medical', 'doctor', 'therapy', 'medication', 'health',
            'dental', 'diagnosis',
        ],
    },
    {
        issueTag: 'financial_dispute',
        suggestedRelief:
            'Clarification of expense-sharing obligations and reimbursement timeline',
        reasoningTemplate:
            'Financial disputes over {expense_type} have been documented across {supportCount} instances, creating ongoing friction between parties.',
        minNodeSupport: 2,
        eventKeywords: [
            'payment', 'reimbursement', 'expense', 'child support',
            'cost', 'financial', 'income',
        ],
    },
    {
        issueTag: 'notice_location',
        suggestedRelief:
            'Enforcement of notice requirements for residence changes and significant location changes',
        reasoningTemplate:
            'Documentation shows {supportCount} instances where notice requirements were not followed. Consistent enforcement would reduce conflict.',
        minNodeSupport: 2,
        eventKeywords: [
            'notice', 'location', 'address', 'move', 'relocation',
            'geographic',
        ],
    },
    {
        issueTag: 'parenting_conduct',
        suggestedRelief:
            'Appointment of a parenting coordinator or amicus attorney to address ongoing co-parenting disputes',
        reasoningTemplate:
            'The documented pattern of {supportCount} parenting conduct concerns suggests a neutral third party could reduce conflict and protect the child\'s interests.',
        minNodeSupport: 3,
        eventKeywords: [
            'co-parent', 'coparent', 'parenting', 'discipline',
            'supervision', 'neglect', 'substance',
        ],
    },
    {
        issueTag: 'delay_litigation',
        suggestedRelief:
            'Request for expedited hearing and order compelling timely responses',
        reasoningTemplate:
            'A pattern of {supportCount} documented delays supports the need for judicial intervention to ensure timely resolution.',
        minNodeSupport: 3,
        eventKeywords: [
            'delay', 'postpone', 'continuance', 'non-responsive',
            'missed deadline', 'extension',
        ],
    },
    {
        issueTag: 'court_procedure',
        suggestedRelief:
            'Request for the court to address procedural compliance and set clear deadlines',
        reasoningTemplate:
            'Procedural issues have been documented across {supportCount} instances, contributing to delays and inefficiency in resolution.',
        minNodeSupport: 2,
        eventKeywords: [
            'procedural', 'service', 'notice', 'filing', 'hearing',
            'deadline',
        ],
    },
];

// ---------------------------------------------------------------------------
// Relief Mapping
// ---------------------------------------------------------------------------

/**
 * Map detected issues to candidate relief with supporting evidence.
 *
 * For each issue that meets the minimum support threshold:
 * 1. Find all supporting nodes and events
 * 2. Collect evidence IDs
 * 3. Generate reasoning with dynamic templates
 * 4. Calculate confidence
 */
export function mapIssuesToRelief(
    issues: string[],
    nodes: ClassifiedNode[],
    events: TimelineEventNode[],
): ReliefConnection[] {
    const connections: ReliefConnection[] = [];
    let connectionId = 0;

    for (const issue of issues) {
        const rule = RELIEF_RULES.find(r => r.issueTag === issue);
        if (!rule) continue;

        // Find supporting nodes (those with this issue tag)
        const supportingNodes = nodes.filter(n => n.issueTags.includes(issue));
        if (supportingNodes.length < rule.minNodeSupport) continue;

        // Find supporting events
        const supportingEventIds: string[] = [];
        const supportingEvidenceIds: string[] = [];

        for (const event of events) {
            const combined = `${event.title} ${event.description}`.toLowerCase();
            if (rule.eventKeywords.some(kw => combined.includes(kw))) {
                supportingEventIds.push(event.id);
                if (event.linkedEvidenceIds) {
                    supportingEvidenceIds.push(...event.linkedEvidenceIds);
                }
            }
        }

        // Collect evidence from nodes
        for (const node of supportingNodes) {
            supportingEvidenceIds.push(...node.provenance.linkedEvidenceIds);
        }

        // Generate reasoning from template with dynamic values
        const supportCount = supportingNodes.length + supportingEventIds.length;
        const yearsEstimate = inferYearsFromDates(supportingNodes);
        const practiceType = inferPracticeType(supportingNodes);
        const expenseType = inferExpenseType(supportingNodes);

        const reasoning = rule.reasoningTemplate
            .replace('{supportCount}', `${supportCount}`)
            .replace('{years}', yearsEstimate)
            .replace('{practice_type}', practiceType)
            .replace('{expense_type}', expenseType);

        // Confidence: based on support volume and evidence linkage
        const hasEvidence = supportingEvidenceIds.length > 0;
        const confidence = Math.min(
            1,
            0.5 + (supportingNodes.length - rule.minNodeSupport) * 0.1 +
            (hasEvidence ? 0.15 : 0) +
            (supportingEventIds.length > 0 ? 0.1 : 0),
        );

        connections.push({
            id: `relief-${connectionId++}`,
            issue,
            suggestedRelief: rule.suggestedRelief,
            reasoning,
            supportingEventIds: [...new Set(supportingEventIds)],
            supportingEvidenceIds: [...new Set(supportingEvidenceIds)],
            confidence,
        });
    }

    return connections;
}

// ---------------------------------------------------------------------------
// Dynamic Template Value Inference
// ---------------------------------------------------------------------------

/** Estimate duration from earliest to latest date found in supporting nodes. */
function inferYearsFromDates(nodes: ClassifiedNode[]): string {
    const allDates: number[] = [];
    for (const node of nodes) {
        for (const dateStr of node.extractedEntities.dates) {
            const ms = Date.parse(dateStr);
            if (!Number.isNaN(ms)) allDates.push(ms);
        }
    }
    if (allDates.length < 2) return 'several years';

    const earliest = Math.min(...allDates);
    const latest = Math.max(...allDates);
    const years = Math.round((latest - earliest) / (365.25 * 24 * 60 * 60 * 1000));

    if (years < 1) return 'approximately one year';
    return `approximately ${years} year${years === 1 ? '' : 's'}`;
}

/** Infer practice type from node text. */
function inferPracticeType(nodes: ClassifiedNode[]): string {
    const combined = nodes.map(n => n.rawText.toLowerCase()).join(' ');

    if (combined.includes('informal') || combined.includes('mutual understanding')) {
        return 'informal mutual understanding';
    }
    if (combined.includes('flexible') || combined.includes('worked well')) {
        return 'flexible co-parenting arrangement';
    }
    if (combined.includes('strict') || combined.includes('by the order')) {
        return 'strict order-based possession schedule';
    }
    return 'established co-parenting practice';
}

/** Infer expense type from node text. */
function inferExpenseType(nodes: ClassifiedNode[]): string {
    const combined = nodes.map(n => n.rawText.toLowerCase()).join(' ');

    if (combined.includes('medical') || combined.includes('health')) return 'medical expenses';
    if (combined.includes('tuition') || combined.includes('school')) return 'educational expenses';
    if (combined.includes('extracurricular') || combined.includes('activity')) return 'extracurricular expenses';
    if (combined.includes('insurance')) return 'insurance costs';
    return 'shared child-related expenses';
}
