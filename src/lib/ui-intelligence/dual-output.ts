/**
 * Dual Output — Guidance vs Work Product zone separation.
 *
 * Inside one response, two visual zones:
 * - Guidance: plain-language explanation (standard body text)
 * - Work Product: court-usable output (copy-ready styled block)
 */

import type { PanelData, PanelType } from './types';

// ---------------------------------------------------------------------------
// Work Product Panel Types — these get copy-ready styling
// ---------------------------------------------------------------------------

const WORK_PRODUCT_PANELS: Set<PanelType> = new Set([
  'court_ready_version',
  'suggested_reply',
  'alternate_version',
  'more_neutral_version',
  'exhibit_note',
  'timeline_candidate',
  'incident_summary',
  'tone_adjustment',
]);

/**
 * Check if a panel is a work-product panel (court-usable output).
 */
export function isWorkProduct(panel: PanelData): boolean {
  return WORK_PRODUCT_PANELS.has(panel.type);
}

/**
 * Split panels into guidance and work-product zones.
 */
export function splitGuidanceAndWorkProduct(panels: PanelData[]): {
  guidance: PanelData[];
  workProduct: PanelData[];
} {
  const guidance: PanelData[] = [];
  const workProduct: PanelData[] = [];

  for (const panel of panels) {
    if (isWorkProduct(panel)) {
      workProduct.push(panel);
    } else {
      guidance.push(panel);
    }
  }

  return { guidance, workProduct };
}
