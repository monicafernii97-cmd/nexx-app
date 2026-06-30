'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type PersistentStateOptions<T> = {
  key: string;
  initialValue: T;
  enabled?: boolean;
};

export function usePersistentMobileState<T>({
  key,
  initialValue,
  enabled = true,
}: PersistentStateOptions<T>) {
  const [value, setValue] = useState<T>(initialValue);
  const [hasHydrated, setHasHydrated] = useState(false);
  const skipNextWriteRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      if (!enabled) {
        setHasHydrated(true);
        return;
      }

      try {
        const stored = window.localStorage.getItem(key);
        if (stored) {
          setValue(JSON.parse(stored) as T);
        }
      } catch {
        // Fall back to the provided initial value if storage is unavailable.
      } finally {
        setHasHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled || !hasHydrated) return;

    if (skipNextWriteRef.current) {
      skipNextWriteRef.current = false;
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Persistence is best-effort. The UI should still work without storage.
    }
  }, [enabled, hasHydrated, key, value]);

  const clear = useCallback(() => {
    skipNextWriteRef.current = true;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore localStorage failures.
    }
    setValue(initialValue);
  }, [initialValue, key]);

  return {
    value,
    setValue,
    clear,
    hasHydrated,
  };
}

