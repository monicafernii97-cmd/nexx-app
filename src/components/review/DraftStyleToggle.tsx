'use client';

/**
 * Draft Style Toggle — Switch between original text and court-ready version.
 *
 * "As Written" shows the raw workspace text exactly as the user entered it.
 * "Court-Ready" shows the transformed version with emotional language removed
 * and formal court tone applied — suitable for filing.
 */

import { FileText, ShieldCheck } from '@phosphor-icons/react';

interface DraftStyleToggleProps {
    mode: 'original' | 'court_safe';
    onChange: (mode: 'original' | 'court_safe') => void;
}

/** Segmented toggle for switching between original and court-ready text. */
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
                title="Your original text, exactly as entered"
            >
                <FileText size={13} weight="bold" />
                As Written
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
                title="Reformatted for court: emotional language removed, formal tone applied"
            >
                <ShieldCheck size={13} weight="bold" />
                Court-Ready
            </button>
        </div>
    );
}
