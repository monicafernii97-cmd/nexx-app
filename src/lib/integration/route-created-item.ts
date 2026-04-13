/**
 * Route Created Item — Routes items created from chat to their correct destination.
 *
 * When a user performs a "Convert This Into..." action, this module determines
 * the correct Convex mutation and destination path based on the target type.
 */

import type { ActionResult } from './types';

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

/** Compile-time safe save types — prevents drift between routes and caseMemory schema. */
type SaveType =
    | 'exhibit_note'
    | 'incident_note'
    | 'draft_snippet'
    | 'hearing_prep_point'
    | 'timeline_candidate';

interface RouteConfig {
    /** Save type for caseMemory */
    saveType: SaveType;
    /** Human-readable label for toast */
    label: string;
    /** Short destination page name for "View in X" button */
    displayName: string;
    /** Destination page path */
    href: string;
    /** Icon hint for the UI */
    icon: string;
}

const CONVERT_ROUTES: Record<ConvertTarget, RouteConfig> = {
    exhibit_summary: {
        saveType: 'exhibit_note',
        label: 'Exhibit Summary',
        displayName: 'DocuVault',
        href: '/docuvault',
        icon: 'FileText',
    },
    incident_narrative: {
        saveType: 'incident_note',
        label: 'Incident Narrative',
        displayName: 'Incidents',
        href: '/incidents',
        icon: 'SealWarning',
    },
    affidavit_language: {
        saveType: 'draft_snippet',
        label: 'Affidavit Language',
        displayName: 'Drafts',
        href: '/chat/drafts',
        icon: 'FileText',
    },
    motion_paragraph: {
        saveType: 'draft_snippet',
        label: 'Motion Paragraph',
        displayName: 'Drafts',
        href: '/chat/drafts',
        icon: 'FileText',
    },
    hearing_outline: {
        saveType: 'hearing_prep_point',
        label: 'Hearing Outline',
        displayName: 'Key Points',
        href: '/chat/key-points',
        icon: 'Strategy',
    },
    timeline_item: {
        saveType: 'timeline_candidate',
        label: 'Timeline Event',
        displayName: 'Timeline',
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
): ActionResult {
    const route = CONVERT_ROUTES[target];
    return {
        success: true,
        toastTitle: `Created ${route.label}`,
        toastDescription: `Saved from chat conversation`,
        destination: {
            label: `View in ${route.displayName}`,
            href: route.href,
        },
    };
}

/**
 * All available convert targets with their labels for the ConvertMenu.
 * Derived from CONVERT_ROUTES to prevent config drift.
 */
export const CONVERT_OPTIONS: Array<{ target: ConvertTarget; label: string; icon: string }> =
    (Object.entries(CONVERT_ROUTES) as Array<[ConvertTarget, RouteConfig]>).map(
        ([target, config]) => ({
            target,
            label: config.label,
            icon: config.icon,
        })
    );
