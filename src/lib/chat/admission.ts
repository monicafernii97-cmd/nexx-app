type AdmissionErrorBody = {
  error?: unknown;
};

/** Return a stable idempotency key that can be reused after an uncertain fetch failure. */
export function createChatRequestId(conversationId: string) {
  return `${conversationId}-${Date.now()}-${crypto.randomUUID()}`;
}

/** Extract the server's safe error message without exposing raw JSON in the UI. */
export async function readChatAdmissionError(response: Response) {
  const fallback = response.status === 429
    ? 'You have reached today\'s message limit.'
    : response.status >= 500
      ? 'NEXX could not start this response. Please try again.'
      : 'This message could not be sent.';

  try {
    const body = await response.json() as AdmissionErrorBody;
    return typeof body.error === 'string' && body.error.trim().length > 0
      ? body.error.trim()
      : fallback;
  } catch {
    return fallback;
  }
}
