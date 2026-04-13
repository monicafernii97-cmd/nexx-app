/**
 * Response Quality Feedback Loop — translates user behavior into system tuning signals.
 *
 * Analyzes interaction patterns to generate actionable recommendations
 * for adjusting panel selection, action density, and tone defaults.
 *
 * Signals are consumed by the presentation rules layer (future sprint)
 * to personalize the intelligence UI per user.
 */

import type { PanelType, PanelUsageEvent } from './types';
import { computePanelEngagement } from './panel-audit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Category of the feedback signal. */
export type SignalType =
    | 'boost_panel'       // Show this panel type more often / earlier
    | 'suppress_panel'    // Show this panel type less often
    | 'boost_action'      // Make actions more prominent
    | 'suppress_action'   // Reduce action bar density
    | 'adjust_tone'       // Change default drafting tone
    | 'adjust_density';   // Change panel density for an intent

/** Confidence level of the signal based on data volume. */
export type SignalConfidence = 'low' | 'medium' | 'high';

/** A single feedback signal derived from user behavior. */
export interface FeedbackSignal {
    type: SignalType;
    /** Human-readable description of the detected pattern */
    pattern: string;
    /** Actionable recommendation for the system */
    recommendation: string;
    /** Confidence based on data volume and consistency */
    confidence: SignalConfidence;
    /** Panel types involved in this signal */
    relatedPanels: PanelType[];
}

// ---------------------------------------------------------------------------
// Signal extractors
// ---------------------------------------------------------------------------

type SignalExtractor = (events: PanelUsageEvent[]) => FeedbackSignal | null;

/**
 * Detect heavy copy usage on drafting panels.
 * "User copies drafting panels frequently" → boost court_ready_version priority.
 */
const detectDraftingCopyHabit: SignalExtractor = (events) => {
    const draftingPanels: PanelType[] = [
        'court_ready_version', 'suggested_reply', 'alternate_version',
        'more_neutral_version', 'tone_adjustment',
    ];
    const draftCopied = events.filter(
        (e) => e.interaction === 'copied' && draftingPanels.includes(e.panelType),
    ).length;
    const totalCopied = events.filter((e) => e.interaction === 'copied').length;

    if (totalCopied < 5) return null;
    const ratio = draftCopied / totalCopied;

    if (ratio > 0.5) {
        return {
            type: 'boost_panel',
            pattern: `User copies drafting panels ${(ratio * 100).toFixed(0)}% of the time (${draftCopied}/${totalCopied}).`,
            recommendation: 'Boost court_ready_version and suggested_reply priority in panel ordering.',
            confidence: totalCopied >= 20 ? 'high' : 'medium',
            relatedPanels: draftingPanels,
        };
    }
    return null;
};

/**
 * Detect low action bar usage.
 * "User ignores action bars" → reduce action density.
 */
const detectActionBarIgnored: SignalExtractor = (events) => {
    const shown = events.filter((e) => e.interaction === 'shown').length;
    const actionInteractions = events.filter(
        (e) => ['saved', 'pinned', 'converted'].includes(e.interaction),
    ).length;

    if (shown < 30) return null;
    const actionRate = actionInteractions / shown;

    if (actionRate < 0.02) {
        return {
            type: 'suppress_action',
            pattern: `Action interactions at only ${(actionRate * 100).toFixed(1)}% of impressions.`,
            recommendation: 'Reduce action bar prominence. Show fewer actions, or collapse by default.',
            confidence: shown >= 100 ? 'high' : 'medium',
            relatedPanels: [],
        };
    }
    return null;
};

/**
 * Detect heavy pinning of key facts.
 * "User pins key_facts heavily" → elevate key_takeaway placement.
 */
const detectKeyFactPinHabit: SignalExtractor = (events) => {
    const pinned = events.filter((e) => e.interaction === 'pinned');
    if (pinned.length < 3) return null;

    const keyFactPins = pinned.filter(
        (e) => e.panelType === 'key_takeaway' || e.panelType === 'overview',
    ).length;
    const ratio = keyFactPins / pinned.length;

    if (ratio > 0.4) {
        return {
            type: 'boost_panel',
            pattern: `User pins key_takeaway/overview panels ${(ratio * 100).toFixed(0)}% of the time.`,
            recommendation: 'Elevate key_takeaway to first position. User values concise facts.',
            confidence: pinned.length >= 10 ? 'high' : 'low',
            relatedPanels: ['key_takeaway', 'overview'],
        };
    }
    return null;
};

/**
 * Detect support mode over-structuring frustration.
 * "User dismisses support panels frequently" → lighter support responses.
 */
const detectSupportDismissPattern: SignalExtractor = (events) => {
    const supportPanels: PanelType[] = [
        'emotional_insight', 'validation_support', 'gentle_reframe',
    ];
    const supportEvents = events.filter((e) => supportPanels.includes(e.panelType));
    const dismissed = supportEvents.filter((e) => e.interaction === 'dismissed').length;
    const shown = supportEvents.filter((e) => e.interaction === 'shown').length;

    if (shown < 5) return null;
    const dismissRate = dismissed / shown;

    if (dismissRate > 0.3) {
        return {
            type: 'adjust_density',
            pattern: `Support panels dismissed ${(dismissRate * 100).toFixed(0)}% of the time.`,
            recommendation: 'Reduce panel count in support-mode responses. Use prose over structured cards.',
            confidence: shown >= 15 ? 'high' : 'medium',
            relatedPanels: supportPanels,
        };
    }
    return null;
};

/**
 * Detect tone preference from court_ready_version interactions.
 * "User dismisses formal drafts" → suggest softer default.
 */
const detectTonePreference: SignalExtractor = (events) => {
    const engagements = computePanelEngagement(events);
    const courtReady = engagements.find((e) => e.panelType === 'court_ready_version');
    const neutral = engagements.find((e) => e.panelType === 'more_neutral_version');

    if (!courtReady || !neutral) return null;
    if (courtReady.impressions < 5) return null;

    // If neutral version is copied/saved more than court-ready
    const neutralValue = neutral.counts.copied + neutral.counts.saved;
    const courtReadyValue = courtReady.counts.copied + courtReady.counts.saved;

    if (neutralValue > courtReadyValue && neutralValue >= 3) {
        return {
            type: 'adjust_tone',
            pattern: `more_neutral_version preferred (${neutralValue} saves/copies) over court_ready_version (${courtReadyValue}).`,
            recommendation: 'Default drafting tone to more_neutral_version. Offer court-ready as an upgrade option.',
            confidence: (neutralValue + courtReadyValue) >= 10 ? 'high' : 'medium',
            relatedPanels: ['court_ready_version', 'more_neutral_version', 'tone_adjustment'],
        };
    }
    return null;
};

/**
 * Detect follow-up question pattern.
 * If users frequently expand follow_up_questions, the initial response
 * may be missing details.
 */
const detectFollowUpPattern: SignalExtractor = (events) => {
    const followUp = events.filter(
        (e) => e.panelType === 'follow_up_questions' && e.interaction === 'expanded',
    ).length;
    const totalShown = events.filter((e) => e.interaction === 'shown').length;

    if (totalShown < 20 || totalShown === 0) return null;
    const ratio = followUp / totalShown;

    if (ratio > 0.15) {
        return {
            type: 'boost_panel',
            pattern: `follow_up_questions expanded in ${(ratio * 100).toFixed(0)}% of responses.`,
            recommendation: 'Responses may lack specificity. Consider boosting gather_this_next or adding detail to initial analysis.',
            confidence: totalShown >= 50 ? 'high' : 'medium',
            relatedPanels: ['follow_up_questions', 'gather_this_next'],
        };
    }
    return null;
};

// ---------------------------------------------------------------------------
// All signal extractors
// ---------------------------------------------------------------------------

const SIGNAL_EXTRACTORS: SignalExtractor[] = [
    detectDraftingCopyHabit,
    detectActionBarIgnored,
    detectKeyFactPinHabit,
    detectSupportDismissPattern,
    detectTonePreference,
    detectFollowUpPattern,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze panel usage events and extract feedback signals.
 *
 * @param events - Raw panel usage events
 * @returns Array of feedback signals sorted by confidence (high → low)
 */
export function buildFeedbackSignals(events: PanelUsageEvent[]): FeedbackSignal[] {
    const signals: FeedbackSignal[] = [];

    for (const extractor of SIGNAL_EXTRACTORS) {
        const signal = extractor(events);
        if (signal) signals.push(signal);
    }

    // Sort by confidence: high → medium → low
    const confidenceOrder: Record<SignalConfidence, number> = { high: 0, medium: 1, low: 2 };
    return signals.sort((a, b) => confidenceOrder[a.confidence] - confidenceOrder[b.confidence]);
}
