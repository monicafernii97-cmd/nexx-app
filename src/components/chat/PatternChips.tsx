'use client';

/**
 * PatternChips — subtle intelligence chips showing detected patterns.
 *
 * Makes the interface feel intelligent and case-aware:
 * "Pattern: delay tactic", "Pattern: documentation gap", etc.
 */

import type { DetectedPattern, PatternType } from '@/lib/ui-intelligence/types';

// ---------------------------------------------------------------------------
// Pattern labels
// ---------------------------------------------------------------------------

const PATTERN_LABELS: Record<PatternType, string> = {
  delay_tactic: 'Repeated Scheduling Conflict',
  control_dispute: 'Communication Issue to Document',
  documentation_gap: 'Documentation Gap',
  routine_disruption: 'Routine Disruption Concern',
  notice_conflict: 'Recurring Notice Dispute',
  credibility_sensitivity: 'Record-Clarity Concern',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PatternChipsProps {
  patterns: DetectedPattern[];
}

/** Renders amber-toned pill indicators for detected behavioral or custody patterns. */
export function PatternChips({ patterns }: PatternChipsProps) {
  if (patterns.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {patterns.map((pattern, i) => (
        <span
          key={`${pattern.type}-${i}`}
          className="
            inline-flex items-center gap-1 px-2 py-0.5
            text-[10px] font-semibold tracking-wide uppercase
            rounded-full
            bg-[var(--warning-muted)]/10 text-[var(--warning-muted)]
            border border-[var(--warning-muted)]/20
          "
          title={pattern.label || PATTERN_LABELS[pattern.type]}
        >
          <span className="w-1 h-1 rounded-full bg-[var(--warning-muted)]" />
          {pattern.label || PATTERN_LABELS[pattern.type]}
        </span>
      ))}
    </div>
  );
}
