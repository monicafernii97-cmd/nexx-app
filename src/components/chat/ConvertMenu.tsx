'use client';

/**
 * ConvertMenu — "Convert This Into..." dropdown inside panel headers.
 *
 * Lets users transform panel content into different document types:
 * Exhibit summary, Incident narrative, Affidavit language,
 * Motion paragraph, Hearing outline, Timeline item.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowsClockwise,
    FileText,
    SealWarning,
    Strategy,
    CalendarCheck,
} from '@phosphor-icons/react';
import { CONVERT_OPTIONS, type ConvertTarget } from '@/lib/integration/route-created-item';

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, typeof FileText> = {
    FileText,
    SealWarning,
    Strategy,
    CalendarCheck,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConvertMenuProps {
    /** Content to convert */
    content: string;
    /** Panel title for context */
    panelTitle?: string;
    /** Called when user selects a conversion target */
    onConvert: (target: ConvertTarget, content: string, title: string) => void;
    /** Compact mode — just icon */
    compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ConvertMenu({ content, panelTitle, onConvert, compact = false }: ConvertMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    const handleSelect = (target: ConvertTarget) => {
        onConvert(target, content, panelTitle ?? 'Untitled');
        setIsOpen(false);
    };

    return (
        <div ref={menuRef} className="relative">
            <button
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className={`
                    flex items-center gap-1.5 rounded-lg transition-all
                    text-[var(--text-muted)] hover:text-[var(--accent-icy)]
                    hover:bg-[var(--surface-elevated)]
                    ${compact ? 'p-1.5' : 'px-2.5 py-1.5'}
                `}
                aria-label="Convert this into..."
                aria-expanded={isOpen}
                title="Convert this into..."
            >
                <ArrowsClockwise size={compact ? 14 : 12} />
                {!compact && (
                    <span className="text-[11px] font-medium">Convert</span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.96 }}
                        transition={{ duration: 0.12 }}
                        className="
                            absolute right-0 top-full mt-1.5 z-40
                            w-56 rounded-xl border border-white/12
                            bg-[#0E1729]/97 backdrop-blur-xl
                            shadow-2xl shadow-black/40 overflow-hidden
                        "
                    >
                        <div className="px-3 py-2 border-b border-white/5">
                            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/25">
                                Convert This Into
                            </p>
                        </div>

                        <div className="p-1.5">
                            {CONVERT_OPTIONS.map(option => {
                                const Icon = ICON_MAP[option.icon] ?? FileText;
                                return (
                                    <button
                                        key={option.target}
                                        onClick={() => handleSelect(option.target)}
                                        className="
                                            w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg
                                            text-white/60 hover:text-white/90 hover:bg-white/5
                                            transition-all duration-100
                                        "
                                    >
                                        <Icon size={14} weight="duotone" className="text-white/40" />
                                        <span className="text-[12px] font-medium">{option.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
