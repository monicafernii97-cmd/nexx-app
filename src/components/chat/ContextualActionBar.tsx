'use client';

/**
 * ContextualActionBar — action bar inside every assistant response.
 *
 * Shows only relevant actions based on tier + eligibility.
 * Recommended actions get accent styling.
 * Dispatches ActionType via callback prop.
 */

import type { IconProps } from '@phosphor-icons/react';
import {
  Copy,
  NotePencil,
  PushPin,
  FolderPlus,
  FileText,
  Handshake,
  Clock,
  Warning,
  FileArrowUp,
  FileCode,
  PencilLine,
  Strategy,
} from '@phosphor-icons/react';
import type { ActionType } from '@/lib/ui-intelligence/types';
import { getActionLabel, getActionTier } from '@/lib/ui-intelligence/action-routing';

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const ICON_MAP: Record<ActionType, React.ComponentType<IconProps>> = {
  copy: Copy,
  save_note: NotePencil,
  pin: PushPin,
  save_to_case: FolderPlus,
  save_strategy: Strategy,
  save_good_faith: Handshake,
  save_draft: FileText,
  add_to_timeline: Clock,
  convert_to_incident: Warning,
  convert_to_exhibit: FileArrowUp,
  insert_into_template: FileCode,
  create_draft: PencilLine,
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ContextualActionBarProps {
  allowedActions: ActionType[];
  recommendedActions: ActionType[];
  onAction: (action: ActionType) => void;
}

export function ContextualActionBar({
  allowedActions,
  recommendedActions,
  onAction,
}: ContextualActionBarProps) {
  // Sort actions by tier: universal → medium → higher
  const tierOrder = { universal: 0, medium: 1, higher: 2 };
  const sortedActions = [...allowedActions].sort(
    (a, b) => tierOrder[getActionTier(a)] - tierOrder[getActionTier(b)]
  );

  const recommendedSet = new Set(recommendedActions);

  return (
    <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-[var(--border-subtle)]">
      {sortedActions.map((action) => {
        const Icon = ICON_MAP[action];
        const isRecommended = recommendedSet.has(action);

        return (
          <button
            key={action}
            type="button"
            onClick={() => onAction(action)}
            className={`
              inline-flex items-center gap-1.5 px-3 py-1.5
              text-xs font-medium rounded-lg
              transition-all duration-150
              ${
                isRecommended
                  ? 'bg-[var(--accent-icy)]/10 text-[var(--accent-icy)] border border-[var(--accent-icy)]/30 hover:bg-[var(--accent-icy)]/20'
                  : 'bg-[var(--surface-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)] hover:text-[var(--text-body)] hover:border-[var(--accent-icy)]/20'
              }
            `}
            aria-label={getActionLabel(action)}
          >
            {Icon && <Icon size={14} />}
            <span className="hidden sm:inline">{getActionLabel(action)}</span>
          </button>
        );
      })}
    </div>
  );
}
