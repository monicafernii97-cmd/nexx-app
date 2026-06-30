'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { usePreventBodyScroll } from './usePreventBodyScroll';

/** Provides stable focus, label, and scroll-lock wiring for mobile overlays. */
export function useMobileOverlay(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const stableOnClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  const dialogRef = useFocusTrap(isOpen, stableOnClose);
  usePreventBodyScroll(isOpen);

  return {
    dialogRef,
    titleId,
  };
}
