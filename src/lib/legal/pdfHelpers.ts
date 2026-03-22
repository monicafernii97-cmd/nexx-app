import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Lazily reads and caches the legal document CSS stylesheet.
 * Falls back to an empty string if the file cannot be read.
 */
let cachedCSS: string | null = null;
export function getLegalCSS(): string {
    if (!cachedCSS) {
        try {
            cachedCSS = readFileSync(
                join(process.cwd(), 'src/lib/legal/legalDocStyles.css'),
                'utf-8'
            );
        } catch (err) {
            console.error('[getLegalCSS] Failed to load legalDocStyles.css:', err);
            cachedCSS = ''; // Fallback to empty styles
        }
    }
    return cachedCSS;
}
