'use client';

import type { ReactNode } from 'react';
import { useMobileOverlay } from '@/lib/mobile/useMobileOverlay';

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
  const { dialogRef, titleId } = useMobileOverlay(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex min-h-dvh flex-col bg-white text-neutral-900 outline-none dark:bg-neutral-950 dark:text-neutral-50"
    >
      <header className="sticky top-0 z-10 border-b border-neutral-200 bg-white dark:border-white/10 dark:bg-neutral-950">
        <div className="mx-auto grid h-16 w-full max-w-md grid-cols-[72px_minmax(0,1fr)_72px] items-center px-4">
          <div className="justify-self-start">{leftAction}</div>
          <h2
            id={titleId}
            className="truncate text-center text-sm font-semibold text-neutral-900 dark:text-neutral-50"
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
