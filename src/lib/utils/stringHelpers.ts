/**
 * Shared string helper utilities.
 */

/**
 * Title-case a string: first letter uppercase, rest lowercase.
 * Used to normalize state/county to match canonical casing.
 */
export function titleCase(s: string): string {
    return s
        .trim()
        .split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}
