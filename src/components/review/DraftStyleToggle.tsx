'use client';

/**
 * Draft Style Toggle — Switch between original text and court-safe version.
 *
 * "Original" shows the raw workspace text.
 * "Court Safe" shows the transformed, emotion-stripped version.
 */

import { FileText, ShieldCheck } from '@phosphor-icons/react';

interface DraftStyleToggleProps {
    mode: 'original' | 'court_safe';
    onChange: (mode: 'original' | 'court_safe') => void;
}

/** Segmented toggle for switching between original and court-safe text. */
export default function DraftStyleToggle({ mode, onChange }: DraftStyleToggleProps) {
    return (
        <div className="flex items-center rounded-xl bg-white/5 border border-white/10 p-0.5" role="group" aria-label="Text display mode">
            <button
                type="button"
                onClick={() => onChange('original')}
                aria-pressed={mode === 'original'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    mode === 'original'
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-white/40 hover:text-white/60'
                }`}
                title="Show original workspace text"
            >
                <FileText size={13} weight="bold" />
                Original
            </button>
            <button
                type="button"
                onClick={() => onChange('court_safe')}
                aria-pressed={mode === 'court_safe'}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                    mode === 'court_safe'
                        ? 'bg-emerald-500/15 text-emerald-400 shadow-sm'
                        : 'text-white/40 hover:text-white/60'
                }`}
                title="Show court-safe transformed text"
            >
                <ShieldCheck size={13} weight="bold" />
                Court Safe
            </button>
        </div>
    );
}
