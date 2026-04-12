'use client';

/**
 * ToastProvider — Premium notification system with destination routing.
 *
 * Toasts include:
 * - Action confirmation (✓ Saved, ✓ Pinned, ✓ Created)
 * - Destination hints ("View in Key Points", "Open Timeline")
 * - Auto-dismiss with progress indicator
 * - Stacked display for multiple simultaneous toasts
 */

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Warning, X, ArrowRight } from '@phosphor-icons/react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Toast severity levels. */
export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

/** Destination link shown in the toast body. */
export interface ToastDestination {
    label: string;
    href: string;
}

/** Full toast configuration. */
export interface ToastConfig {
    id: string;
    title: string;
    description?: string;
    variant: ToastVariant;
    destination?: ToastDestination;
    /** Auto-dismiss duration in ms (default: 4000). Set to 0 to disable. */
    duration?: number;
}

/** Context value exposed to consumers. */
interface ToastContextValue {
    /** Show a toast notification. */
    showToast: (config: Omit<ToastConfig, 'id'>) => string;
    /** Dismiss a toast by ID. */
    dismissToast: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

/** Hook to access the toast system. */
export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return ctx;
}

// ---------------------------------------------------------------------------
// Variant styling
// ---------------------------------------------------------------------------

const VARIANT_STYLES: Record<ToastVariant, { icon: typeof Check; bg: string; accent: string }> = {
    success: {
        icon: Check,
        bg: 'bg-[var(--surface-elevated)] border-[var(--success-soft)]/30',
        accent: 'text-[var(--success-soft)]',
    },
    error: {
        icon: Warning,
        bg: 'bg-[var(--surface-elevated)] border-[var(--critical-access)]/30',
        accent: 'text-[var(--critical-access)]',
    },
    warning: {
        icon: Warning,
        bg: 'bg-[var(--surface-elevated)] border-[var(--warning-muted)]/30',
        accent: 'text-[var(--warning-muted)]',
    },
    info: {
        icon: Check,
        bg: 'bg-[var(--surface-elevated)] border-[var(--accent-icy)]/30',
        accent: 'text-[var(--accent-icy)]',
    },
};

// ---------------------------------------------------------------------------
// Toast Item Component
// ---------------------------------------------------------------------------

function ToastItem({
    toast,
    onDismiss,
}: {
    toast: ToastConfig;
    onDismiss: (id: string) => void;
}) {
    const style = VARIANT_STYLES[toast.variant];
    const Icon = style.icon;
    const isUrgent = toast.variant === 'error' || toast.variant === 'warning';

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className={`
                relative flex items-start gap-3 px-4 py-3 rounded-2xl
                border backdrop-blur-lg shadow-lg
                min-w-[320px] max-w-[420px]
                ${style.bg}
            `}
            role={isUrgent ? 'alert' : 'status'}
            aria-live={isUrgent ? 'assertive' : 'polite'}
        >
            {/* Icon */}
            <div className={`mt-0.5 flex-shrink-0 ${style.accent}`}>
                <Icon size={18} weight="bold" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[var(--text-heading)]">
                    {toast.title}
                </p>
                {toast.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        {toast.description}
                    </p>
                )}
                {(() => {
                    const safeDestination =
                        toast.destination && /^\/(?!\/)/.test(toast.destination.href)
                            ? toast.destination
                            : undefined;
                    return safeDestination ? (
                        <a
                            href={safeDestination.href}
                            className={`
                                inline-flex items-center gap-1 mt-1.5
                                text-xs font-medium ${style.accent}
                                hover:underline transition-colors
                            `}
                        >
                            {safeDestination.label}
                            <ArrowRight size={12} weight="bold" />
                        </a>
                    ) : null;
                })()}
            </div>

            {/* Dismiss */}
            <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                className="flex-shrink-0 text-[var(--text-muted)] hover:text-[var(--text-heading)] transition-colors p-0.5"
                aria-label="Dismiss notification"
            >
                <X size={14} />
            </button>
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

/** Wrap your app with ToastProvider to enable the toast system. */
export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastConfig[]>([]);
    const timeoutIdsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

    const dismissToast = useCallback((id: string) => {
        const timeoutId = timeoutIdsRef.current.get(id);
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutIdsRef.current.delete(id);
        }
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showToast = useCallback(
        (config: Omit<ToastConfig, 'id'>) => {
            const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const toast: ToastConfig = { ...config, id };
            setToasts((prev) => [...prev, toast]);

            // Auto-dismiss with cleanup tracking
            const duration = config.duration ?? 4000;
            if (duration > 0) {
                const timeoutId = setTimeout(() => {
                    timeoutIdsRef.current.delete(id);
                    dismissToast(id);
                }, duration);
                timeoutIdsRef.current.set(id, timeoutId);
            }

            return id;
        },
        [dismissToast]
    );

    // Clean up orphaned timers on unmount
    useEffect(() => {
        const timeoutIds = timeoutIdsRef.current;
        return () => {
            timeoutIds.forEach((timerId) => clearTimeout(timerId));
            timeoutIds.clear();
        };
    }, []);

    return (
        <ToastContext.Provider value={{ showToast, dismissToast }}>
            {children}

            {/* Toast container — bottom-right */}
            <div
                className="fixed bottom-6 right-6 z-40 flex flex-col-reverse gap-2"
                aria-label="Notifications"
            >
                <AnimatePresence mode="popLayout">
                    {toasts.map((toast) => (
                        <ToastItem
                            key={toast.id}
                            toast={toast}
                            onDismiss={dismissToast}
                        />
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}
