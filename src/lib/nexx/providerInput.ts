export type InternalRecentMessage = {
  turnId?: unknown;
  role: 'user' | 'assistant';
  content: string;
  status?: 'draft' | 'committed' | 'degraded' | 'failed' | 'deleted';
};

export type ProviderInputMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const PASTED_DOCUMENT_TEXT_MIN_CHARS = 1500;
const PASTED_DOCUMENT_LINE_MIN = 12;
const PASTED_DOCUMENT_MARKERS = [
  /\bit\s+is\s+(?:ordered|therefore\s+ordered)\b/i,
  /\btemporary\s+orders?\b/i,
  /\bfinal\s+order\b/i,
  /\bcourt\s+order\b/i,
  /\bcause\s+(?:no\.?|number)\b/i,
  /\bpetitioner\b/i,
  /\brespondent\b/i,
  /\bjudge\b/i,
  /\bsigned\s+on\b/i,
  /\bpossession\s+and\s+access\b/i,
];

const EXPLICIT_PASTED_TEXT_REFERENCE_PATTERNS = [
  /\bpasted\s+(?:text|order|document|content)\b/i,
  /\b(?:text|order|document|content)\s+(?:i|we)\s+pasted\b/i,
  /\bcop(?:y|ied)\s+and\s+past(?:e|ed)\b/i,
  /\btext\s+(?:i|we)\s+(?:copied|provided|pasted)\b/i,
  /\bthe\s+pasted\s+(?:text|order|document|content)\b/i,
];

const OMITTED_PASTED_DOCUMENT_TEXT_NOTICE =
  '[Earlier pasted legal-document text omitted from model history. Stored uploaded document memory is available for this turn, so use the current <DOCUMENT_CONTEXT> / <RETRIEVED_CHUNKS> as the source of truth instead of this older pasted text.]';

/** Return true when a prior user message looks like a long pasted court document. */
export function looksLikePastedLegalDocumentText(content: string) {
  if (content.length < PASTED_DOCUMENT_TEXT_MIN_CHARS) return false;

  const lineCount = content.split(/\r?\n/).filter((line) => line.trim()).length;
  const markerHits = PASTED_DOCUMENT_MARKERS.filter((pattern) => pattern.test(content)).length;

  return markerHits >= 2 || (markerHits >= 1 && lineCount >= PASTED_DOCUMENT_LINE_MIN);
}

/** Return true when the user explicitly asks to use previously pasted text. */
export function messageExplicitlyRequestsPastedDocumentText(content: string) {
  return EXPLICIT_PASTED_TEXT_REFERENCE_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Remove stale pasted document bodies from chat history when stored upload memory
 * is already loaded for the current turn.
 */
export function prepareRecentMessagesForDocumentRecall(
  messages: InternalRecentMessage[],
  options: {
    documentContextActive: boolean;
    currentTurnId?: unknown;
    preservePastedHistory?: boolean;
  }
): InternalRecentMessage[] {
  if (!options.documentContextActive || options.preservePastedHistory) return messages;

  return messages.map((message) => {
    const isCurrentTurn = options.currentTurnId !== undefined && message.turnId === options.currentTurnId;
    if (isCurrentTurn || message.role !== 'user' || !looksLikePastedLegalDocumentText(message.content)) {
      return message;
    }

    return {
      ...message,
      content: OMITTED_PASTED_DOCUMENT_TEXT_NOTICE,
    };
  });
}

/** Strip internal metadata before sending messages to the model provider. */
export function toProviderInputMessages(messages: InternalRecentMessage[]): ProviderInputMessage[] {
  return messages
    .filter((message) => (
      message.status === undefined ||
      message.status === 'committed' ||
      message.status === 'degraded'
    ))
    .map(({ role, content }) => ({ role, content }));
}
