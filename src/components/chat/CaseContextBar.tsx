'use client';

/**
 * CaseContextBar — persistent case-aware context bar at top of chat.
 *
 * Shows chips derived from court settings / case graph:
 * - Jurisdiction, case type, status flags
 * - Tone per chip: info (blue), warning (amber), neutral, success (green)
 */

import type { CaseContextChip, PanelTone } from '@/lib/ui-intelligence/types';

// ---------------------------------------------------------------------------
// Tone → chip styles
// ---------------------------------------------------------------------------

const CHIP_STYLES: Record<PanelTone, string> = {
  neutral: 'bg-[var(--surface-card)] text-[var(--text-body)] border-[var(--border-subtle)]',
  info: 'bg-[var(--accent-icy)]/10 text-[var(--accent-icy)] border-[var(--accent-icy)]/20',
  success: 'bg-[var(--success-soft)]/10 text-[var(--success-soft)] border-[var(--success-soft)]/20',
  warning: 'bg-[var(--warning-muted)]/10 text-[var(--warning-muted)] border-[var(--warning-muted)]/20',
  support: 'bg-[var(--support-violet)]/10 text-[var(--support-violet)] border-[var(--support-violet)]/20',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CaseContextBarProps {
  chips: CaseContextChip[];
  caseName?: string;
}

export function CaseContextBar({ chips, caseName }: CaseContextBarProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)] overflow-x-auto scrollbar-thin">
      {/* Case name */}
      {caseName && (
        <span className="text-xs font-semibold text-[var(--text-heading)] whitespace-nowrap mr-1">
          {caseName}
        </span>
      )}

      {/* Separator */}
      {caseName && (
        <span className="w-px h-4 bg-[var(--border-subtle)] flex-shrink-0" />
      )}

      {/* Context chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {chips.map((chip, i) => {
          const tone = chip.tone ?? 'neutral';
          return (
            <span
              key={`${chip.label}-${i}`}
              className={`
                inline-flex items-center px-2.5 py-1
                text-xs font-medium rounded-full border
                whitespace-nowrap flex-shrink-0
                ${CHIP_STYLES[tone]}
              `}
            >
              {chip.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper: build chips from case graph
// ---------------------------------------------------------------------------

interface CaseGraphForChips {
  state?: string;
  county?: string;
  courtName?: string;
  caseType?: string;
  caseSubtype?: string;
  proSe?: boolean;
  childrenInvolved?: boolean;
  temporaryOrdersPending?: boolean;
  highSensitivity?: boolean;
}

export function buildCaseContextChips(graph: CaseGraphForChips): CaseContextChip[] {
  const chips: CaseContextChip[] = [];

  // Jurisdiction
  if (graph.state) {
    chips.push({ label: graph.state, tone: 'info' });
  }
  if (graph.county) {
    chips.push({ label: `${graph.county} County`, tone: 'info' });
  }
  if (graph.courtName) {
    chips.push({ label: graph.courtName, tone: 'info' });
  }

  // Case type
  if (graph.caseType) {
    chips.push({ label: graph.caseType, tone: 'neutral' });
  }
  if (graph.caseSubtype) {
    chips.push({ label: graph.caseSubtype, tone: 'neutral' });
  }

  // Status flags
  if (graph.proSe) {
    chips.push({ label: 'Pro Se', tone: 'warning' });
  }
  if (graph.childrenInvolved) {
    chips.push({ label: 'Minor Child Involved', tone: 'warning' });
  }
  if (graph.temporaryOrdersPending) {
    chips.push({ label: 'Temporary Orders Pending', tone: 'warning' });
  }
  if (graph.highSensitivity) {
    chips.push({ label: 'High Sensitivity', tone: 'warning' });
  }

  return chips;
}
