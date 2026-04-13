/**
 * Route Created Item — Routes items created from chat to their correct destination.
 *
 * When a user performs a "Convert This Into..." action, this module determines
 * the correct Convex mutation and destination path based on the target type.
 */

import type { ActionResult, ItemSource } from './types';

// ---------------------------------------------------------------------------
// Destination routing
// ---------------------------------------------------------------------------

export type ConvertTarget =
    | 'exhibit_summary'
    | 'incident_narrative'
    | 'affidavit_language'
    | 'motion_paragraph'
    | 'hearing_outline'
    | 'timeline_item';

interface RouteConfig {
    /** Save type for caseMemory */
    saveType: string;
    /** Human-readable label for toast */
    label: string;
    /** Destination page path */
    href: string;
    /** Icon hint for the UI */
    icon: string;
}

const CONVERT_ROUTES: Record<ConvertTarget, RouteConfig> = {
    exhibit_summary: {
        saveType: 'exhibit_note',
        label: 'Exhibit Summary',
        href: '/docuvault',
        icon: 'FileText',
    },
    incident_narrative: {
        saveType: 'incident_note',
        label: 'Incident Narrative',
        href: '/incidents',
        icon: 'SealWarning',
    },
    affidavit_language: {
        saveType: 'draft_snippet',
        label: 'Affidavit Language',
        href: '/chat/drafts',
        icon: 'FileText',
    },
    motion_paragraph: {
        saveType: 'draft_snippet',
        label: 'Motion Paragraph',
        href: '/chat/drafts',
        icon: 'FileText',
    },
    hearing_outline: {
        saveType: 'hearing_prep_point',
        label: 'Hearing Outline',
        href: '/chat/key-points',
        icon: 'Strategy',
    },
    timeline_item: {
        saveType: 'timeline_candidate',
        label: 'Timeline Event',
        href: '/chat/timeline',
        icon: 'CalendarCheck',
    },
};

/**
 * Get the routing configuration for a convert target.
 */
export function getConvertRoute(target: ConvertTarget): RouteConfig {
    return CONVERT_ROUTES[target];
}

/**
 * Build an ActionResult for a successful conversion.
 */
export function buildConvertResult(
    target: ConvertTarget,
    source: ItemSource,
): ActionResult {
    const route = CONVERT_ROUTES[target];
    return {
        success: true,
        toastTitle: `Created ${route.label}`,
        toastDescription: `Saved from chat conversation`,
        destination: {
            label: `View in ${route.label.split(' ')[0]}`,
            href: route.href,
        },
    };
}

/**
 * All available convert targets with their labels for the ConvertMenu.
 */
export const CONVERT_OPTIONS: Array<{ target: ConvertTarget; label: string; icon: string }> = [
    { target: 'exhibit_summary', label: 'Exhibit Summary', icon: 'FileText' },
    { target: 'incident_narrative', label: 'Incident Narrative', icon: 'SealWarning' },
    { target: 'affidavit_language', label: 'Affidavit Language', icon: 'FileText' },
    { target: 'motion_paragraph', label: 'Motion Paragraph', icon: 'FileText' },
    { target: 'hearing_outline', label: 'Hearing Outline', icon: 'Strategy' },
    { target: 'timeline_item', label: 'Timeline Event', icon: 'CalendarCheck' },
];
