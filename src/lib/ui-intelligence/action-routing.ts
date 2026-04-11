/**
 * Action Routing — labels, icons, and tier classification for all 12 action types.
 */

import type { ActionType, ActionTier } from './types';

// ---------------------------------------------------------------------------
// Action Labels
// ---------------------------------------------------------------------------

export const ACTION_LABELS: Record<ActionType, string> = {
  copy: 'Copy',
  save_note: 'Save Note',
  pin: 'Pin',
  save_to_case: 'Save to Case',
  save_strategy: 'Save Strategy',
  save_good_faith: 'Save Good-Faith',
  save_draft: 'Save Draft',
  add_to_timeline: 'Add to Timeline',
  convert_to_incident: 'Convert to Incident',
  convert_to_exhibit: 'Convert to Exhibit',
  insert_into_template: 'Insert into Template',
  create_draft: 'Create Draft',
};

// ---------------------------------------------------------------------------
// Action Icons — Phosphor icon names (regular weight)
// ---------------------------------------------------------------------------

export const ACTION_ICONS: Record<ActionType, string> = {
  copy: 'Copy',
  save_note: 'NotePencil',
  pin: 'PushPin',
  save_to_case: 'FolderPlus',
  save_strategy: 'Strategy',
  save_good_faith: 'Handshake',
  save_draft: 'FileText',
  add_to_timeline: 'Clock',
  convert_to_incident: 'Warning',
  convert_to_exhibit: 'FileArrowUp',
  insert_into_template: 'FileCode',
  create_draft: 'PencilLine',
};

// ---------------------------------------------------------------------------
// Action Tiers
// ---------------------------------------------------------------------------

const TIER_MAP: Record<ActionType, ActionTier> = {
  // Universal — always shown
  copy: 'universal',
  save_note: 'universal',
  pin: 'universal',

  // Medium-context — shown when response has substantive content
  save_to_case: 'medium',
  save_strategy: 'medium',
  save_good_faith: 'medium',
  save_draft: 'medium',

  // Higher-context — requires message eligibility check
  add_to_timeline: 'higher',
  convert_to_incident: 'higher',
  convert_to_exhibit: 'higher',
  insert_into_template: 'higher',
  create_draft: 'higher',
};

/**
 * Get the visibility tier for an action.
 */
export function getActionTier(action: ActionType): ActionTier {
  return TIER_MAP[action] ?? 'higher';
}

/**
 * Get label for an action.
 */
export function getActionLabel(action: ActionType): string {
  return ACTION_LABELS[action] ?? action;
}

/**
 * Get Phosphor icon name for an action.
 */
export function getActionIcon(action: ActionType): string {
  return ACTION_ICONS[action] ?? 'DotsThree';
}

/**
 * Filter actions by tier.
 */
export function filterActionsByTier(actions: ActionType[], tier: ActionTier): ActionType[] {
  return actions.filter((a) => getActionTier(a) === tier);
}
