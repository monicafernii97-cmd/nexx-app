'use client';

import type { ReactNode } from 'react';

type MobileTopBarProps = {
  title: string;
  left?: ReactNode;
  right?: ReactNode;
  titleActionLabel?: string;
  onTitleAction?: () => void;
};

/** Sticky 64px mobile top bar with fixed side controls and truncating title. */
export function MobileTopBar({
  title,
  left,
  right,
  titleActionLabel,
  onTitleAction,
}: MobileTopBarProps) {
  const titleContent = (
    <span className="block truncate text-sm font-semibold text-neutral-900">
      {title}
    </span>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto grid h-16 w-full max-w-md grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 px-4">
        <div className="flex h-11 w-11 items-center justify-center">{left}</div>
        {onTitleAction ? (
          <button
            type="button"
            aria-label={titleActionLabel ?? title}
            onClick={onTitleAction}
            className="min-w-0 justify-self-center rounded-full px-3 py-2 text-sm font-medium text-neutral-900 active:bg-neutral-100"
          >
            {titleContent}
          </button>
        ) : (
          <div className="min-w-0 justify-self-center px-3 py-2 text-center">
            {titleContent}
          </div>
        )}
        <div className="flex h-11 w-11 items-center justify-center">{right}</div>
      </div>
    </header>
  );
}

/** Thumb-sized icon button with the contract-required accessible label. */
export function MobileIconButton({
  label,
  children,
  onClick,
  type = 'button',
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}) {
  return (
    <button
      type={type}
      aria-label={label}
      onClick={onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-800 active:bg-neutral-100"
    >
      {children}
    </button>
  );
}
