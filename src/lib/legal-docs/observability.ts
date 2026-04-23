/**
 * Quick Generate Pipeline Observability
 *
 * Structured logging for the Quick Generate pipeline.
 * Every generation attempt produces a machine-readable log payload.
 */

import type { ProfileResolutionSource } from '@/lib/jurisdiction/types';

/** Structured log payload for QG PDF generation. */
export type LegalGenerationLog = {
  orchestrator: 'quick_generate';
  documentType: string;
  profileKey: string;
  profileSource: ProfileResolutionSource;
  sectionCount?: number;
  htmlLength?: number;
  pdfByteLength?: number;
  durationMs: number;
  success: boolean;
  errorCode?: string;
  stage?: string;
};

/** Emit a structured legal generation log. */
export function logLegalGeneration(payload: LegalGenerationLog): void {
  if (payload.success) {
    console.log(`[LegalPDF] ${JSON.stringify(payload)}`);
  } else {
    console.error(`[LegalPDF] ${JSON.stringify(payload)}`);
  }
}
