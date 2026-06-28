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

async function renderMessage(metadata: unknown) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      <MessageBubble
        role="assistant"
        content="The order requires payment by Friday."
        metadata={metadata}
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

    expect(container.textContent).toContain('1 verified citation');
    expect(container.textContent).toContain('Final Order.pdf');
    expect(container.textContent).toContain('p. 4');
    expect(container.textContent).toContain('Verified');
    expect(container.textContent).not.toContain('Respondent shall pay by Friday.');

    const citationButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Final Order.pdf')
    );
    expect(citationButton?.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      citationButton?.click();
    });

    expect(citationButton?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Respondent shall pay by Friday.');
  });
});
