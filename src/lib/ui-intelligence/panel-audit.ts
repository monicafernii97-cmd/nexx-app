/**
 * Panel Audit — analytics & recommendations for panel usage.
 *
 * Tracks which panels users actually interact with and generates
 * data-driven recommendations: promote high-value panels, demote
 * or retire low-value ones.
 *
 * Scoring formula: saved×3 + pinned×4 + copied×2 − dismissed×2
 */

import type { PanelType, PanelInteraction, PanelUsageEvent } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Aggregated engagement counts for a single panel type. */
export interface PanelEngagement {
    panelType: PanelType;
    /** Counts per interaction type */
    counts: Record<PanelInteraction, number>;
    /** Composite engagement score using weighted formula */
    score: number;
    /** Total number of times this panel was shown */
    impressions: number;
    /** Engagement rate: (interactions − shown) / shown */
    engagementRate: number;
}

/** Recommendation action for a panel based on usage data. */
export type PanelAction = 'promote' | 'demote' | 'test_variant' | 'merge' | 'retire';

/** A single panel recommendation derived from usage analytics. */
export interface PanelRecommendation {
    panelType: PanelType;
    action: PanelAction;
    score: number;
    reason: string;
}

// ---------------------------------------------------------------------------
// Interaction weights for composite scoring
// ---------------------------------------------------------------------------

const INTERACTION_WEIGHTS: Record<PanelInteraction, number> = {
    shown: 0,       // Passive — doesn't contribute to value score
    expanded: 1,    // Mild interest
    copied: 2,      // Active value extraction
    saved: 3,       // High commitment — user wants to keep it
    pinned: 4,      // Highest commitment — workspace-visible
    converted: 3,   // Active use — transformed into another object
    dismissed: -2,  // Negative signal — user didn't want this
};

// ---------------------------------------------------------------------------
// Score thresholds for recommendations
// ---------------------------------------------------------------------------

const PROMOTE_THRESHOLD = 10;
const DEMOTE_THRESHOLD = -3;
const RETIRE_THRESHOLD = -8;
const LOW_ENGAGEMENT_RATE = 0.05;  // <5% engagement → test_variant
const MERGE_IMPRESSION_MIN = 20;   // Need enough data before suggesting merge

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Compute per-panel engagement aggregates from raw usage events.
 *
 * @param events - Array of panel usage events
 * @returns Sorted array of engagement records (highest score first)
 */
export function computePanelEngagement(events: PanelUsageEvent[]): PanelEngagement[] {
    const buckets = new Map<PanelType, Record<PanelInteraction, number>>();

    for (const event of events) {
        let counts = buckets.get(event.panelType);
        if (!counts) {
            counts = { shown: 0, expanded: 0, copied: 0, saved: 0, pinned: 0, converted: 0, dismissed: 0 };
            buckets.set(event.panelType, counts);
        }
        counts[event.interaction] += 1;
    }

    const engagements: PanelEngagement[] = [];

    for (const [panelType, counts] of buckets) {
        const score = Object.entries(counts).reduce(
            (sum, [interaction, count]) =>
                sum + count * INTERACTION_WEIGHTS[interaction as PanelInteraction],
            0,
        );

        const impressions = counts.shown;
        const activeInteractions =
            counts.expanded + counts.copied + counts.saved + counts.pinned + counts.converted;
        const engagementRate = impressions > 0 ? activeInteractions / impressions : 0;

        engagements.push({ panelType, counts, score, impressions, engagementRate });
    }

    return engagements.sort((a, b) => b.score - a.score);
}

/**
 * Generate panel recommendations from usage data.
 *
 * Decision matrix:
 * - score ≥ 10       → promote (show earlier, widen eligibility)
 * - score ≤ -8       → retire  (remove from rotation)
 * - score ≤ -3       → demote  (show later, narrow eligibility)
 * - rate  < 5% (20+) → test_variant (try different framing)
 * - low + similar     → merge   (combine with related panel)
 *
 * @param events - Raw panel usage events
 * @returns Array of recommendations sorted by priority
 */
export function buildPanelRecommendations(events: PanelUsageEvent[]): PanelRecommendation[] {
    const engagements = computePanelEngagement(events);
    const recommendations: PanelRecommendation[] = [];

    for (const eng of engagements) {
        if (eng.score >= PROMOTE_THRESHOLD) {
            recommendations.push({
                panelType: eng.panelType,
                action: 'promote',
                score: eng.score,
                reason: `High engagement score (${eng.score}). Users save/pin this panel frequently — show it earlier.`,
            });
        } else if (eng.score <= RETIRE_THRESHOLD) {
            recommendations.push({
                panelType: eng.panelType,
                action: 'retire',
                score: eng.score,
                reason: `Very low engagement (${eng.score}). Users consistently dismiss — consider removing from rotation.`,
            });
        } else if (eng.score <= DEMOTE_THRESHOLD) {
            recommendations.push({
                panelType: eng.panelType,
                action: 'demote',
                score: eng.score,
                reason: `Negative engagement (${eng.score}). Frequent dismissals — show later or narrow eligibility.`,
            });
        } else if (
            eng.impressions >= MERGE_IMPRESSION_MIN &&
            eng.engagementRate < LOW_ENGAGEMENT_RATE
        ) {
            recommendations.push({
                panelType: eng.panelType,
                action: 'test_variant',
                score: eng.score,
                reason: `Low engagement rate (${(eng.engagementRate * 100).toFixed(1)}%) with ${eng.impressions} impressions — try different framing.`,
            });
        }
    }

    // Detect merge candidates: pairs of low-engagement panels that serve
    // similar purposes and could be consolidated into one.
    const lowEngagement = engagements.filter(
        (e) => e.score >= DEMOTE_THRESHOLD && e.score < PROMOTE_THRESHOLD &&
            e.impressions >= MERGE_IMPRESSION_MIN && e.engagementRate < LOW_ENGAGEMENT_RATE * 2,
    );
    if (lowEngagement.length >= 2) {
        // The two weakest panels are merge candidates
        const sorted = [...lowEngagement].sort((a, b) => a.score - b.score);
        recommendations.push({
            panelType: sorted[0].panelType,
            action: 'merge',
            score: sorted[0].score,
            reason: `Low engagement alongside ${sorted[1].panelType} — consider merging into a combined panel.`,
        });
    }

    // Sort: retire/demote first (urgent), then promote, then test_variant
    const priority: Record<PanelAction, number> = {
        retire: 0,
        demote: 1,
        promote: 2,
        test_variant: 3,
        merge: 4,
    };
    return recommendations.sort((a, b) => priority[a.action] - priority[b.action]);
}
