/**
 * Parses a YYYY-MM-DD date string as a **local** calendar date.
 *
 * `new Date('2025-03-15')` is interpreted as **UTC midnight**, which in US
 * timezones renders the previous day. This helper splits the string and
 * constructs a `Date` with local semantics instead.
 *
 * Falls back to a plain `new Date(dateStr)` if the format is unexpected.
 */
export function parseLocalDate(dateStr: string): Date {
    if (!dateStr) {
        throw new Error('parseLocalDate requires a non-empty date string');
    }
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    // Fallback for non-standard formats
    const result = new Date(dateStr);
    if (isNaN(result.getTime())) {
        throw new Error(`Invalid date string: ${dateStr}`);
    }
    return result;
}
