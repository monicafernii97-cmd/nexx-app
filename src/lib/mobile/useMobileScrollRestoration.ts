'use client';

import { useEffect } from 'react';

type MobileScrollRestorationArgs = {
  key: string;
  enabled?: boolean;
};

/** Preserve mobile scroll position for interruption-prone case screens. */
export function useMobileScrollRestoration({
  key,
  enabled = true,
}: MobileScrollRestorationArgs) {
  useEffect(() => {
    if (!enabled) return undefined;
    const storageKey = `mobile-scroll:${key}`;

    try {
      const stored = window.sessionStorage.getItem(storageKey);
      const scrollY = stored ? Number.parseInt(stored, 10) : 0;
      if (Number.isFinite(scrollY) && scrollY > 0) {
        window.requestAnimationFrame(() => window.scrollTo(0, scrollY));
      }
    } catch {
      // Scroll restoration is best-effort.
    }

    const saveScroll = () => {
      try {
        window.sessionStorage.setItem(storageKey, String(window.scrollY));
      } catch {
        // Session storage can be unavailable in private or constrained modes.
      }
    };

    window.addEventListener('pagehide', saveScroll);
    window.addEventListener('visibilitychange', saveScroll);
    return () => {
      saveScroll();
      window.removeEventListener('pagehide', saveScroll);
      window.removeEventListener('visibilitychange', saveScroll);
    };
  }, [enabled, key]);
}
