/**
 * Export Jobs — Queue Admission Tests
 *
 * Tests the error codes and error class behavior for queue-related failures.
 * The actual Convex mutations are tested via integration when deployed.
 * These tests validate the client-side error handling contract.
 */

import { describe, it, expect } from 'vitest';
import {
    ExportDocumentGenerationError,
    mapToExportGenerationError,
} from '../errors';

describe('Export Queue Error Handling', () => {
    it('can construct EXPORT_QUEUE_OVERLOADED error', () => {
        const err = new ExportDocumentGenerationError({
            code: 'EXPORT_QUEUE_OVERLOADED',
            message: 'Export queue full — 2/2 active exports.',
        });
        expect(err).toBeInstanceOf(ExportDocumentGenerationError);
        expect(err.code).toBe('EXPORT_QUEUE_OVERLOADED');
        expect(err.message).toContain('queue full');
    });

    it('can construct EXPORT_JOB_TIMEOUT error', () => {
        const err = new ExportDocumentGenerationError({
            code: 'EXPORT_JOB_TIMEOUT',
            message: 'Export job timed out after 3 minutes',
        });
        expect(err).toBeInstanceOf(ExportDocumentGenerationError);
        expect(err.code).toBe('EXPORT_JOB_TIMEOUT');
    });

    it('mapToExportGenerationError preserves EXPORT_QUEUE_OVERLOADED from plain Error', () => {
        const plainError = Object.assign(new Error('queue full'), {
            code: 'EXPORT_QUEUE_OVERLOADED',
        });
        const mapped = mapToExportGenerationError(plainError);
        expect(mapped.code).toBe('EXPORT_QUEUE_OVERLOADED');
    });

    it('mapToExportGenerationError preserves EXPORT_JOB_TIMEOUT from plain Error', () => {
        const plainError = Object.assign(new Error('timed out'), {
            code: 'EXPORT_JOB_TIMEOUT',
        });
        const mapped = mapToExportGenerationError(plainError);
        expect(mapped.code).toBe('EXPORT_JOB_TIMEOUT');
    });

    it('EXPORT_QUEUE_OVERLOADED includes activeCount in message', () => {
        const activeCount = 2;
        const limit = 2;
        const err = new ExportDocumentGenerationError({
            code: 'EXPORT_QUEUE_OVERLOADED',
            message: `Export queue full — ${activeCount}/${limit} active exports. Please wait and try again.`,
        });
        expect(err.message).toContain('2/2');
        expect(err.message).toContain('Please wait');
    });

    it('queue errors are distinguishable from pipeline errors', () => {
        const queueErr = new ExportDocumentGenerationError({
            code: 'EXPORT_QUEUE_OVERLOADED',
            message: 'queue full',
        });
        const pipelineErr = new ExportDocumentGenerationError({
            code: 'EXPORT_PDF_RENDER_FAILED',
            message: 'render failed',
        });
        expect(queueErr.code).not.toBe(pipelineErr.code);
        expect(queueErr).toBeInstanceOf(ExportDocumentGenerationError);
        expect(pipelineErr).toBeInstanceOf(ExportDocumentGenerationError);
    });
});
