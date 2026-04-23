/**
 * Export Pipeline Observability
 *
 * Structured logging for the Create Export pipeline.
 * Every generation attempt produces a machine-readable log payload.
 */

import type { ProfileResolutionSource } from '@/lib/jurisdiction/types';

/** Structured log payload for export PDF generation. */
export type ExportGenerationLog = {
  orchestrator: 'create_export';
  runId: string;
  exportPath: string;
  caseType?: string;
  profileKey: string;
  profileVersion?: string;
  profileSource: ProfileResolutionSource;
  htmlLength?: number;
  pdfByteLength?: number;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  stage?: string;
  /** Phase 5: Idempotency fingerprint for duplicate detection. */
  fingerprint?: string;
  /** Phase 5: Whether this run was new, reused, or blocked. */
  idempotencyStatus?: 'new' | 'reused' | 'blocked';
  /** Phase 5: Whether the uploaded artifact passed integrity verification. */
  artifactVerified?: boolean;
};

/** Emit a structured export generation log. */
export function logExportGeneration(payload: ExportGenerationLog): void {
  if (payload.success) {
    console.log(`[ExportPDF] ${JSON.stringify(payload)}`);
  } else {
    console.error(`[ExportPDF] ${JSON.stringify(payload)}`);
  }
}
