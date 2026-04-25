/**
 * Section Diff Engine
 *
 * Word-level diff using the `diff` library. Produces structured
 * DiffSegment[] arrays that the UI renders — logic never touches CSS.
 *
 * Rules:
 * - Word-level granularity (not character-level)
 * - Output is structured segments, not HTML
 * - Pure function, no side effects
 */

import { diffWords } from 'diff';
import type { DiffSegment } from './types';
import { escapeHtml } from '@/lib/utils/htmlUtils';

/**
 * Compute a word-level diff between two strings.
 *
 * @param before - Previous content
 * @param after  - New content
 * @returns Array of diff segments with type annotations
 */
export function computeWordDiff(before: string, after: string): DiffSegment[] {
  if (before === after) {
    return [{ text: after, type: 'unchanged' }];
  }

  const changes = diffWords(before, after);
  const segments: DiffSegment[] = [];

  for (const change of changes) {
    if (!change.value) continue;

    if (change.added) {
      segments.push({ text: change.value, type: 'added' });
    } else if (change.removed) {
      segments.push({ text: change.value, type: 'removed' });
    } else {
      segments.push({ text: change.value, type: 'unchanged' });
    }
  }

  return segments;
}

/**
 * Render DiffSegment[] to HTML string with appropriate CSS classes.
 *
 * Used server-side only (e.g., for email/PDF previews).
 * The React DiffViewer component renders segments directly.
 */
export function renderDiffHTML(segments: DiffSegment[]): string {
  return `<div style="white-space: pre-wrap;">${segments
    .map((seg) => {
      switch (seg.type) {
        case 'added':
          return `<span class="section-change-added">${escapeHtml(seg.text)}</span>`;
        case 'removed':
          return `<span class="section-change-removed">${escapeHtml(seg.text)}</span>`;
        default:
          return escapeHtml(seg.text);
      }
    })
    .join('')}</div>`;
}
