'use client';

import type { ReactNode } from 'react';
import { useMobileOverlay } from '@/lib/mobile/useMobileOverlay';

type MobileBottomSheetProps = {
  isOpen: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
};

/** Accessible safe-area aware bottom sheet for short mobile configuration flows. */
export function MobileBottomSheet({
  isOpen,
  title,
  description,
  children,
  footer,
  onClose,
}: MobileBottomSheetProps) {
  const { dialogRef, titleId } = useMobileOverlay(isOpen, onClose);
  const descriptionId = description ? `${titleId}-description` : undefined;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 mx-auto max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] text-neutral-900 shadow-2xl outline-none dark:border dark:border-white/10 dark:bg-neutral-950 dark:text-neutral-50"
      >
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <div className="mb-5">
          <h2 id={titleId} className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-2 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
              {description}
            </p>
          ) : null}
        </div>
        <div className="space-y-5">{children}</div>
        {footer ? <div className="mt-6">{footer}</div> : null}
      </div>
    </div>
  );
}
