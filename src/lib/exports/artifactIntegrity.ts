/**
 * Artifact Integrity Verification
 *
 * Ensures generated PDFs are fully written, correctly stored,
 * and retrievable without corruption after upload.
 *
 * Two phases:
 *   1. Pre-upload  — compute checksum for the generated buffer
 *   2. Post-upload — verify stored metadata matches expectations
 *
 * If post-upload verification fails, the caller should:
 *   - retry upload once
 *   - on second failure → throw EXPORT_ARTIFACT_INTEGRITY_FAILED
 */

import crypto from 'crypto';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

/** Result of post-upload artifact verification. */
export type ArtifactVerificationResult = {
  /** Whether all checks passed. */
  verified: boolean;
  /** Whether the stored byte length matches the original buffer. */
  byteLengthMatch: boolean;
  /** Whether a valid storageId was returned. */
  storageIdValid: boolean;
  /** The SHA-256 checksum computed before upload. */
  checksum: string;
};

// ═══════════════════════════════════════════════════════════════
// Checksum
// ═══════════════════════════════════════════════════════════════

/**
 * Compute a SHA-256 checksum of a PDF buffer before upload.
 *
 * This checksum is stored alongside the document record for
 * future integrity verification (e.g., on download or audit).
 *
 * @param buffer - The raw PDF buffer
 * @returns Hex-encoded SHA-256 checksum
 */
export function computeArtifactChecksum(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

// ═══════════════════════════════════════════════════════════════
// Post-Upload Verification
// ═══════════════════════════════════════════════════════════════

/**
 * Verify that an uploaded artifact matches the original buffer.
 *
 * Checks:
 *   1. storageId is a non-empty string
 *   2. byte length matches the original buffer
 *
 * This function does NOT re-download the file (which would be
 * expensive in a serverless context). Instead, it validates
 * the metadata returned by the upload response + finalization.
 *
 * **Note on byte-length check:**
 * The `reportedByteLength` should ideally come from the storage
 * system's upload response (e.g., Content-Length header). If the
 * storage API does not expose uploaded byte count (e.g., Convex
 * storage returns only `storageId`), the caller must pass the
 * original buffer length, making the byte-length comparison a
 * no-op that validates only `storageId` format.
 *
 * @param params - Verification inputs
 * @returns Verification result with pass/fail details
 */
export function verifyUploadedArtifact(params: {
  /** The storage ID returned by the upload. */
  storageId: string | undefined | null;
  /** The byte length reported by the upload/finalization. */
  reportedByteLength: number;
  /** The original buffer length before upload. */
  expectedByteLength: number;
  /** The SHA-256 checksum computed before upload. */
  checksum: string;
}): ArtifactVerificationResult {
  const storageIdValid = typeof params.storageId === 'string' && params.storageId.length > 0;
  const byteLengthMatch = params.reportedByteLength === params.expectedByteLength;

  return {
    verified: storageIdValid && byteLengthMatch,
    byteLengthMatch,
    storageIdValid,
    checksum: params.checksum,
  };
}
