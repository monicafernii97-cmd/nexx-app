'use client';

/**
 * AnalysisStatusStrip — "thinking structure" indicator during generation.
 *
 * Shows subtle progress dots:
 * - Analyzing case context ●
 * - Reviewing evidence patterns ●
 * - Applying judge lens ●
 * - Structuring response ○
 *
 * Dots: green (complete), blue (active), gray (upcoming).
 */

import { motion, AnimatePresence } from 'framer-motion';
import type { AnalysisStep } from '@/lib/ui-intelligence/types';

// ---------------------------------------------------------------------------
// Default steps
// ---------------------------------------------------------------------------

/** Default 4-step analysis progression shown during streaming. */
export const DEFAULT_ANALYSIS_STEPS: AnalysisStep[] = [
  { id: 'context', label: 'Analyzing case context', status: 'upcoming' },
  { id: 'evidence', label: 'Reviewing evidence patterns', status: 'upcoming' },
  { id: 'judge', label: 'Applying judge lens', status: 'upcoming' },
  { id: 'structure', label: 'Structuring response', status: 'upcoming' },
];

// ---------------------------------------------------------------------------
// Dot colors
// ---------------------------------------------------------------------------

const DOT_COLORS = {
  complete: 'bg-[var(--success-soft)]',
  active: 'bg-[var(--accent-icy)]',
  upcoming: 'bg-[var(--text-muted)]/40',
} as const;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AnalysisStatusStripProps {
  steps: AnalysisStep[];
  visible: boolean;
}

/** Animated "thinking" indicator strip showing analysis step progression with color-coded dots. */
export function AnalysisStatusStrip({ steps, visible }: AnalysisStatusStripProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="
            flex items-center gap-4 px-4 py-2.5
            rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-subtle)]
            overflow-hidden
          "
        >
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-center gap-2">
              {/* Dot */}
              <motion.span
                className={`
                  w-2 h-2 rounded-full flex-shrink-0
                  ${DOT_COLORS[step.status]}
                `}
                animate={
                  step.status === 'active'
                    ? { scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }
                    : {}
                }
                transition={
                  step.status === 'active'
                    ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' }
                    : {}
                }
              />

              {/* Label */}
              <span
                className={`
                  text-xs whitespace-nowrap
                  ${
                    step.status === 'active'
                      ? 'text-[var(--accent-icy)] font-medium'
                      : step.status === 'complete'
                        ? 'text-[var(--text-body)]'
                        : 'text-[var(--text-muted)]'
                  }
                `}
              >
                {step.label}
              </span>

              {/* Connector line (except last) */}
              {i < steps.length - 1 && (
                <span
                  className={`
                    w-6 h-px flex-shrink-0
                    ${
                      step.status === 'complete'
                        ? 'bg-[var(--success-soft)]/50'
                        : 'bg-[var(--border-subtle)]'
                    }
                  `}
                />
              )}
            </div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Helper: advance steps based on elapsed time
// ---------------------------------------------------------------------------

/**
 * Returns updated steps with statuses based on elapsed seconds.
 * Useful for a simple timer-based progression.
 */
export function getStepsByElapsed(elapsedSeconds: number): AnalysisStep[] {
  return DEFAULT_ANALYSIS_STEPS.map((step, i) => {
    const threshold = (i + 1) * 1.5; // Each step ~1.5s apart
    if (elapsedSeconds >= threshold + 1.5) {
      return { ...step, status: 'complete' as const };
    } else if (elapsedSeconds >= threshold) {
      return { ...step, status: 'active' as const };
    }
    return { ...step, status: 'upcoming' as const };
  });
}
