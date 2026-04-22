/**
 * Bates Numbering
 *
 * Formats Bates numbers for exhibit packet pages.
 * Zero-padded 5-digit numbers with optional prefix.
 */

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Configuration for Bates numbering. */
export type BatesConfig = {
  enabled: boolean;
  prefix?: string;
  startNumber?: number;
};

// ═══════════════════════════════════════════════════════════════
// Formatter
// ═══════════════════════════════════════════════════════════════

/**
 * Format a Bates number for a given section index.
 *
 * @param sectionIndex - 0-based index of the page/section
 * @param config - Bates numbering configuration
 * @returns Formatted Bates string, e.g. "PET00001"
 */
export function formatBatesNumber(
  sectionIndex: number,
  config: BatesConfig,
): string {
  const start = config.startNumber ?? 1;
  const number = start + sectionIndex;
  const padded = String(number).padStart(5, '0');
  return `${config.prefix || ''}${padded}`;
}
