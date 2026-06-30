'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { usePreventBodyScroll } from '@/lib/mobile/usePreventBodyScroll';

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

export function MobileDrawer({
  isOpen,
  title = 'Nexproof',
  items,
  onClose,
}: MobileDrawerProps) {
  const drawerRef = useFocusTrap(isOpen, onClose);
  usePreventBodyScroll(isOpen);

  if (!isOpen) return null;

  const titleId = `mobile-drawer-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

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
        className="absolute inset-y-0 left-0 flex w-[min(320px,86vw)] flex-col border-r border-neutral-200 bg-white p-4 text-neutral-900 shadow-2xl outline-none"
      >
        <div className="mb-4 flex h-12 items-center justify-between">
          <h2 id={titleId} className="text-base font-semibold text-neutral-900">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-neutral-700 active:bg-neutral-100"
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
              className={`flex min-h-12 items-center gap-3 rounded-2xl px-3 text-sm font-medium ${
                item.isActive
                  ? 'bg-neutral-100 text-neutral-950'
                  : 'text-neutral-700 active:bg-neutral-100'
              }`}
            >
              {item.icon ? <span className="text-neutral-500">{item.icon}</span> : null}
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
