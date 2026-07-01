'use client';

import { WifiOff } from 'lucide-react';
import { useMobileOnlineStatus } from '@/lib/mobile/useMobileOnlineStatus';

type MobileOfflineBannerProps = {
  caseId?: string;
};

/** Calm offline and sync-restored status banner for mobile case flows. */
export function MobileOfflineBanner({ caseId }: MobileOfflineBannerProps) {
  const { isOnline, justRestored } = useMobileOnlineStatus(caseId);

  if (isOnline && !justRestored) return null;

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-3">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 shadow-sm">
        <div className="flex gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
            <WifiOff aria-hidden="true" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {isOnline ? 'Connection restored.' : "You're offline."}
            </p>
            <p className="mt-1 text-sm leading-6 text-neutral-600">
              {isOnline
                ? 'Your latest changes are syncing.'
                : 'You can keep reviewing saved drafts. New changes will sync when your connection returns.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
