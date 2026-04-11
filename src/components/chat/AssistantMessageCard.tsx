'use client';

/**
 * AssistantMessageCard — structured response wrapper replacing the
 * flat markdown blob for assistant messages.
 *
 * Features:
 * - Premium wrapper card with eyebrow label
 * - Stacks PanelRenderer components with Framer Motion stagger reveal
 * - Separates guidance and work-product zones
 * - ContextualActionBar at bottom
 * - Falls back to markdown for non-structured responses
 */

import { motion } from 'framer-motion';
import { PanelRenderer } from './PanelRenderer';
import { ContextualActionBar } from './ContextualActionBar';
import { PatternChips } from './PatternChips';
import { LocalProcedureBadge } from './LocalProcedureBadge';
import { splitGuidanceAndWorkProduct } from '@/lib/ui-intelligence/dual-output';
import type { AssistantResponseViewModel, ActionType, DetectedPattern, LocalProcedureInfo } from '@/lib/ui-intelligence/types';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface AssistantMessageCardProps {
  viewModel: AssistantResponseViewModel;
  patterns?: DetectedPattern[];
  procedureInfo?: LocalProcedureInfo;
  onAction: (action: ActionType, content?: string) => void;
  onCopy?: (content: string) => void;
}

export function AssistantMessageCard({
  viewModel,
  patterns,
  procedureInfo,
  onAction,
  onCopy,
}: AssistantMessageCardProps) {
  const { presentation, panels } = viewModel;
  const { guidance, workProduct } = splitGuidanceAndWorkProduct(panels);

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content).catch(() => {});
    onCopy?.(content);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="
        rounded-3xl border border-[var(--border-subtle)]
        bg-[var(--surface-elevated)]
        shadow-lg overflow-hidden
      "
    >
      {/* Header: Eyebrow + Intelligence Indicators */}
      <div className="px-5 pt-4 pb-2 flex flex-wrap items-center gap-2">
        <span className="text-eyebrow text-[var(--text-muted)]">
          Assistant Response
        </span>

        {/* Pattern Detection Chips */}
        {patterns && patterns.length > 0 && <PatternChips patterns={patterns} />}

        {/* Local Procedure Badge */}
        {procedureInfo && <LocalProcedureBadge info={procedureInfo} />}
      </div>

      {/* Guidance Zone */}
      {guidance.length > 0 && (
        <div className="px-5 pb-2 space-y-3">
          {guidance.map((panel, index) => (
            <PanelRenderer
              key={`${panel.type}-${index}`}
              panel={panel}
              index={index}
              onCopy={handleCopy}
            />
          ))}
        </div>
      )}

      {/* Work Product Zone */}
      {workProduct.length > 0 && (
        <div className="mx-5 mb-3 mt-1">
          <div className="text-eyebrow text-[var(--text-muted)] mb-2 flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--accent-icy)]" />
            Work Product
          </div>
          <div className="space-y-3">
            {workProduct.map((panel, index) => (
              <PanelRenderer
                key={`wp-${panel.type}-${index}`}
                panel={panel}
                index={guidance.length + index}
                onCopy={handleCopy}
              />
            ))}
          </div>
        </div>
      )}

      {/* Contextual Action Bar */}
      <div className="px-5 pb-4">
        <ContextualActionBar
          allowedActions={presentation.allowedActions}
          recommendedActions={presentation.recommendedActions}
          onAction={onAction}
        />
      </div>
    </motion.div>
  );
}
