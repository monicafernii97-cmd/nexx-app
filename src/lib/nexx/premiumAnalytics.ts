/**
 * premiumAnalytics.ts — Evidence-based pattern detection and confidence scoring.
 *
 * Core Rule: Patterns must be EARNED, not inferred.
 *
 * A pattern is only shown when behavior is:
 * - Repeated (3+ separate events)
 * - Distributed across multiple dates
 * - Source-backed (each event tied to a message, timeline, or pin)
 * - Observable without inferring intent or personality
 *
 * Confidence scoring system (0-10):
 * - 0-4: Low → SUPPRESSED (never shown to user)
 * - 5-7: Medium → "Supported" badge
 * - 8-10: High → "Clearly Supported" badge
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Confidence = 'low' | 'medium' | 'high';

export interface PatternEvent {
    date: string;
    description: string;
    sourceType: 'message' | 'timeline' | 'pin';
    sourceId?: string;
}

export interface DetectedPattern {
    title: string;
    summary: string;
    supportingEvents: PatternEvent[];
    confidence: Confidence;
    score: number;
    category: BehaviorCategory;
}

export interface SuppressedCandidate {
    reason: string;
    eventCount: number;
    category: BehaviorCategory;
}

export interface PatternAnalysisResult {
    patterns: DetectedPattern[];
    suppressedCandidates: SuppressedCandidate[];
}

// ---------------------------------------------------------------------------
// Observable behavior categories (neutral, non-accusatory)
// ---------------------------------------------------------------------------

export const BEHAVIOR_CATEGORIES = [
    'missed_or_delayed_calls',
    'late_schedule_changes',
    'exchange_logistics_conflicts',
    'medical_information_disputes',
    'payment_nonresponse',
    'document_sharing_delays',
    'repeated_message_nonresponse',
    'repeated_conflicts_about_activity_disclosure',
    'communication_timing_conflicts',
    'transportation_logistics',
] as const;

export type BehaviorCategory = typeof BEHAVIOR_CATEGORIES[number];

// ---------------------------------------------------------------------------
// Confidence Scoring
// ---------------------------------------------------------------------------

interface ScoringInput {
    eventCount: number;
    distinctDates: number;
    allSourceBacked: boolean;
    behavioralSimilarity: 'weak' | 'moderate' | 'strong';
    observability: 'interpretive' | 'mostly_observable' | 'clearly_observable';
}

/**
 * Score a pattern candidate across 5 dimensions (0-2 each = 0-10 total).
 *
 * Hard gates must pass BEFORE any score is calculated:
 * - ≥ 3 events
 * - ≥ 2 distinct dates
 * - All events source-backed
 */
export function scorePattern(input: ScoringInput): {
    score: number;
    confidence: Confidence;
    eligibleToShow: boolean;
} {
    // ── Hard gates ──
    const passesHardGates =
        input.eventCount >= 3 &&
        input.distinctDates >= 2 &&
        input.allSourceBacked;

    if (!passesHardGates) {
        return { score: 0, confidence: 'low', eligibleToShow: false };
    }

    let score = 0;

    // 1. Repetition (0-2)
    score += input.eventCount >= 4 ? 2 : 1;

    // 2. Date spread (0-2)
    score += input.distinctDates >= 3 ? 2 : 1;

    // 3. Behavioral similarity (0-2)
    if (input.behavioralSimilarity === 'strong') score += 2;
    else if (input.behavioralSimilarity === 'moderate') score += 1;

    // 4. Source strength (0-2)
    score += input.allSourceBacked ? 2 : 0;

    // 5. Clarity/observability (0-2)
    if (input.observability === 'clearly_observable') score += 2;
    else if (input.observability === 'mostly_observable') score += 1;

    // Map to confidence bands
    let confidence: Confidence = 'low';
    if (score >= 8) confidence = 'high';
    else if (score >= 5) confidence = 'medium';

    return {
        score,
        confidence,
        eligibleToShow: confidence !== 'low',
    };
}

/**
 * User-facing label for a confidence level.
 *
 * We avoid algorithmic language (High/Medium/Low confidence)
 * in favor of legally credible descriptions:
 * - High → "Clearly Supported"
 * - Medium → "Supported"
 * - Low → never shown to user
 */
export function getConfidenceLabel(confidence: Confidence): string {
    switch (confidence) {
        case 'high': return 'Clearly Supported';
        case 'medium': return 'Supported';
        case 'low': return '';
    }
}

/**
 * Extract distinct dates from a list of events.
 * Ignores time component — only counts unique calendar dates.
 */
export function countDistinctDates(events: PatternEvent[]): number {
    const dates = new Set(events.map(e => e.date.split('T')[0]));
    return dates.size;
}
