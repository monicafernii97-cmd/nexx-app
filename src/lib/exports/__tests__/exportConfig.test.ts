/**
 * Export Config — Unit Tests
 *
 * Validates that centralized export configuration values are reasonable
 * and internally consistent.
 */

import { describe, it, expect } from 'vitest';
import {
    MAX_CONCURRENT_EXPORTS_PER_USER,
    JOB_TIMEOUT_MS,
    STALE_RUN_TTL_MS,
    COMPLETED_RUN_RETENTION_MS,
    MAX_TERMINAL_MUTATION_RETRIES,
    RETRY_BACKOFF_BASE_MS,
} from '../exportConfig';

describe('Export Config', () => {
    it('MAX_CONCURRENT_EXPORTS_PER_USER is 2', () => {
        expect(MAX_CONCURRENT_EXPORTS_PER_USER).toBe(2);
    });

    it('all config values are positive numbers', () => {
        expect(MAX_CONCURRENT_EXPORTS_PER_USER).toBeGreaterThan(0);
        expect(JOB_TIMEOUT_MS).toBeGreaterThan(0);
        expect(STALE_RUN_TTL_MS).toBeGreaterThan(0);
        expect(COMPLETED_RUN_RETENTION_MS).toBeGreaterThan(0);
        expect(MAX_TERMINAL_MUTATION_RETRIES).toBeGreaterThan(0);
        expect(RETRY_BACKOFF_BASE_MS).toBeGreaterThan(0);
    });

    it('JOB_TIMEOUT_MS exceeds Vercel maxDuration (120s)', () => {
        const VERCEL_MAX_DURATION_MS = 120 * 1000;
        expect(JOB_TIMEOUT_MS).toBeGreaterThan(VERCEL_MAX_DURATION_MS);
    });

    it('STALE_RUN_TTL_MS exceeds JOB_TIMEOUT_MS', () => {
        // Stale TTL should be larger than individual job timeout
        // to avoid reaping jobs that are still legitimately running
        expect(STALE_RUN_TTL_MS).toBeGreaterThan(JOB_TIMEOUT_MS);
    });

    it('COMPLETED_RUN_RETENTION_MS is at least 7 days', () => {
        const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
        expect(COMPLETED_RUN_RETENTION_MS).toBeGreaterThanOrEqual(SEVEN_DAYS_MS);
    });

    it('retention period greatly exceeds stale TTL', () => {
        // Retention must be much larger than stale TTL
        expect(COMPLETED_RUN_RETENTION_MS).toBeGreaterThan(STALE_RUN_TTL_MS * 100);
    });

    it('MAX_TERMINAL_MUTATION_RETRIES is between 1 and 10', () => {
        expect(MAX_TERMINAL_MUTATION_RETRIES).toBeGreaterThanOrEqual(1);
        expect(MAX_TERMINAL_MUTATION_RETRIES).toBeLessThanOrEqual(10);
    });

    it('RETRY_BACKOFF_BASE_MS provides reasonable backoff', () => {
        // Total max wait: base * (1 + 2 + ... + retries)
        const totalMaxMs = RETRY_BACKOFF_BASE_MS *
            (MAX_TERMINAL_MUTATION_RETRIES * (MAX_TERMINAL_MUTATION_RETRIES + 1)) / 2;
        // Should not exceed 5 seconds
        expect(totalMaxMs).toBeLessThanOrEqual(5000);
    });
});
