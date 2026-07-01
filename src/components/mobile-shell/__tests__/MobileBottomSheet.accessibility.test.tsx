// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileBottomSheet } from '../MobileBottomSheet';

let container: HTMLDivElement;
let root: Root;

async function renderSheet(onClose = vi.fn()) {
  await act(async () => {
    root.render(
      <MobileBottomSheet
        isOpen
        title="Generate Report"
        description="Create a mobile draft."
        onClose={onClose}
      >
        <button type="button">Inside action</button>
      </MobileBottomSheet>,
    );
  });
  await act(async () => {
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  });
  return onClose;
}

describe('MobileBottomSheet accessibility contract', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(performance.now()), 0)
    ));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('renders as a labelled modal dialog and moves focus inside', async () => {
    await renderSheet();
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const titleId = dialog.getAttribute('aria-labelledby');
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId ?? '')?.textContent).toBe('Generate Report');
    expect(document.activeElement?.textContent).toContain('Inside action');
  });

  it('closes on Escape for keyboard users', async () => {
    const onClose = await renderSheet();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
