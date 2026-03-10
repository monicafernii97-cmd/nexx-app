'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useCallback } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface ConfirmDeleteModalProps {
    /** Whether the modal is visible. */
    isOpen: boolean;
    /** Whether a delete operation is in progress (disables buttons). */
    isDeleting: boolean;
    /** Error message to display inside the modal, or null. */
    deleteError: string | null;
    /** Called when the user dismisses the modal (Cancel / Escape / overlay click). */
    onClose: () => void;
    /** Called when the user confirms deletion. */
    onDelete: () => void;
    /** Dialog title. @default "Delete Incident" */
    title?: string;
    /** Confirmation body text. */
    description?: string;
    /** HTML id for aria-labelledby. @default "confirm-delete-dialog-title" */
    dialogTitleId?: string;
    /** Label on the confirm button. @default "Delete" */
    confirmLabel?: string;
    /** Whether to show the X close button in the header. @default false */
    showCloseButton?: boolean;
}

/**
 * Reusable delete confirmation modal with focus trapping,
 * Escape handling, and animated entry/exit.
 */
export function ConfirmDeleteModal({
    isOpen,
    isDeleting,
    deleteError,
    onClose,
    onDelete,
    title = 'Delete Incident',
    description = 'Are you sure you want to permanently delete this incident record?',
    dialogTitleId = 'confirm-delete-dialog-title',
    confirmLabel = 'Delete',
    showCloseButton = false,
}: ConfirmDeleteModalProps) {
    const handleClose = useCallback(() => {
        if (!isDeleting) onClose();
    }, [isDeleting, onClose]);

    const dialogRef = useFocusTrap(isOpen, handleClose);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center"
                    style={{ background: 'rgba(2, 2, 45, 0.8)' }}
                    onClick={handleClose}
                >
                    <motion.div
                        ref={dialogRef}
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="card-gilded p-6 max-w-sm mx-4"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={dialogTitleId}
                        tabIndex={-1}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center"
                                style={{ background: 'rgba(199, 90, 90, 0.12)', border: '1px solid rgba(199, 90, 90, 0.25)' }}
                            >
                                <AlertTriangle size={18} style={{ color: '#C75A5A' }} />
                            </div>
                            <div>
                                <h3 id={dialogTitleId} className="text-sm font-semibold" style={{ color: '#F5EFE0' }}>
                                    {title}
                                </h3>
                                <p className="text-xs" style={{ color: '#8A7A60' }}>
                                    This action cannot be undone.
                                </p>
                            </div>
                            {showCloseButton && (
                                <button
                                    onClick={handleClose}
                                    className="ml-auto p-1 rounded-lg hover:bg-[rgba(138,122,96,0.1)]"
                                    disabled={isDeleting}
                                    aria-label="Close"
                                >
                                    <X size={14} style={{ color: '#8A7A60' }} />
                                </button>
                            )}
                        </div>
                        <p className="text-sm mb-5" style={{ color: '#B8A88A' }}>
                            {description}
                        </p>
                        {deleteError && (
                            <p className="text-xs mb-3" style={{ color: '#C75A5A' }}>{deleteError}</p>
                        )}
                        <div className="flex gap-3">
                            <button onClick={handleClose} disabled={isDeleting} className="btn-outline flex-1">
                                Cancel
                            </button>
                            <button
                                onClick={onDelete}
                                disabled={isDeleting}
                                className="flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all"
                                style={{ background: 'rgba(199, 90, 90, 0.15)', border: '1px solid rgba(199, 90, 90, 0.3)', color: '#C75A5A' }}
                            >
                                {isDeleting ? 'Deleting...' : confirmLabel}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
