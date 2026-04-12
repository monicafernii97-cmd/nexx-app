/**
 * Integration Types — Shared types for cross-module item creation and routing.
 *
 * When a user takes an action in chat (save, pin, convert, create draft/exhibit),
 * these types define the metadata and routing information needed to create items
 * in the correct destination module.
 */

import type { ActionType, SaveType } from '@/lib/ui-intelligence/types';

// ---------------------------------------------------------------------------
// Source traceability
// ---------------------------------------------------------------------------

/** Where this item originated — always traced back to a chat message. */
export interface ItemSource {
    messageId?: string;
    conversationId?: string;
    /** The action that triggered creation */
    action: ActionType;
    /** Timestamp of the action */
    actionAt: number;
}

// ---------------------------------------------------------------------------
// Save-to-case payload
// ---------------------------------------------------------------------------

/** Payload for saving a response section to case memory. */
export interface SaveToCasePayload {
    type: SaveType;
    title: string;
    content: string;
    source: ItemSource;
    /** Optional additional metadata (e.g., artifact JSON, panel type) */
    metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Pin payload
// ---------------------------------------------------------------------------

/** The 9 pinnable classifications. */
export type PinnableType =
    | 'key_fact'
    | 'strategy_point'
    | 'good_faith_point'
    | 'strength_highlight'
    | 'risk_concern'
    | 'hearing_prep_point'
    | 'draft_snippet'
    | 'question_to_verify'
    | 'timeline_anchor';

/** Payload for pinning an item to the workspace rail. */
export interface PinPayload {
    type: PinnableType;
    title: string;
    content: string;
    source: ItemSource;
}

// ---------------------------------------------------------------------------
// Timeline candidate payload
// ---------------------------------------------------------------------------

/** Payload for creating a timeline candidate from chat. */
export interface TimelineCandidatePayload {
    title: string;
    description: string;
    eventDate?: string;
    tags?: string[];
    source: ItemSource;
    linkedIncidentId?: string;
}

// ---------------------------------------------------------------------------
// Incident summary payload
// ---------------------------------------------------------------------------

/** Payload for creating an incident summary from chat. */
export interface IncidentSummaryPayload {
    narrative: string;
    category?: string;
    severity?: number;
    date?: string;
    time?: string;
    source: ItemSource;
    /** Whether to also create a linked timeline candidate */
    createTimelineEntry?: boolean;
}

// ---------------------------------------------------------------------------
// Draft payload
// ---------------------------------------------------------------------------

/** Payload for creating a draft from a chat response. */
export interface DraftPayload {
    title: string;
    content: string;
    source: ItemSource;
}

// ---------------------------------------------------------------------------
// Exhibit note payload
// ---------------------------------------------------------------------------

/** Payload for creating an exhibit note. */
export interface ExhibitNotePayload {
    title: string;
    content: string;
    source: ItemSource;
}

// ---------------------------------------------------------------------------
// Action result (returned to UI for toast routing)
// ---------------------------------------------------------------------------

/** Generic action result with destination info for toast feedback. */
export interface ActionResult {
    success: boolean;
    /** Human-readable label for the toast */
    toastTitle: string;
    toastDescription?: string;
    /** Where the item was saved — used for "View in ..." link */
    destination?: {
        label: string;
        href: string;
    };
    error?: string;
}

// ---------------------------------------------------------------------------
// Destination mapping
// ---------------------------------------------------------------------------

/** Maps action types to their destination page paths. */
export const ACTION_DESTINATIONS: Partial<Record<ActionType, { label: string; basePath: string }>> = {
    save_to_case: { label: 'Key Points', basePath: '/cases/key-points' },
    pin: { label: 'Pinned Items', basePath: '' },
    add_to_timeline: { label: 'Timeline', basePath: '/cases/timeline' },
    convert_to_incident: { label: 'Incident Reports', basePath: '/incidents' },
    convert_to_exhibit: { label: 'DocuVault', basePath: '/documents' },
    create_draft: { label: 'Drafts', basePath: '/cases/drafts' },
    save_draft: { label: 'Drafts', basePath: '/cases/drafts' },
    save_note: { label: 'Key Points', basePath: '/cases/key-points' },
    insert_into_template: { label: 'Templates', basePath: '/documents' },
};
