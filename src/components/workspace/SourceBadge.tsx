'use client';

/**
 * SourceBadge — Shows the origin of a workspace item.
 *
 * Small pill badge: "Created from Chat" / "Created manually" / "Imported"
 * Clicking "Created from Chat" links back to the source conversation.
 */

import Link from 'next/link';
import { ChatCircle, PencilSimple, Upload } from '@phosphor-icons/react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SourceType = 'chat' | 'manual' | 'import';

interface SourceBadgeProps {
    source: SourceType;
    /** If source is 'chat', link back to conversation */
    conversationId?: string;
    /** Compact mode — icon only */
    compact?: boolean;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SOURCE_CONFIG: Record<SourceType, {
    label: string;
    icon: typeof ChatCircle;
    color: string;
}> = {
    chat: {
        label: 'From Chat',
        icon: ChatCircle,
        color: 'var(--accent-icy)',
    },
    manual: {
        label: 'Manual',
        icon: PencilSimple,
        color: 'var(--text-muted)',
    },
    import: {
        label: 'Imported',
        icon: Upload,
        color: 'var(--support-violet)',
    },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SourceBadge({ source, conversationId, compact = false }: SourceBadgeProps) {
    const config = SOURCE_CONFIG[source];
    const Icon = config.icon;

    const badge = (
        <span
            className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-full
                text-[9px] font-bold uppercase tracking-widest
                border transition-colors
                ${source === 'chat'
                    ? 'bg-[var(--accent-icy)]/8 border-[var(--accent-icy)]/15 text-[var(--accent-icy)]/80 hover:bg-[var(--accent-icy)]/12 hover:text-[var(--accent-icy)]'
                    : source === 'import'
                        ? 'bg-[var(--support-violet)]/8 border-[var(--support-violet)]/15 text-[var(--support-violet)]/80'
                        : 'bg-white/5 border-white/8 text-white/30'
                }
            `}
        >
            <Icon size={10} weight="bold" />
            {!compact && <span>{config.label}</span>}
        </span>
    );

    // If it's from chat and we have a conversationId, make it a link
    if (source === 'chat' && conversationId) {
        return (
            <Link
                href={`/chat/${conversationId}`}
                className="no-underline hover:opacity-80 transition-opacity"
                title="View source conversation"
            >
                {badge}
            </Link>
        );
    }

    return badge;
}
