'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useMobileOverlay } from '@/lib/mobile/useMobileOverlay';

export type MobileDrawerItem = {
  label: string;
  href: string;
  icon?: ReactNode;
  isActive?: boolean;
};

type MobileDrawerProps = {
  isOpen: boolean;
  title?: string;
  items: MobileDrawerItem[];
  onClose: () => void;
};

/** Accessible slide-out mobile navigation drawer with focus and scroll handling. */
export function MobileDrawer({
  isOpen,
  title = 'Nexproof',
  items,
  onClose,
}: MobileDrawerProps) {
  const { dialogRef: drawerRef, titleId } = useMobileOverlay(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close navigation"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <nav
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col border-r border-neutral-200 bg-white p-4 text-neutral-900 shadow-2xl outline-none dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-50"
      >
        <div className="mb-4 flex h-12 items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 active:bg-neutral-100 dark:text-neutral-200 dark:active:bg-white/10"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              aria-current={item.isActive ? 'page' : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-medium ${
                item.isActive
                  ? 'bg-neutral-100 text-neutral-950 dark:bg-white/10 dark:text-neutral-50'
                  : 'text-neutral-700 active:bg-neutral-100 dark:text-neutral-300 dark:active:bg-white/10'
              }`}
            >
              {item.icon ? <span className="text-neutral-500 dark:text-neutral-400">{item.icon}</span> : null}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
