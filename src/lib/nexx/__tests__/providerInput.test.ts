import { describe, expect, it } from 'vitest';
import {
  looksLikePastedLegalDocumentText,
  messageExplicitlyRequestsPastedDocumentText,
  prepareRecentMessagesForDocumentRecall,
  toProviderInputMessages,
} from '../providerInput';

const pastedOrderText = `
IN THE DISTRICT COURT
CAUSE NO. 12345

Petitioner: Jane Doe
Respondent: John Doe

TEMPORARY ORDERS

IT IS ORDERED that the parties shall exchange the child at the agreed location.
IT IS FURTHER ORDERED that Respondent shall pay support on the first day of each month.
Possession and access shall follow the attached schedule.
Signed on January 1, 2026.
Judge Example

${'Additional court order paragraph. '.repeat(90)}
`;

describe('looksLikePastedLegalDocumentText', () => {
  it('detects long pasted court order text', () => {
    expect(looksLikePastedLegalDocumentText(pastedOrderText)).toBe(true);
  });

  it('does not flag ordinary short chat messages', () => {
    expect(looksLikePastedLegalDocumentText('Can you re-analyze the order I uploaded?')).toBe(false);
  });
});

describe('messageExplicitlyRequestsPastedDocumentText', () => {
  it('detects explicit requests to use pasted text', () => {
    expect(messageExplicitlyRequestsPastedDocumentText('Please analyze the pasted order instead.')).toBe(true);
  });

  it('does not treat uploaded-document follow-ups as pasted-text requests', () => {
    expect(messageExplicitlyRequestsPastedDocumentText('Please re-analyze the uploaded order.')).toBe(false);
  });
});

describe('prepareRecentMessagesForDocumentRecall', () => {
  it('omits stale pasted order text when uploaded document memory is active', () => {
    const prepared = prepareRecentMessagesForDocumentRecall(
      [
        { turnId: 'old-turn', role: 'user', content: pastedOrderText },
        { turnId: 'current-turn', role: 'user', content: 'Please re-analyze the uploaded order.' },
      ],
      {
        documentContextActive: true,
        currentTurnId: 'current-turn',
      }
    );

    expect(prepared[0].content).toContain('Earlier pasted legal-document text omitted');
    expect(prepared[0].content).not.toContain('IT IS ORDERED');
    expect(prepared[1].content).toBe('Please re-analyze the uploaded order.');
  });

  it('keeps current-turn pasted text intact', () => {
    const prepared = prepareRecentMessagesForDocumentRecall(
      [{ turnId: 'current-turn', role: 'user', content: pastedOrderText }],
      {
        documentContextActive: true,
        currentTurnId: 'current-turn',
      }
    );

    expect(prepared[0].content).toBe(pastedOrderText);
  });

  it('keeps pasted history when the user explicitly asks for pasted text', () => {
    const prepared = prepareRecentMessagesForDocumentRecall(
      [{ turnId: 'old-turn', role: 'user', content: pastedOrderText }],
      {
        documentContextActive: true,
        currentTurnId: 'current-turn',
        preservePastedHistory: true,
      }
    );

    expect(prepared[0].content).toBe(pastedOrderText);
  });

  it('leaves pasted text untouched when uploaded document memory is not active', () => {
    const prepared = prepareRecentMessagesForDocumentRecall(
      [{ turnId: 'old-turn', role: 'user', content: pastedOrderText }],
      { documentContextActive: false, currentTurnId: 'current-turn' }
    );

    expect(prepared[0].content).toBe(pastedOrderText);
  });
});

describe('toProviderInputMessages', () => {
  it('strips internal turn metadata before provider calls', () => {
    expect(
      toProviderInputMessages([
        {
          turnId: 'turn-1',
          role: 'user',
          content: 'Analyze the uploaded order.',
          status: 'committed',
        },
        {
          turnId: 'turn-2',
          role: 'assistant',
          content: 'Prior answer.',
          status: 'degraded',
        },
      ])
    ).toEqual([
      { role: 'user', content: 'Analyze the uploaded order.' },
      { role: 'assistant', content: 'Prior answer.' },
    ]);
  });

  it('does not forward draft, failed, or deleted messages to the provider', () => {
    expect(
      toProviderInputMessages([
        {
          turnId: 'turn-1',
          role: 'user',
          content: 'Committed user message.',
          status: 'committed',
        },
        {
          turnId: 'turn-2',
          role: 'assistant',
          content: 'Draft assistant text.',
          status: 'draft',
        },
        {
          turnId: 'turn-3',
          role: 'assistant',
          content: 'Failed assistant text.',
          status: 'failed',
        },
        {
          turnId: 'turn-4',
          role: 'user',
          content: 'Deleted user text.',
          status: 'deleted',
        },
        {
          turnId: 'turn-5',
          role: 'assistant',
          content: 'Degraded but sendable answer.',
          status: 'degraded',
        },
      ])
    ).toEqual([
      { role: 'user', content: 'Committed user message.' },
      { role: 'assistant', content: 'Degraded but sendable answer.' },
    ]);
  });
});
