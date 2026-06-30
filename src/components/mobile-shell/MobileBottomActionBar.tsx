'use client';

import type { ReactNode } from 'react';

type MobileBottomActionBarProps = {
  children: ReactNode;
  className?: string;
};

/** Safe-area aware fixed bottom action container for mobile primary actions. */
export function MobileBottomActionBar({
  children,
  className = '',
}: MobileBottomActionBarProps) {
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur ${className}`}
    >
      <div className="mx-auto w-full max-w-md">{children}</div>
    </div>
  );
}

/** Contract-sized filled primary action button for mobile flows. */
export function MobilePrimaryActionButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-neutral-900 px-5 text-sm font-semibold text-white active:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

/** Contract-sized outlined secondary action button for paired mobile actions. */
export function MobileSecondaryActionButton({
  children,
  onClick,
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-800 active:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}
