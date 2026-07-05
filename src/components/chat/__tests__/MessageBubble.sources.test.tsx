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

  it('renders verified citation quote and source metadata from message metadata', async () => {
    const { container, root } = await renderMessage({
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
    expect(container.textContent).toContain('View source details');
    expect(container.textContent).not.toContain('p. 4');
    expect(container.textContent).not.toContain('Case document');
    expect(container.textContent).not.toContain('Respondent shall pay by Friday.');
    expect(container.textContent).not.toContain('retrieved chunk');
    expect(container.textContent).not.toContain('Conversation memory');
    expect(container.textContent).not.toContain('Uploaded now');
    expect(container.textContent).not.toContain('Partial');

    const detailsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('View source details')
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
    expect(container.textContent).toContain('Extracted text may be incomplete');
    expect(container.textContent).not.toMatch(/high confidence/i);
    expect(container.textContent).not.toContain('Internal source review');
    expect(container.textContent).not.toContain('Enough support');
    expect(container.textContent).not.toContain('retrieved chunk');
    expect(container.textContent).not.toContain('Conversation memory');
    expect(container.textContent).not.toContain('Partial');

    const detailsButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('View source details')
    );

    await act(async () => {
      detailsButton?.click();
    });

    expect(container.textContent).toContain('Saved in this chat');
  });

  it('renders a safe status card instead of raw structured source JSON', async () => {
    const onRetry = vi.fn();
    const rawPayload = '{"documentAnswer":{"citations":[{"sourceId":"src_005","chunkId":"abc","quotedText":"secret"}]}}';
    const { container, root } = await renderMessage({}, undefined, rawPayload, { onRetry });
    roots.push(root);

    expect(container.textContent).toContain('Analyzing court order');
    expect(container.querySelector('button[aria-label="Retry response"]')).toBeTruthy();
    expect(container.querySelector('button[aria-label="Copy recovery notice"]')).toBeTruthy();
    expect(container.textContent).not.toContain('sourceId');
    expect(container.textContent).not.toContain('chunkId');
    expect(container.textContent).not.toContain('quotedText');
    expect(container.textContent).not.toContain('secret');
  });

  it('summarizes cited documents instead of unrelated source metadata', async () => {
    const { container, root } = await renderMessage({
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
      button.textContent?.includes('View source details')
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
});
