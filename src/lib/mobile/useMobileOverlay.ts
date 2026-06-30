'use client';

import { useId } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { usePreventBodyScroll } from './usePreventBodyScroll';

export function useMobileOverlay(isOpen: boolean, onClose: () => void) {
  const dialogRef = useFocusTrap(isOpen, onClose);
  const titleId = useId();

  usePreventBodyScroll(isOpen);

  return {
    dialogRef,
    titleId,
  };
}
