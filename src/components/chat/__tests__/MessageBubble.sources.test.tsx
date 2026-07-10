// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessageBubble from '../MessageBubble';

vi.mock('@/hooks/useTTSPlayer', () => ({
  useTTSPlayer: () => ({
    status: 'idle',
    error: null,
    play: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    stop: vi.fn(),
    isPlaying: false,
  }),
}));

async function renderMessage(
  metadata: unknown,
  artifactsJson?: string,
  content = 'The order requires payment by Friday.',
  props: Partial<React.ComponentProps<typeof MessageBubble>> = {}
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <MessageBubble
        role="assistant"
        content={content}
        metadata={metadata}
        artifactsJson={artifactsJson}
        {...props}
      />
    );
  });

  return { container, root };
}

describe('MessageBubble document evidence panel', () => {
  let roots: Root[] = [];

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    for (const root of roots) {
      act(() => root.unmount());
    }
    roots = [];
    document.body.innerHTML = '';
  });

  it('keeps source metadata hidden by default for ordinary assistant answers', async () => {
    const { container, root } = await renderMessage({
      sourceDisplayMode: 'collapsed',
      documentSources: [{
        uploadedFileId: 'file_123',
        filename: 'Final Order.pdf',
        source: 'case_memory',
        status: 'ready',
      }],
      documentCitations: [{
        chatAnswerSourceId: 'source_123',
        uploadedFileId: 'file_123',
        filename: 'Final Order.pdf',
        pageLabel: 'p. 4',
        quotedText: 'Respondent shall pay by Friday.',
        citationVerifierStatus: 'verified',
      }],
    });
    roots.push(root);

    expect(container.textContent).toContain('The order requires payment by Friday.');
    expect(container.textContent).not.toContain('Sources');
    expect(container.textContent).not.toContain('Final Order.pdf');
    expect(container.textContent).not.toContain('Show sources');
    expect(container.textContent).not.toContain('Respondent shall pay by Friday.');
  });

  it('renders verified citation quote and source metadata from message metadata', async () => {
    const { container, root } = await renderMessage({
      sourceDisplayMode: 'expanded',
      documentSources: [{
        uploadedFileId: 'file_123',
        filename: 'Final Order.pdf',
        source: 'case_memory',
        status: 'ready',
      }],
      documentCitations: [{
        chatAnswerSourceId: 'source_123',
        uploadedFileId: 'file_123',
        filename: 'Final Order.pdf',
        chunkId: 'chunk_123',
        pageStart: 4,
        pageEnd: 4,
        pageLabel: 'p. 4',
        quotedText: 'Respondent shall pay by Friday.',
        citationVerifierStatus: 'verified',
      }],
    });
    roots.push(root);

    expect(container.textContent).toContain('1 cited passage');
    expect(container.textContent).toContain('Final Order.pdf');
    expect(container.textContent).toContain('Show sources');
    expect(container.textContent).not.toContain('p. 4');
    expect(container.textContent).not.toContain('Case document');
    expect(container.textContent).not.toContain('Respondent shall pay by Friday.');
    expect(container.textContent).not.toContain('retrieved chunk');
    expect(container.textContent).not.toContain('Conversation memory');
    expect(container.textContent).not.toContain('Uploaded now');
    expect(container.textContent).not.toContain('Partial');

    const detailsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Show sources')
    );
    expect(detailsButton?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      detailsButton?.click();
    });

    expect(detailsButton?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('p. 4');
    expect(container.textContent).toContain('Source');
    expect(container.textContent).toContain('Case document');
    expect(container.textContent).not.toContain('Respondent shall pay by Friday.');

    const citationButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('p. 4')
    );
    expect(citationButton?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      citationButton?.click();
    });

    expect(citationButton?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Respondent shall pay by Friday.');
  });

  it('does not render legacy confidence artifacts to the user', async () => {
    const { container, root } = await renderMessage(
      {
        sourceDisplayMode: 'expanded',
        documentSources: [{
          uploadedFileId: 'file_123',
          filename: 'Final Order.pdf',
          source: 'conversation_memory',
          status: 'partial',
          contextTruncated: true,
        }],
        usedDocumentChunkIds: ['chunk_1', 'chunk_2', 'chunk_3'],
      },
      JSON.stringify({
        confidence: {
          confidence: 'high',
          basis: 'Internal source review',
          evidenceSufficiency: 'Enough support',
          missingSupport: [],
        },
      })
    );
    roots.push(root);

    expect(container.textContent).toContain('Final Order.pdf');
    expect(container.textContent).not.toContain('Saved in this chat');
    expect(container.textContent).not.toContain('Extracted text may be incomplete');
    expect(container.textContent).not.toMatch(/high confidence/i);
    expect(container.textContent).not.toContain('Internal source review');
    expect(container.textContent).not.toContain('Enough support');
    expect(container.textContent).not.toContain('retrieved chunk');
    expect(container.textContent).not.toContain('Conversation memory');
    expect(container.textContent).not.toContain('Partial');

    const detailsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Show sources')
    );

    await act(async () => {
      detailsButton?.click();
    });

    expect(container.textContent).toContain('Saved in this chat');
  });

  it('distinguishes focused passages from incomplete extraction', async () => {
    const { container, root } = await renderMessage({
      sourceDisplayMode: 'expanded',
      documentSources: [{
        uploadedFileId: 'file_123',
        filename: 'Long Final Order.pdf',
        source: 'current_turn',
        status: 'ready',
        contextTruncated: true,
      }],
    });
    roots.push(root);

    expect(container.textContent).not.toContain('Showing selected passages');
    expect(container.textContent).not.toContain('Extracted text may be incomplete');
  });

  it('suppresses focused-passages notice when extraction is partial', async () => {
    const { container, root } = await renderMessage({
      sourceDisplayMode: 'expanded',
      documentSources: [{
        uploadedFileId: 'file_456',
        filename: 'Partial Order.pdf',
        source: 'current_turn',
        status: 'partial',
        contextTruncated: true,
      }],
    });
    roots.push(root);

    expect(container.textContent).not.toContain('Extracted text may be incomplete');
    expect(container.textContent).not.toContain('Showing selected passages');
  });

  it('renders a safe status card instead of raw structured source JSON', async () => {
    const onRetry = vi.fn();
    const rawPayload = '{"documentAnswer":{"citations":[{"sourceId":"src_005","chunkId":"abc","quotedText":"secret"}]}}';
    const { container, root } = await renderMessage({}, undefined, rawPayload, { onRetry });
    roots.push(root);

    expect(container.textContent).toContain('Preparing the answer');
    expect(container.querySelector('button[aria-label="Retry response"]')).toBeTruthy();
    expect(container.querySelector('button[aria-label="Copy recovery notice"]')).toBeTruthy();
    expect(container.textContent).not.toContain('sourceId');
    expect(container.textContent).not.toContain('chunkId');
    expect(container.textContent).not.toContain('quotedText');
    expect(container.textContent).not.toContain('secret');
  });

  it('keeps ordinary streaming assistant text visible while guarding unsafe payloads', async () => {
    const { container, root } = await renderMessage(
      {},
      undefined,
      'Court Order Analysis\n\nExecutive Summary\nThe order says possession begins Friday.',
      { isStreaming: true }
    );
    roots.push(root);

    expect(container.textContent).toContain('Court Order Analysis');
    expect(container.textContent).toContain('possession begins Friday');
    expect(container.textContent).not.toContain('Preparing the answer');
  });

  it('withholds unsafe structured payloads even while streaming', async () => {
    const rawPayload = '{"documentAnswer":{"citations":[{"sourceId":"src_005","quotedText":"secret"}]}}';
    const { container, root } = await renderMessage({}, undefined, rawPayload, { isStreaming: true });
    roots.push(root);

    expect(container.textContent).toContain('Preparing the answer');
    expect(container.textContent).not.toContain('sourceId');
    expect(container.textContent).not.toContain('quotedText');
    expect(container.textContent).not.toContain('secret');
  });

  it('strips legacy markdown source bullets from visible assistant content', async () => {
    const legacyContent = [
      'The verified order text supports Friday possession for Father\'s Day weekend. [p. 5]',
      '',
      'Sources',
      '',
      'Signed Final Order.pdf, p. 5 (src_009): "Father\'s Day begins Friday."',
      '',
      'Warnings',
      'src_009: PAGE_BOUNDARIES_UNAVAILABLE',
    ].join('\n');

    const { container, root } = await renderMessage({}, undefined, legacyContent);
    roots.push(root);

    expect(container.textContent).toContain('The verified order text supports Friday possession');
    expect(container.textContent).not.toContain('src_009');
    expect(container.textContent).not.toContain('PAGE_BOUNDARIES_UNAVAILABLE');
    expect(container.textContent).not.toContain('Signed Final Order.pdf, p. 5');
  });

  it('summarizes cited documents instead of unrelated source metadata', async () => {
    const { container, root } = await renderMessage({
      sourceDisplayMode: 'expanded',
      documentSources: [
        {
          uploadedFileId: 'file_current',
          filename: 'Uploaded Order.pdf',
          source: 'current_turn',
          status: 'ready',
        },
        {
          uploadedFileId: 'file_case',
          filename: 'Older Case Order.pdf',
          source: 'case_memory',
          status: 'ready',
        },
      ],
      documentCitations: [{
        chatAnswerSourceId: 'source_current',
        uploadedFileId: 'file_current',
        filename: 'Uploaded Order.pdf',
        pageStart: 2,
        pageEnd: 2,
        pageLabel: 'p. 2',
        quotedText: 'Parent A has exclusive education authority.',
        citationVerifierStatus: 'verified',
      }],
    });
    roots.push(root);

    expect(container.textContent).toContain('Uploaded Order.pdf · 1 citation');
    expect(container.textContent).not.toContain('2 sources');
    expect(container.textContent).not.toContain('Older Case Order.pdf');

    const detailsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Show sources')
    );

    await act(async () => {
      detailsButton?.click();
    });

    expect(container.textContent).toContain('Uploaded Order.pdf');
    expect(container.textContent).not.toContain('Older Case Order.pdf');
  });

  it('renders follow-up chips that dispatch prompt text for court-order answers', async () => {
    const onSuggestedPrompt = vi.fn();
    const { container, root } = await renderMessage(
      {
        documentSources: [{
          uploadedFileId: 'file_123',
          filename: 'Final Order.pdf',
          source: 'current_turn',
          status: 'ready',
        }],
      },
      undefined,
      '# Court Order Analysis\n\n## Executive Summary\nThe order requires payment. [p. 4]',
      { onSuggestedPrompt }
    );
    roots.push(root);

    const deadlineButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Create deadline checklist')
    );
    expect(deadlineButton).toBeTruthy();

    await act(async () => {
      deadlineButton?.click();
    });

    expect(onSuggestedPrompt).toHaveBeenCalledWith('Create a deadline checklist from this court-order analysis.');
  });

  it('renders draft-ready artifacts as polished draft text and filing notes instead of raw JSON', async () => {
    const { container, root } = await renderMessage(
      {},
      JSON.stringify({
        draftReady: {
          title: 'Motion to Enforce Parenting-Time Provisions',
          body: [
            'CAUSE NO. [NEEDED: cause number]',
            '',
            'Movant asks the Court to enforce the parenting-time provisions cited in the order.',
          ].join('\n'),
          filingNotes: 'Confirm county standing-order requirements before filing.',
        },
      }),
      'I drafted a court-facing motion using the facts available so far.'
    );
    roots.push(root);

    expect(container.textContent).toContain('Draft for Review');

    const draftButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Draft for Review')
    );
    expect(draftButton?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      draftButton?.click();
    });

    expect(draftButton?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Motion to Enforce Parenting-Time Provisions');
    expect(container.textContent).toContain('CAUSE NO. [NEEDED: cause number]');
    expect(container.textContent).toContain('Filing Notes');
    expect(container.textContent).toContain('Confirm county standing-order requirements before filing.');
    expect(container.textContent).not.toContain('"draftReady"');
    expect(container.textContent).not.toContain('"filingNotes"');
    expect(container.textContent).not.toContain('{"');
  });
});
