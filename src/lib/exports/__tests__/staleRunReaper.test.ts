/**
 * Stale Run Reaper — Configuration & Contract Tests
 *
 * Validates that the reaper's TTL and retention values are consistent
 * with the centralized export config, and that the error codes used
 * for reaped/timed-out runs are valid.
 */

import { describe, it, expect } from 'vitest';
import {
    STALE_RUN_TTL_MS,
    COMPLETED_RUN_RETENTION_MS,
    JOB_TIMEOUT_MS,
} from '../exportConfig';
import { ExportDocumentGenerationError } from '../errors';

describe('Stale Run Reaper — Configuration', () => {
    it('stale TTL is exactly 10 minutes', () => {
        expect(STALE_RUN_TTL_MS).toBe(10 * 60 * 1000);
    });

    it('completed retention is exactly 30 days', () => {
        expect(COMPLETED_RUN_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('JOB_TIMEOUT_MS is exactly 3 minutes', () => {
        expect(JOB_TIMEOUT_MS).toBe(3 * 60 * 1000);
    });

    it('stale TTL > job timeout (reaper waits longer than the job)', () => {
        expect(STALE_RUN_TTL_MS).toBeGreaterThan(JOB_TIMEOUT_MS);
    });

    it('retention >> stale TTL (retention is long-term, not short-term)', () => {
        expect(COMPLETED_RUN_RETENTION_MS / STALE_RUN_TTL_MS).toBeGreaterThan(100);
    });
});

describe('Stale Run Reaper — Error Code Contract', () => {
    it('EXPORT_JOB_TIMEOUT is a valid export error code', () => {
        const err = new ExportDocumentGenerationError({
            code: 'EXPORT_JOB_TIMEOUT',
            message: 'Export job exceeded 10-minute stale TTL',
        });
        expect(err.code).toBe('EXPORT_JOB_TIMEOUT');
        expect(err).toBeInstanceOf(ExportDocumentGenerationError);
    });

    it('EXPORT_JOB_TIMEOUT code is distinct from EXPORT_IDEMPOTENCY_CONFLICT', () => {
        // Verifies the timeout error code is not the same as the conflict code.
        // This distinction matters because failed runs (including timeouts) allow
        // re-claim on the same fingerprint, while conflict codes do not.
        const err = new ExportDocumentGenerationError({
            code: 'EXPORT_JOB_TIMEOUT',
            message: 'Reaped by maintenance cron',
        });
        expect(err.code).toBe('EXPORT_JOB_TIMEOUT');
        expect(err.code).not.toBe('EXPORT_IDEMPOTENCY_CONFLICT');
    });
});
