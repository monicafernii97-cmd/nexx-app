/**
 * Escapes HTML special characters to prevent XSS in server-rendered HTML.
 * Used by PDF/export routes that construct HTML strings.
 */
export function escapeHtml(text: string): string {
    return (text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
