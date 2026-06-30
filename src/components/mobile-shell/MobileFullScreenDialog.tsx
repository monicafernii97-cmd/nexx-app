'use client';

import type { ReactNode } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { usePreventBodyScroll } from '@/lib/mobile/usePreventBodyScroll';

type MobileFullScreenDialogProps = {
  isOpen: boolean;
  title: string;
  leftAction: ReactNode;
  rightAction: ReactNode;
  children: ReactNode;
  onClose: () => void;
};

export function MobileFullScreenDialog({
  isOpen,
  title,
  leftAction,
  rightAction,
  children,
  onClose,
}: MobileFullScreenDialogProps) {
  const dialogRef = useFocusTrap(isOpen, onClose);
  usePreventBodyScroll(isOpen);

  if (!isOpen) return null;

  const titleId = `mobile-fullscreen-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex min-h-dvh flex-col bg-white text-neutral-900 outline-none"
    >
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white">
        <div className="mx-auto grid h-16 w-full max-w-md grid-cols-[72px_minmax(0,1fr)_72px] items-center px-4">
          <div className="justify-self-start">{leftAction}</div>
          <h2
            id={titleId}
            className="truncate text-center text-sm font-semibold text-neutral-900"
          >
            {title}
          </h2>
          <div className="justify-self-end">{rightAction}</div>
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {children}
      </div>
    </div>
  );
}

