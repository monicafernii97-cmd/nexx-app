/** Format saved export filenames into formal display titles without changing downloads. */
export function formatDocumentDisplayTitle(
    value: string | null | undefined,
    fallback = 'Untitled Document',
): string {
    if (!value) return fallback;
    const title = value
        .replace(/\.pdf$/i, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!title) return fallback;
    return title
        .toLowerCase()
        .split(' ')
        .map(word => word.replace(/^[a-z0-9]/, char => char.toUpperCase()))
        .join(' ');
}
