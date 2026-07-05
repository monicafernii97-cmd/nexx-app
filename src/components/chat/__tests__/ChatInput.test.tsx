// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatInput, { buildFileFallbackMessage } from '../ChatInput';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeFile(name = 'order.pdf', type = 'application/pdf') {
  return new File(['court order text'], name, { type });
}

function input(container: HTMLElement) {
  return container.querySelector('textarea') as HTMLTextAreaElement;
}

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

function sendButton(container: HTMLElement) {
  return container.querySelector('button[aria-label="Send message"]') as HTMLButtonElement;
}

function buttonWithText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find((button) =>
    button.textContent?.includes(text)
  ) as HTMLButtonElement | undefined;
}

function setTextareaValue(target: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
  descriptor?.set?.call(target, value);
  target.dispatchEvent(new Event('input', { bubbles: true }));
}

function setFiles(target: HTMLInputElement, files: File[]) {
  Object.defineProperty(target, 'files', {
    configurable: true,
    value: files,
  });
}

async function renderChatInput(onSend = vi.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<ChatInput onSend={onSend} />);
  });

  return { container, root, onSend };
}

describe('ChatInput file send flow', () => {
  let roots: Root[] = [];

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.restoreAllMocks();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    for (const root of roots) {
      act(() => root.unmount());
    }
    roots = [];
    document.body.innerHTML = '';
  });

  it('builds intent-specific fallback prompts for file-only sends', () => {
    expect(buildFileFallbackMessage('attachment', 'order.pdf')).toBe('Analyze this file: order.pdf');
    expect(buildFileFallbackMessage('court_order', 'order.pdf')).toBe(
      'Analyze this court order and extract the key obligations, deadlines, risks, and recommended next steps.',
    );
    expect(buildFileFallbackMessage('thread', 'thread.txt')).toBe('Analyze this uploaded thread: thread.txt');
  });

  it('shows a valid selected file and focuses the textarea after picker close', async () => {
    const { container, root } = await renderChatInput();
    roots.push(root);
    const file = makeFile();

    await act(async () => {
      setFiles(fileInput(container), [file]);
      fileInput(container).dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('order.pdf');
    expect(document.activeElement).toBe(input(container));
  });

  it('pressing Enter after file selection sends the selected file and clears on success', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container, root } = await renderChatInput(onSend);
    roots.push(root);
    const file = makeFile();

    await act(async () => {
      setFiles(fileInput(container), [file]);
      fileInput(container).dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      input(container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(
      'Analyze this file: order.pdf',
      expect.objectContaining({
        file,
        intent: 'attachment',
        status: 'selected',
        clientUploadKey: expect.any(String),
        clientTurnId: expect.any(String),
        retryable: true,
      }),
      undefined,
      expect.objectContaining({
        onProgress: expect.any(Function),
        onStatus: expect.any(Function),
        onComplete: expect.any(Function),
      }),
    );
    expect(container.textContent).not.toContain('order.pdf');
  });

  it('shows a chip-level Send file action for idle attached files', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    const { container, root } = await renderChatInput(onSend);
    roots.push(root);
    const file = makeFile();

    await act(async () => {
      setFiles(fileInput(container), [file]);
      fileInput(container).dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('Selected');
    const chipSend = buttonWithText(container, 'Send file');
    expect(chipSend).toBeTruthy();

    await act(async () => {
      chipSend?.click();
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith(
      'Analyze this file: order.pdf',
      expect.objectContaining({ file, status: 'selected' }),
      undefined,
      expect.any(Object),
    );
  });

  it('leaves the idle attached state when upload callbacks report processing', async () => {
    const pending = deferred();
    const onSend = vi.fn((_message, _fileState, _mode, callbacks) => {
      callbacks?.onStatus('processing');
      return pending.promise;
    });
    const { container, root } = await renderChatInput(onSend);
    roots.push(root);
    const file = makeFile();

    await act(async () => {
      setFiles(fileInput(container), [file]);
      fileInput(container).dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      buttonWithText(container, 'Send file')?.click();
    });

    expect(container.textContent).toContain('Reading document');
    expect(container.textContent).not.toContain('Selected');
    expect(sendButton(container).disabled).toBe(true);

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
  });

  it('leaves the idle attached state immediately after Send file is clicked', async () => {
    const pending = deferred();
    const onSend = vi.fn(() => pending.promise);
    const { container, root } = await renderChatInput(onSend);
    roots.push(root);
    const file = makeFile();

    await act(async () => {
      setFiles(fileInput(container), [file]);
      fileInput(container).dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('Selected');

    await act(async () => {
      buttonWithText(container, 'Send file')?.click();
      await Promise.resolve();
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('Selected');
    expect(sendButton(container).disabled).toBe(true);

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
  });

  it('Shift+Enter does not send', async () => {
    const onSend = vi.fn();
    const { container, root } = await renderChatInput(onSend);
    roots.push(root);

    await act(async () => {
      setTextareaValue(input(container), 'line one');
      input(container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true }));
    });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('preserves typed text and selected file when send fails', async () => {
    const onSend = vi.fn().mockRejectedValue(new Error('Upload failed'));
    const { container, root } = await renderChatInput(onSend);
    roots.push(root);
    const file = makeFile();

    await act(async () => {
      setTextareaValue(input(container), 'Please analyze');
      setFiles(fileInput(container), [file]);
      fileInput(container).dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      sendButton(container).click();
    });

    expect(container.textContent).toContain('order.pdf');
    expect(input(container).value).toBe('Please analyze');
    expect(container.textContent).toContain('Upload failed');
    expect(document.activeElement).toBe(input(container));
  });

  it('allows Enter retry after a retryable file send failure', async () => {
    const onSend = vi.fn()
      .mockRejectedValueOnce(new Error('Temporary upload failure'))
      .mockResolvedValueOnce(undefined);
    const { container, root } = await renderChatInput(onSend);
    roots.push(root);
    const file = makeFile();

    await act(async () => {
      setFiles(fileInput(container), [file]);
      fileInput(container).dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      sendButton(container).click();
    });
    expect(container.textContent).toContain('Retry');

    await act(async () => {
      input(container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onSend).toHaveBeenCalledTimes(2);
    expect(container.textContent).not.toContain('order.pdf');
  });

  it('blocks non-readable file failures and asks the user to replace the file', async () => {
    const onSend = vi.fn(async (_message, _fileState, _mode, callbacks) => {
      callbacks?.onStatus('failed_empty_extraction');
      const error = new Error('NEXX could not read any text from this file.') as Error & {
        uploadStatus: string;
        retryable: boolean;
      };
      error.uploadStatus = 'failed_empty_extraction';
      error.retryable = false;
      throw error;
    });
    const { container, root } = await renderChatInput(onSend);
    roots.push(root);
    const file = makeFile();

    await act(async () => {
      setFiles(fileInput(container), [file]);
      fileInput(container).dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      sendButton(container).click();
    });

    expect(container.textContent).toContain('Replace file');
    expect(sendButton(container).disabled).toBe(true);

    await act(async () => {
      input(container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('blocks duplicate sends while the first send is in flight', async () => {
    const pending = deferred();
    const onSend = vi.fn().mockReturnValue(pending.promise);
    const { container, root } = await renderChatInput(onSend);
    roots.push(root);
    const file = makeFile();

    await act(async () => {
      setFiles(fileInput(container), [file]);
      fileInput(container).dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      sendButton(container).click();
      sendButton(container).click();
    });

    expect(onSend).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });
  });
});
