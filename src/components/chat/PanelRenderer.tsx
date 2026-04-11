'use client';

/**
 * PanelRenderer — Renders a single adaptive intelligence panel.
 *
 * Each panel gets:
 * - Distinct rounded card with tone-based coloring
 * - List content renders as <ol>, string content as <p>
 * - Collapsible via disclosure pattern
 * - Dual-theme aware via CSS variables
 */

import { useState, useId } from 'react';
import { motion } from 'framer-motion';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { getPanelTitle, getPanelTone } from '@/lib/ui-intelligence/panel-library';
import { isWorkProduct } from '@/lib/ui-intelligence/dual-output';
import type { PanelData, PanelTone } from '@/lib/ui-intelligence/types';

// ---------------------------------------------------------------------------
// Tone → CSS classes
// ---------------------------------------------------------------------------

const TONE_STYLES: Record<PanelTone, { card: string; eyebrow: string; border: string }> = {
  neutral: {
    card: 'bg-[var(--surface-card)]',
    eyebrow: 'text-[var(--text-muted)]',
    border: 'border-[var(--border-subtle)]',
  },
  info: {
    card: 'bg-[var(--surface-card)]',
    eyebrow: 'text-[var(--accent-icy)]',
    border: 'border-[var(--accent-icy)]/20',
  },
  success: {
    card: 'bg-[var(--surface-card)]',
    eyebrow: 'text-[var(--success-soft)]',
    border: 'border-[var(--success-soft)]/20',
  },
  warning: {
    card: 'bg-[var(--surface-card)]',
    eyebrow: 'text-[var(--warning-muted)]',
    border: 'border-[var(--warning-muted)]/20',
  },
  support: {
    card: 'bg-[var(--surface-card)]',
    eyebrow: 'text-[var(--support-violet)]',
    border: 'border-[var(--support-violet)]/20',
  },
};

// ---------------------------------------------------------------------------
// Work Product styling
// ---------------------------------------------------------------------------

const WORK_PRODUCT_CLASSES =
  'bg-[var(--surface-elevated)] border-l-2 border-l-[var(--accent-icy)] font-mono text-sm';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface PanelRendererProps {
  panel: PanelData;
  index?: number;
  onCopy?: (content: string) => void;
}

/** Renders a single intelligence panel card with tone coloring, collapse toggle, copy, and stagger animation. */
export function PanelRenderer({ panel, index = 0, onCopy }: PanelRendererProps) {
  const title = panel.title || getPanelTitle(panel.type);
  const tone = panel.tone ?? getPanelTone(panel.type);
  const styles = TONE_STYLES[tone];
  const isCollapsible = panel.collapsible ?? false;
  const [isExpanded, setIsExpanded] = useState(!isCollapsible);
  const panelId = useId();
  const contentId = `panel-content-${panelId}`;
  const isWP = isWorkProduct(panel);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3, ease: 'easeOut' }}
      className={`
        rounded-2xl border p-4 shadow-sm
        transition-all duration-150
        hover:shadow-md hover:border-[var(--accent-icy)]/30
        ${styles.card} ${styles.border}
        ${isWP ? WORK_PRODUCT_CLASSES : ''}
      `}
    >
      {/* Eyebrow + Collapse Toggle */}
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => isCollapsible && setIsExpanded((prev) => !prev)}
        role={isCollapsible ? 'button' : undefined}
        aria-expanded={isCollapsible ? isExpanded : undefined}
        aria-controls={isCollapsible ? contentId : undefined}
        tabIndex={isCollapsible ? 0 : undefined}
        onKeyDown={(e) => {
          if (isCollapsible && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            setIsExpanded((prev) => !prev);
          }
        }}
      >
        <span className={`text-eyebrow ${styles.eyebrow}`}>{title}</span>

        <div className="flex items-center gap-2">
          {/* Copy button for work-product panels */}
          {isWP && onCopy && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const text = Array.isArray(panel.content)
                  ? panel.content.join('\n')
                  : panel.content;
                onCopy(text);
              }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--accent-icy)] transition-colors px-2 py-1 rounded-lg hover:bg-[var(--surface-elevated)]"
              aria-label={`Copy ${title}`}
            >
              Copy
            </button>
          )}

          {isCollapsible && (
            <span className="text-[var(--text-muted)]">
              {isExpanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div id={contentId} className="mt-3">
          {Array.isArray(panel.content) ? (
            <ol className="list-decimal list-inside space-y-2">
              {panel.content.map((item, i) => (
                <li
                  key={i}
                  className="text-body text-[var(--text-body)] leading-relaxed"
                >
                  {item}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-body text-[var(--text-body)] leading-relaxed">
              {panel.content}
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}
