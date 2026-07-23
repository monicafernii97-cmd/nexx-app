import { describe, expect, it } from 'vitest';
import { createChatRequestId, readChatAdmissionError } from '../admission';

describe('chat admission helpers', () => {
  it('creates distinct request ids scoped to the conversation', () => {
    const first = createChatRequestId('conversation_1');
    const second = createChatRequestId('conversation_1');
    expect(first).toMatch(/^conversation_1-/);
    expect(second).not.toBe(first);
  });

  it('uses the server-safe error without exposing raw response text', async () => {
    const response = Response.json({ error: 'Daily message limit reached.' }, { status: 429 });
    await expect(readChatAdmissionError(response)).resolves.toBe('Daily message limit reached.');
  });

  it('falls back to a useful message for non-JSON server failures', async () => {
    const response = new Response('<html>gateway failed</html>', { status: 503 });
    await expect(readChatAdmissionError(response)).resolves.toBe(
      'NEXX could not start this response. Please try again.',
    );
  });
});
