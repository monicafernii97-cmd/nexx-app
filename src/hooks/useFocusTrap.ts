import { useEffect, useRef, useCallback } from 'react';

/**
 * Focus trap hook for modal dialogs.
 *
 * - Moves focus into the dialog on mount
 * - Traps Tab / Shift+Tab within focusable elements
 * - Closes on Escape (if onClose provided)
 * - Restores focus to the previously-focused element on unmount
 *
 * @note The element receiving the returned ref should have `tabIndex={-1}`
 * to enable the fallback focus behavior when no focusable children exist.
 */
export function useFocusTrap(
    isOpen: boolean,
    onClose?: () => void
) {
    const containerRef = useRef<HTMLDivElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    /** Query all focusable elements within the trap container. */
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

        /** Schedule focus into the first focusable element after the render frame. */
        const raf = requestAnimationFrame(() => {
            const focusable = getFocusableElements();
            if (focusable.length > 0) {
                focusable[0].focus();
            } else {
                containerRef.current?.focus();
            }
        });

        /** Handle Escape to close and Tab/Shift-Tab to cycle focus within the trap. */
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
