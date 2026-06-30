'use client';

import { useCallback, useEffect, useState } from 'react';

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
  const [value, setValue] = useState<T>(() => {
    if (!enabled || typeof window === 'undefined') return initialValue;

    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    if (!enabled) return;

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Persistence is best-effort. The UI should still work without storage.
    }
  }, [enabled, key, value]);

  const clear = useCallback(() => {
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
    hasHydrated: true,
  };
}

