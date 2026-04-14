/**
 * UI Self-Audit — detects UX anti-patterns from panel usage data.
 *
 * Runs 6 heuristic rules against aggregated panel events to identify
 * misalignments between system behavior and user needs. Each finding
 * includes severity, area, and an actionable recommendation.
 */

import type { PanelType, PanelUsageEvent } from './types';
import { computePanelEngagement } from './panel-audit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Severity levels for audit findings. */
export type AuditSeverity = 'info' | 'warning' | 'critical';

/** Area of the UI that the finding relates to. */
export type AuditArea =
    | 'panel_frequency'
    | 'panel_balance'
    | 'action_density'
    | 'tone_calibration'
    | 'intent_alignment';

/** A single audit finding with actionable recommendation. */
export interface UiAuditFinding {
    id: string;
    severity: AuditSeverity;
    area: AuditArea;
    summary: string;
    recommendation: string;
    /** Panel types implicated in this finding */
    affectedPanels: PanelType[];
}

/** Complete audit result. */
export interface UiLibraryAudit {
    /** ISO timestamp of when this audit was generated */
    generatedAt: string;
    /** Total events analyzed */
    eventCount: number;
    /** Individual findings */
    findings: UiAuditFinding[];
    /** Overall health: 'healthy' | 'needs_attention' | 'critical' */
    health: 'healthy' | 'needs_attention' | 'critical';
}

// ---------------------------------------------------------------------------
// Audit rules
// ---------------------------------------------------------------------------

type AuditRule = (events: PanelUsageEvent[]) => UiAuditFinding | null;

/** Strategic panels checked by the good-faith underuse rule. */
const STRATEGIC_PANELS = new Set<PanelType>([
    'judge_lens', 'risk_concern', 'strength_highlight',
    'good_faith_positioning', 'cooperation_signal',
]);

/** Reflective/support panels checked by the over-structuring rule. */
const SUPPORT_PANELS = new Set<PanelType>([
    'emotional_insight', 'validation_support', 'gentle_reframe',
    'pattern_detected', 'relationship_dynamic',
]);

/**
 * Rule 1: Overuse of best_next_steps.
 * If >40% of all shown panels are best_next_steps, the system is
 * relying too heavily on a generic panel type.
 */
const checkBestNextStepsOveruse: AuditRule = (events) => {
    const shown = events.filter((e) => e.interaction === 'shown');
    if (shown.length < 10) return null; // Not enough data

    const nextStepsCount = shown.filter((e) => e.panelType === 'best_next_steps').length;
    const ratio = nextStepsCount / shown.length;

    if (ratio > 0.4) {
        return {
            id: 'best_next_steps_overuse',
            severity: 'warning',
            area: 'panel_frequency',
            summary: `best_next_steps shown in ${(ratio * 100).toFixed(0)}% of responses (threshold: 40%).`,
            recommendation: 'Diversify panel selection. Consider boosting options_paths, decision_guide, or do_now_vs_later as alternatives.',
            affectedPanels: ['best_next_steps', 'options_paths', 'decision_guide', 'do_now_vs_later'],
        };
    }
    return null;
};

/**
 * Rule 2: Underuse of good_faith_positioning.
 * If good_faith_positioning is shown <10% of the time when strategic
 * panels are active, we're missing co-parenting strategy opportunities.
 */
const checkGoodFaithUnderuse: AuditRule = (events) => {
    const strategicShown = events.filter(
        (e) => e.interaction === 'shown' && STRATEGIC_PANELS.has(e.panelType),
    );
    if (strategicShown.length < 10) return null;

    const goodFaithCount = strategicShown.filter(
        (e) => e.panelType === 'good_faith_positioning',
    ).length;
    const ratio = goodFaithCount / strategicShown.length;

    if (ratio < 0.1) {
        return {
            id: 'good_faith_underuse',
            severity: 'warning',
            area: 'panel_balance',
            summary: `good_faith_positioning shown in only ${(ratio * 100).toFixed(0)}% of strategic panels.`,
            recommendation: 'Increase good_faith_positioning visibility in co-parenting and custody contexts.',
            affectedPanels: ['good_faith_positioning', 'cooperation_signal'],
        };
    }
    return null;
};

/**
 * Rule 3: Strength/Risk imbalance.
 * If users save strength_highlight 2x more than risk_concern,
 * the system may be over-indexing on risks.
 */
const checkStrengthRiskImbalance: AuditRule = (events) => {
    const engagements = computePanelEngagement(events);
    const strength = engagements.find((e) => e.panelType === 'strength_highlight');
    const risk = engagements.find((e) => e.panelType === 'risk_concern');

    if (!strength || !risk) return null;
    if (strength.counts.saved < 3) return null;

    if (strength.counts.saved > risk.counts.saved * 2) {
        return {
            id: 'strength_risk_imbalance',
            severity: 'info',
            area: 'panel_balance',
            summary: `Users save strength_highlight (${strength.counts.saved}×) far more than risk_concern (${risk.counts.saved}×).`,
            recommendation: 'Consider surfacing strength_highlight more prominently. Users find it more actionable than risk_concern.',
            affectedPanels: ['strength_highlight', 'risk_concern'],
        };
    }
    return null;
};

/**
 * Rule 4: Timeline actions shown but not used.
 * If timeline_candidate panels are frequently shown but rarely
 * converted/saved, we're adding noise.
 */
const checkTimelineActionNoise: AuditRule = (events) => {
    const timelineEvents = events.filter((e) => e.panelType === 'timeline_candidate');
    const shown = timelineEvents.filter((e) => e.interaction === 'shown').length;
    const acted = timelineEvents.filter(
        (e) => e.interaction === 'saved' || e.interaction === 'converted',
    ).length;

    if (shown < 10) return null;
    const actionRate = acted / shown;

    if (actionRate < 0.05) {
        return {
            id: 'timeline_action_noise',
            severity: 'warning',
            area: 'action_density',
            summary: `Timeline candidates shown ${shown}× but acted on only ${(actionRate * 100).toFixed(1)}% of the time.`,
            recommendation: 'Reduce timeline_candidate frequency or improve detection to show higher-confidence candidates only.',
            affectedPanels: ['timeline_candidate'],
        };
    }
    return null;
};

/**
 * Rule 5: Tone recalibration needed.
 * If court_ready_version is frequently dismissed, users may need
 * softer default tone settings.
 */
const checkToneCalibration: AuditRule = (events) => {
    const courtReadyEvents = events.filter((e) => e.panelType === 'court_ready_version');
    const shown = courtReadyEvents.filter((e) => e.interaction === 'shown').length;
    const dismissed = courtReadyEvents.filter((e) => e.interaction === 'dismissed').length;

    if (shown < 5) return null;
    const dismissRate = dismissed / shown;

    if (dismissRate > 0.3) {
        return {
            id: 'tone_recalibration',
            severity: 'info',
            area: 'tone_calibration',
            summary: `court_ready_version dismissed ${(dismissRate * 100).toFixed(0)}% of the time.`,
            recommendation: 'Users may prefer softer drafting tone. Consider defaulting to more_neutral_version or offering tone choice.',
            affectedPanels: ['court_ready_version', 'more_neutral_version', 'tone_adjustment'],
        };
    }
    return null;
};

/**
 * Rule 6: Support responses over-structured.
 * If reflective/support panels have high dismiss rates, we're turning
 * emotional support into workflow clutter.
 */
const checkSupportOverstructured: AuditRule = (events) => {
    const supportEvents = events.filter((e) => SUPPORT_PANELS.has(e.panelType));
    const shown = supportEvents.filter((e) => e.interaction === 'shown').length;
    const dismissed = supportEvents.filter((e) => e.interaction === 'dismissed').length;

    if (shown < 10) return null;
    const dismissRate = dismissed / shown;

    if (dismissRate > 0.4) {
        return {
            id: 'support_overstructured',
            severity: 'critical',
            area: 'intent_alignment',
            summary: `Support panels dismissed ${(dismissRate * 100).toFixed(0)}% of the time (${dismissed}/${shown}).`,
            recommendation: 'Reduce panel density in support-mode responses. Let empathy breathe — fewer panels, more prose.',
            affectedPanels: [...SUPPORT_PANELS],
        };
    }
    return null;
};

// ---------------------------------------------------------------------------
// All rules
// ---------------------------------------------------------------------------

const AUDIT_RULES: AuditRule[] = [
    checkBestNextStepsOveruse,
    checkGoodFaithUnderuse,
    checkStrengthRiskImbalance,
    checkTimelineActionNoise,
    checkToneCalibration,
    checkSupportOverstructured,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all audit rules against a set of panel usage events.
 *
 * @param events - Raw panel usage events to analyze
 * @returns Complete audit result with findings and health assessment
 */
export function buildUiLibraryAudit(events: PanelUsageEvent[]): UiLibraryAudit {
    const findings: UiAuditFinding[] = [];

    for (const rule of AUDIT_RULES) {
        const finding = rule(events);
        if (finding) findings.push(finding);
    }

    // Determine overall health
    const hasCritical = findings.some((f) => f.severity === 'critical');
    const hasWarning = findings.some((f) => f.severity === 'warning');
    const health = hasCritical ? 'critical' : hasWarning ? 'needs_attention' : 'healthy';

    return {
        generatedAt: new Date().toISOString(),
        eventCount: events.length,
        findings,
        health,
    };
}
