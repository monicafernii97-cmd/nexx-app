import { useEffect, useRef, useCallback } from 'react';

/**
 * Focus trap hook for modal dialogs.
 *
 * - Moves focus into the dialog on mount
 * - Traps Tab / Shift+Tab within focusable elements
 * - Closes on Escape (if onClose provided)
 * - Restores focus to the previously-focused element on unmount
 */
export function useFocusTrap(
    isOpen: boolean,
    onClose?: () => void
) {
    const containerRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    const getFocusableElements = useCallback(() => {
        if (!containerRef.current) return [];
        return Array.from(
            containerRef.current.querySelectorAll<HTMLElement>(
                'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([disabled])'
            )
        );
    }, []);

    useEffect(() => {
        if (!isOpen) return;

        // Save the currently-focused element to restore later
        previousFocusRef.current = document.activeElement as HTMLElement;

        // Move focus into the dialog after a frame (wait for render)
        const raf = requestAnimationFrame(() => {
            const focusable = getFocusableElements();
            if (focusable.length > 0) {
                focusable[0].focus();
            } else {
                containerRef.current?.focus();
            }
        });

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose?.();
                return;
            }

            if (e.key !== 'Tab') return;

            const focusable = getFocusableElements();
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener('keydown', handleKeyDown);

            // Restore focus
            previousFocusRef.current?.focus();
        };
    }, [isOpen, onClose, getFocusableElements]);

    return containerRef;
}
