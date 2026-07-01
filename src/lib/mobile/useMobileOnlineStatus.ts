'use client';

import { useEffect, useRef, useState } from 'react';
import { trackMobileEvent } from './mobileAnalytics';

export type MobileOnlineStatus = {
  isOnline: boolean;
  wasOffline: boolean;
  justRestored: boolean;
};

const SSR_SAFE_ONLINE_STATUS: MobileOnlineStatus = {
  isOnline: true,
  wasOffline: false,
  justRestored: false,
};

/** Read the browser online state after mount. */
function getInitialOnlineStatus(): MobileOnlineStatus {
  if (typeof navigator === 'undefined') {
    return SSR_SAFE_ONLINE_STATUS;
  }

  const isOnline = navigator.onLine;
  return {
    isOnline,
    wasOffline: !isOnline,
    justRestored: false,
  };
}

/** Track mobile online/offline state and emit metadata-only quality events. */
export function useMobileOnlineStatus(caseId?: string): MobileOnlineStatus {
  const restoredTimerRef = useRef<number | null>(null);
  const [status, setStatus] = useState<MobileOnlineStatus>(SSR_SAFE_ONLINE_STATUS);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      const initialStatus = getInitialOnlineStatus();
      setStatus(initialStatus);
      if (!initialStatus.isOnline) {
        trackMobileEvent('mobile_offline_detected', { caseId });
      }
    });

    const handleOffline = () => {
      setStatus({
        isOnline: false,
        wasOffline: true,
        justRestored: false,
      });
      trackMobileEvent('mobile_offline_detected', { caseId });
    };

    const handleOnline = () => {
      if (restoredTimerRef.current) {
        window.clearTimeout(restoredTimerRef.current);
      }
      setStatus({
        isOnline: true,
        wasOffline: true,
        justRestored: true,
      });
      trackMobileEvent('mobile_connection_restored', { caseId });
      restoredTimerRef.current = window.setTimeout(() => {
        setStatus((current) => ({ ...current, justRestored: false }));
        restoredTimerRef.current = null;
      }, 4000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (restoredTimerRef.current) {
        window.clearTimeout(restoredTimerRef.current);
      }
    };
  }, [caseId]);

  return status;
}
