/**
 * Workspace Constants — Shared type lists and display configurations.
 *
 * These constants keep the GlobalWorkspaceRail, Key Points Explorer,
 * and other consumers aligned on which caseMemory types are surfaced.
 */

import type { SaveType } from '@/lib/ui-intelligence/types';

// ---------------------------------------------------------------------------
// Key-point types shown in the workspace rail (strategic subset)
// ---------------------------------------------------------------------------

/** Types surfaced as "Key Points" in the rail quick-view. */
export const RAIL_KEY_POINT_TYPES: SaveType[] = [
    'key_fact',
    'strategy_point',
    'risk_concern',
    'strength_highlight',
    'good_faith_point',
    'draft_snippet',
    'question_to_verify',
];

// ---------------------------------------------------------------------------
// All 12 SaveType filter tabs for the Key Points Explorer
// ---------------------------------------------------------------------------

export const ALL_SAVE_TYPE_TABS: { id: string; label: string }[] = [
    { id: 'all', label: 'All Points' },
    { id: 'key_fact', label: 'Facts' },
    { id: 'strategy_point', label: 'Strategy' },
    { id: 'risk_concern', label: 'Risks' },
    { id: 'strength_highlight', label: 'Strengths' },
    { id: 'good_faith_point', label: 'Good Faith' },
    { id: 'draft_snippet', label: 'Drafts' },
    { id: 'case_note', label: 'Notes' },
    { id: 'timeline_candidate', label: 'Timeline' },
    { id: 'incident_note', label: 'Incidents' },
    { id: 'exhibit_note', label: 'Exhibits' },
    { id: 'procedure_note', label: 'Procedure' },
    { id: 'question_to_verify', label: 'To Verify' },
];

// ---------------------------------------------------------------------------
// Safe date parsing (shared between overview + timeline)
// ---------------------------------------------------------------------------

/** Parse an optional date string, returning NaN-safe timestamp or fallback. */
export function parseEventDate(dateStr?: string, fallback?: number): number {
    if (!dateStr) return fallback ?? 0;
    const t = new Date(dateStr).getTime();
    return Number.isNaN(t) ? (fallback ?? 0) : t;
}

/** Parse an optional date string into a validated Date for display, or null. */
export function safeEventDate(dateStr?: string): Date | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? null : d;
}
