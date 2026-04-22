/**
 * Exhibit Label Formatter
 *
 * Generates exhibit labels in three styles:
 * - alpha:          A, B, … Z, AA, AB, …
 * - numeric:        1, 2, 3, …
 * - party_numeric:  PETITIONER'S EXHIBIT 1, …
 *
 * Uses base-26 algorithm for infinite alpha overflow.
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Supported label styles. */
export type ExhibitLabelStyle = 'alpha' | 'numeric' | 'party_numeric';

// ═══════════════════════════════════════════════════════════════
// Formatter
// ═══════════════════════════════════════════════════════════════

/**
 * Generate an exhibit label for a given 0-based index.
 *
 * @param index - 0-based exhibit index
 * @param style - Label style to use
 * @param partyName - Party name for party_numeric style
 * @returns Formatted label string
 */
export function formatExhibitLabel(
  index: number,
  style: ExhibitLabelStyle = 'alpha',
  partyName?: string,
): string {
  switch (style) {
    case 'alpha':
      return indexToAlpha(index);
    case 'numeric':
      return String(index + 1);
    case 'party_numeric':
      return `${(partyName || 'PETITIONER').toUpperCase()}'S EXHIBIT ${index + 1}`;
    default:
      return indexToAlpha(index);
  }
}

/**
 * Convert a 0-based index to an alpha label.
 * 0=A, 1=B, … 25=Z, 26=AA, 27=AB, … 51=AZ, 52=BA, …
 */
export function indexToAlpha(index: number): string {
  let result = '';
  let remainder = index;

  do {
    result = String.fromCharCode(65 + (remainder % 26)) + result;
    remainder = Math.floor(remainder / 26) - 1;
  } while (remainder >= 0);

  return result;
}
