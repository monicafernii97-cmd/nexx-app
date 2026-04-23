/**
 * Export Pipeline Configuration
 *
 * Centralized configuration for queue admission, concurrency control,
 * retention policies, and retry behavior. All export subsystems
 * reference this module instead of using inline magic numbers.
 */

// ═══════════════════════════════════════════════════════════════
// Queue & Concurrency
// ═══════════════════════════════════════════════════════════════

/** Max concurrent exports (queued + running) per user. */
export const MAX_CONCURRENT_EXPORTS_PER_USER = 2;

/**
 * Job timeout in milliseconds.
 * Must exceed Vercel's maxDuration (120s) to avoid racing the
 * platform timeout, but short enough to catch genuinely stuck jobs.
 */
export const JOB_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

// ═══════════════════════════════════════════════════════════════
// Stale Run Reaper
// ═══════════════════════════════════════════════════════════════

/**
 * Stale run TTL in milliseconds.
 * Any exportRun still `in_progress` after this duration is
 * considered stuck and will be reaped by the maintenance cron.
 */
export const STALE_RUN_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ═══════════════════════════════════════════════════════════════
// Retention
// ═══════════════════════════════════════════════════════════════

/**
 * Completed/failed run retention in milliseconds.
 * Records older than this are purged by the daily maintenance cron.
 * Matches the existing toolRuns 30-day retention policy.
 */
export const COMPLETED_RUN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ═══════════════════════════════════════════════════════════════
// Terminal Mutation Retry
// ═══════════════════════════════════════════════════════════════

/** Max retry attempts for completeExportRun / failExportRun. */
export const MAX_TERMINAL_MUTATION_RETRIES = 3;

/** Retry backoff base in milliseconds (multiplied by attempt number). */
export const RETRY_BACKOFF_BASE_MS = 200;
