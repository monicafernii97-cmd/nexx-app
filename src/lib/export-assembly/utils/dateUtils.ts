/**
 * Date Utilities — Shared date parsing helpers for the export assembly engine.
 *
 * Centralizes date parsing logic to ensure consistent behavior across
 * all mappers and clusterers.
 */

/**
 * Parse a date string to epoch ms.
 *
 * Returns `Infinity` for missing or malformed dates so they consistently
 * sort to the end when used in comparisons.
 */
export function parseDateMs(dateStr: string | undefined): number {
    if (!dateStr) return Infinity;
    const ms = Date.parse(dateStr);
    return Number.isNaN(ms) ? Infinity : ms;
}
