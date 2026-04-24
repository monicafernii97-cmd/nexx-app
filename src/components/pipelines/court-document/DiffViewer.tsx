'use client';

import React from 'react';
import type { DiffSegment } from '@/lib/court-documents/types';

interface DiffViewerProps {
  /** Structured diff segments from computeWordDiff() */
  segments: DiffSegment[];
}

/**
 * DiffViewer: Renders structured DiffSegment[] with CSS classes.
 *
 * This component ONLY renders. No logic, no state.
 * Segments come from sectionDiff.ts via the state owner.
 */
export default function DiffViewer({ segments }: DiffViewerProps) {
  if (!segments.length) {
    return <span className="text-white/30 italic">No changes</span>;
  }

  return (
    <div className="diff-viewer-content font-serif leading-relaxed text-[15px] text-white/90">
      {segments.map((seg, i) => {
        switch (seg.type) {
          case 'added':
            return (
              <span key={i} className="section-change-added">
                {seg.text}
              </span>
            );
          case 'removed':
            return (
              <span key={i} className="section-change-removed">
                {seg.text}
              </span>
            );
          default:
            return <span key={i}>{seg.text}</span>;
        }
      })}
    </div>
  );
}
