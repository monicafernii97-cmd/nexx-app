/**
 * Export Pipeline Configuration
 *
 * Re-exports shared constants from the single source of truth at
 * convex/lib/exportConfig.ts, plus route-specific retry config
 * that only src/ code uses.
 *
 * All export subsystems reference this module (or the shared module
 * directly for Convex server code) instead of using inline magic numbers.
 */

// ═══════════════════════════════════════════════════════════════
// Shared constants (single source of truth: convex/lib/exportConfig.ts)
// ═══════════════════════════════════════════════════════════════

export {
    MAX_CONCURRENT_EXPORTS_PER_USER,
    JOB_TIMEOUT_MS,
    STALE_RUN_TTL_MS,
    COMPLETED_RUN_RETENTION_MS,
} from '../../../convex/lib/exportConfig';

// ═══════════════════════════════════════════════════════════════
// Terminal Mutation Retry (route-only — not needed by Convex)
// ═══════════════════════════════════════════════════════════════

/** Max retry attempts for completeExportRun / failExportRun. */
export const MAX_TERMINAL_MUTATION_RETRIES = 3;

/** Retry backoff base in milliseconds (multiplied by attempt number). */
export const RETRY_BACKOFF_BASE_MS = 200;
