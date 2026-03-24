import { readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';

/**
 * Lazily reads and caches the legal document CSS stylesheet.
 * Tries multiple paths to work in both local dev and Vercel serverless.
 * Falls back to an empty string if the file cannot be read.
 */
let cachedCSS: string | null = null;
export function getLegalCSS(): string {
    if (cachedCSS === null) {
        const candidates = [
            // Standard local dev path
            join(process.cwd(), 'src/lib/legal/legalDocStyles.css'),
            // Vercel serverless: __dirname-relative
            resolve(dirname(__filename), 'legalDocStyles.css'),
            // Vercel .next/server path
            join(process.cwd(), '.next/server/src/lib/legal/legalDocStyles.css'),
        ];
        let loaded = false;
        for (const candidate of candidates) {
            try {
                if (existsSync(candidate)) {
                    cachedCSS = readFileSync(candidate, 'utf-8');
                    loaded = true;
                    break;
                }
            } catch {
                // Try next path
            }
        }
        if (!loaded) {
            console.warn('[getLegalCSS] Could not find legalDocStyles.css in any candidate path');
            cachedCSS = '';
        }
    }
    return cachedCSS!;
}
