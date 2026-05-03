/**
 * Court Handoff — Temporary cross-page transport for NEXchat integration.
 *
 * SessionStorage is an intentional temporary transport mechanism.
 * No export correctness depends on handoff persistence — it is a
 * convenience path for the user to continue work in chat.
 *
 * Safeguards:
 * - consumeCourtHandoff() clears immediately after reading
 * - Payload expires after 10 minutes (HANDOFF_TTL_MS)
 * - Payload is schemaVersioned
 * - Payload size is capped at 8 KB
 * - If unavailable, chat shows graceful fallback
 *
 * @module courtHandoff
 */

import type { CourtDocumentIssueId } from './courtDocumentIssues';
import type { CourtIdentity } from './resolveCourtIdentity';

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const HANDOFF_KEY = 'nexx_court_handoff';
const HANDOFF_TTL_MS = 10 * 60 * 1000; // 10 minutes
const HANDOFF_MAX_BYTES = 8 * 1024; // 8 KB
const HANDOFF_SCHEMA_VERSION = 1;

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export type CourtHandoffPayload = {
  source: 'clarification_modal';
  intent: 'fix_court_issues';
  caseId?: string;
  exportPath: 'court_document';
  courtIdentity: Partial<CourtIdentity>;
  issues: { id: CourtDocumentIssueId; severity: string }[];
  draftText?: string;
  requestedOutcome: string;
  timestamp: number;
  schemaVersion: typeof HANDOFF_SCHEMA_VERSION;
};

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Store a court handoff payload in sessionStorage.
 *
 * Silently drops payloads exceeding the size cap and logs a warning.
 * Returns true if stored successfully, false otherwise.
 */
export function storeCourtHandoff(payload: CourtHandoffPayload): boolean {
  try {
    const json = JSON.stringify(payload);
    if (json.length > HANDOFF_MAX_BYTES) {
      console.warn(
        `[CourtHandoff] Payload exceeds ${HANDOFF_MAX_BYTES} byte cap (${json.length} bytes). Dropping.`,
      );
      return false;
    }
    sessionStorage.setItem(HANDOFF_KEY, json);
    return true;
  } catch (err) {
    console.warn('[CourtHandoff] Failed to store handoff:', err);
    return false;
  }
}

/**
 * Retrieve and immediately clear the court handoff.
 *
 * Returns null if:
 * - sessionStorage is unavailable
 * - No handoff exists
 * - Handoff is expired (> 10 minutes old)
 * - Schema version mismatch
 */
export function consumeCourtHandoff(): CourtHandoffPayload | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    // Always clear immediately after reading
    sessionStorage.removeItem(HANDOFF_KEY);

    if (!raw) return null;

    const payload: CourtHandoffPayload = JSON.parse(raw);

    // Schema version check
    if (payload.schemaVersion !== HANDOFF_SCHEMA_VERSION) {
      console.warn(
        `[CourtHandoff] Schema version mismatch: expected ${HANDOFF_SCHEMA_VERSION}, got ${payload.schemaVersion}. Discarding.`,
      );
      return null;
    }

    // TTL check
    const age = Date.now() - payload.timestamp;
    if (age > HANDOFF_TTL_MS) {
      console.warn(
        `[CourtHandoff] Handoff expired (${Math.round(age / 1000)}s old, TTL is ${HANDOFF_TTL_MS / 1000}s). Discarding.`,
      );
      return null;
    }

    return payload;
  } catch (err) {
    // Clear any corrupted data
    try {
      sessionStorage.removeItem(HANDOFF_KEY);
    } catch { /* ignore */ }
    console.warn('[CourtHandoff] Failed to consume handoff:', err);
    return null;
  }
}

/**
 * Build a structured chat prompt from a handoff payload.
 * Used by the chat page to pre-fill the composer.
 */
export function buildHandoffPrompt(payload: CourtHandoffPayload): string {
  const issueList = payload.issues
    .map(i => `- ${i.id} (${i.severity})`)
    .join('\n');

  const identity = payload.courtIdentity;
  const partyInfo = identity.filingPartyLegalName
    ? `Filing party: ${identity.filingPartyLegalName} (${identity.filingPartyRole ?? 'unknown role'})`
    : '';

  const lines = [
    'I need help resolving court document issues from my ReviewHub export.',
    '',
    partyInfo,
    identity.causeNumber ? `Cause number: ${identity.causeNumber}` : '',
    identity.state ? `Jurisdiction: ${identity.county ? `${identity.county}, ` : ''}${identity.state}` : '',
    '',
    'Issues to resolve:',
    issueList,
    '',
    `Requested outcome: ${payload.requestedOutcome}`,
  ].filter(Boolean);

  if (payload.draftText) {
    lines.push('', '--- Draft text ---', payload.draftText.slice(0, 2000));
    if (payload.draftText.length > 2000) {
      lines.push('(truncated)');
    }
  }

  return lines.join('\n');
}

/** Fallback message when no handoff is available. */
export const HANDOFF_FALLBACK_MESSAGE =
  "I couldn't retrieve the ReviewHub handoff. Please return to ReviewHub or paste the draft here.";
