/**
 * Export Idempotency System
 *
 * Prevents duplicate document generation from double clicks, retries,
 * network replay, SSE reconnection, and concurrent requests.
 *
 * Two core functions:
 *   - hashPayload()            — SHA-256 of canonical input
 *   - generateRunFingerprint() — deterministic key combining identity + content
 *
 * The fingerprint is used to query the `exportRuns` Convex table
 * for claim-or-conflict logic before any heavy pipeline work begins.
 */

import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════
// Payload Hashing
// ═══════════════════════════════════════════════════════════════

/**
 * Compute a deterministic SHA-256 hash of any serializable payload.
 *
 * Input is JSON-serialized before hashing to ensure consistency.
 * The payload should already be **normalized** (post-adaptation)
 * so that equivalent inputs always produce the same hash.
 *
 * @param data - Any JSON-serializable value
 * @returns Hex-encoded SHA-256 hash
 */
export function hashPayload(data: unknown): string {
  const serialized = JSON.stringify(data);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

// ═══════════════════════════════════════════════════════════════
// Fingerprint Generation
// ═══════════════════════════════════════════════════════════════

/** Input for generating a run fingerprint. */
export type FingerprintInput = {
  /** Case ID (use 'anon' for unauthenticated/test scenarios). */
  caseId?: string;
  /** Export path (e.g. 'court_document', 'case_summary'). */
  exportPath: string;
  /** SHA-256 hash of the canonical payload. */
  payloadHash: string;
};

/**
 * Generate a deterministic fingerprint for an export run.
 *
 * Format: `{caseId}:{exportPath}:{payloadHash}`
 *
 * Two requests with the same fingerprint represent identical work
 * and should not both execute. The idempotency layer uses this
 * fingerprint to detect and prevent duplicates.
 *
 * @param input - Identity + content hash inputs
 * @returns Deterministic fingerprint string
 */
export function generateRunFingerprint(input: FingerprintInput): string {
  const caseId = input.caseId ?? 'anon';
  return `${caseId}:${input.exportPath}:${input.payloadHash}`;
}
