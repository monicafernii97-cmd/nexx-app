'use client';

import { useEffect, useRef, useState } from 'react';
import { trackMobileEvent } from './mobileAnalytics';

export type MobileOnlineStatus = {
  isOnline: boolean;
  wasOffline: boolean;
  justRestored: boolean;
};

/** Read the initial browser online state without requiring an effect update. */
function getInitialOnlineStatus(): MobileOnlineStatus {
  if (typeof navigator === 'undefined') {
    return {
      isOnline: true,
      wasOffline: false,
      justRestored: false,
    };
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
  const [status, setStatus] = useState<MobileOnlineStatus>(getInitialOnlineStatus);

  useEffect(() => {
    if (!navigator.onLine) {
      trackMobileEvent('mobile_offline_detected', { caseId });
    }

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
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (restoredTimerRef.current) {
        window.clearTimeout(restoredTimerRef.current);
      }
    };
  }, [caseId]);

  return status;
}
