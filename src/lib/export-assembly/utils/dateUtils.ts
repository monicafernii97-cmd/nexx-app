/**
 * Date Utilities — Shared date parsing helpers for the export assembly engine.
 *
 * Centralizes date parsing logic to ensure consistent behavior across
 * all mappers, clusterers, and narrative builders.
 */

/**
 * Normalize common US date formats and parse to epoch ms.
 *
 * Handles:
 * - MM/DD/YY  (2-digit year: <50 → 2000s, ≥50 → 1900s)
 * - MM/DD/YYYY
 * - ISO 8601 and natural language dates (via Date.parse fallback)
 *
 * Returns `NaN` for unparseable dates.
 */
export function normalizeDateMs(dateStr: string): number {
    // Try MM/DD/YY
    const usShort = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (usShort) {
        const year = parseInt(usShort[3], 10);
        const fullYear = year < 50 ? 2000 + year : 1900 + year;
        return new Date(fullYear, parseInt(usShort[1], 10) - 1, parseInt(usShort[2], 10)).getTime();
    }
    // Try MM/DD/YYYY
    const usFull = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (usFull) {
        return new Date(parseInt(usFull[3], 10), parseInt(usFull[1], 10) - 1, parseInt(usFull[2], 10)).getTime();
    }
    // Fallback to Date.parse for ISO and natural language dates
    const ms = Date.parse(dateStr);
    return Number.isNaN(ms) ? NaN : ms;
}

/**
 * Parse a date string to epoch ms for sorting purposes.
 *
 * Returns `Infinity` for missing or malformed dates so they consistently
 * sort to the end when used in comparisons. Uses `normalizeDateMs`
 * internally for robust US date format support.
 */
export function parseDateMs(dateStr: string | undefined): number {
    if (!dateStr) return Infinity;
    const ms = normalizeDateMs(dateStr);
    return Number.isNaN(ms) ? Infinity : ms;
}
