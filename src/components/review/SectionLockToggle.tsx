'use client';

/**
 * Section Lock Toggle — Freeze/unfreeze a section from GPT regeneration.
 *
 * Locked sections preserve exact content through the drafting phase.
 * They won't be rewritten by GPT even on regeneration.
 */

import { LockSimple, LockSimpleOpen } from '@phosphor-icons/react';

interface SectionLockToggleProps {
    sectionId: string;
    isLocked: boolean;
    onToggle: (sectionId: string, locked: boolean) => void;
}

/** Toggle button for locking/unlocking a section from GPT regeneration. */
export default function SectionLockToggle({ sectionId, isLocked, onToggle }: SectionLockToggleProps) {
    return (
        <button
            onClick={() => onToggle(sectionId, !isLocked)}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                isLocked
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25'
                    : 'bg-white/5 text-white/30 border border-transparent hover:bg-white/10 hover:text-white/50'
            }`}
            title={isLocked ? 'Unlock section — allows GPT regeneration' : 'Lock section — preserves content through drafting'}
            aria-label={isLocked ? `Unlock ${sectionId}` : `Lock ${sectionId}`}
            aria-pressed={isLocked}
        >
            {isLocked ? (
                <LockSimple size={14} weight="fill" />
            ) : (
                <LockSimpleOpen size={14} weight="regular" />
            )}
        </button>
    );
}
