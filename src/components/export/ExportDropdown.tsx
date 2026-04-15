'use client';

/**
 * Export Dropdown — Trigger button for opening export modals.
 *
 * A floating action button + animated dropdown that lets users choose
 * which export path to start: Summary, Court Document, or Exhibit Packet.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';
import {
    Export,
    FileText,
    Scales,
    FolderOpen,
} from '@phosphor-icons/react';
import type { ExportPath } from '@/lib/export-assembly/types/exports';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExportDropdownProps {
    onSelect: (path: ExportPath) => void;
    /** Visual state — disabled when export already in progress */
    disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXPORT_OPTIONS: { path: ExportPath; label: string; description: string; icon: typeof FileText; gradient: string; shadow: string }[] = [
    {
        path: 'case_summary',
        label: 'Case Summary',
        description: 'Generate a structured summary report',
        icon: FileText,
        gradient: 'from-emerald-500 to-emerald-600',
        shadow: 'shadow-emerald-500/20',
    },
    {
        path: 'court_document',
        label: 'Court Document',
        description: 'Assemble a court-ready filing',
        icon: Scales,
        gradient: 'from-[#1A4B9B] to-[#123D7E]',
        shadow: 'shadow-[#1A4B9B]/20',
    },
    {
        path: 'exhibit_document',
        label: 'Exhibit Packet',
        description: 'Build an organized exhibit binder',
        icon: FolderOpen,
        gradient: 'from-violet-500 to-violet-600',
        shadow: 'shadow-violet-500/20',
    },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExportDropdown({ onSelect, disabled }: ExportDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    return (
        <div ref={dropdownRef} className="relative">
            {/* Trigger Button */}
            <button
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                className="group flex items-center gap-2.5 px-5 py-3 rounded-2xl text-[13px] font-bold tracking-[0.12em] uppercase text-white bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border border-white/25 shadow-[0_8px_20px_rgba(26,75,155,0.4),inset_0_1px_1px_rgba(255,255,255,0.3)] hover:shadow-[0_12px_28px_rgba(26,75,155,0.5)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
                <Export
                    size={18}
                    weight="bold"
                    className="transition-transform group-hover:scale-110"
                />
                Generate
            </button>

            {/* Dropdown */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: -8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.92, y: -8 }}
                        transition={{ type: 'spring', duration: 0.3 }}
                        className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-white/15 bg-[linear-gradient(160deg,rgba(13,27,62,0.98),rgba(10,17,40,0.98))] backdrop-blur-3xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                    >
                        <div className="p-2">
                            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/30 px-3 pt-2 pb-1">
                                Select Export Type
                            </p>

                            {EXPORT_OPTIONS.map((option, i) => {
                                const Icon = option.icon;
                                return (
                                    <motion.button
                                        key={option.path}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        onClick={() => {
                                            onSelect(option.path);
                                            setIsOpen(false);
                                        }}
                                        className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/8 transition-all group/item"
                                    >
                                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${option.gradient} flex items-center justify-center shrink-0 ${option.shadow} shadow-lg group-hover/item:scale-105 transition-transform`}>
                                            <Icon size={20} weight="duotone" className="text-white" />
                                        </div>
                                        <div className="text-left">
                                            <p className="text-[13px] font-bold text-white/90 group-hover/item:text-white transition-colors">
                                                {option.label}
                                            </p>
                                            <p className="text-[11px] text-white/40">{option.description}</p>
                                        </div>
                                    </motion.button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
