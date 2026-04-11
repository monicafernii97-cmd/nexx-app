'use client';

/**
 * LocalProcedureBadge — badge when response includes court/county/state procedure.
 *
 * Adds trust signaling:
 * "Texas procedure applied", "Fort Bend context", etc.
 */

import { Scales } from '@phosphor-icons/react';
import type { LocalProcedureInfo } from '@/lib/ui-intelligence/types';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface LocalProcedureBadgeProps {
  info: LocalProcedureInfo;
}

/** Blue trust badge showing jurisdiction-specific court and filing details. */
export function LocalProcedureBadge({ info }: LocalProcedureBadgeProps) {
  return (
    <span
      className="
        inline-flex items-center gap-1 px-2 py-0.5
        text-[10px] font-semibold tracking-wide
        rounded-full
        bg-[var(--accent-icy)]/10 text-[var(--accent-icy)]
        border border-[var(--accent-icy)]/20
      "
      title={info.detail?.trim() || `${info.jurisdiction} procedure applied`}
    >
      <Scales size={10} weight="bold" />
      {info.jurisdiction} procedure
    </span>
  );
}
