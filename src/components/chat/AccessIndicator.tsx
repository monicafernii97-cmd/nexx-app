'use client';

/**
 * AccessIndicator — Visual indicator for document access level.
 *
 * States:
 * - "Masked review" — default safe mode
 * - "Elevated raw access" — viewing unredacted content  
 * - "Approval required" — pending access request
 * - "Access expires in Xm" — countdown for temporary elevated access
 */

import { Shield, ShieldCheck, ShieldWarning, Clock } from '@phosphor-icons/react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AccessLevel = 'masked' | 'elevated' | 'approval_required' | 'expiring';

interface AccessIndicatorProps {
    level: AccessLevel;
    /** Minutes remaining (only for 'expiring' level) */
    expiresInMinutes?: number;
}

// ---------------------------------------------------------------------------
// Level config
// ---------------------------------------------------------------------------

const LEVEL_CONFIG: Record<AccessLevel, {
    icon: typeof Shield;
    label: string;
    color: string;
    bg: string;
}> = {
    masked: {
        icon: Shield,
        label: 'Masked review',
        color: 'text-[var(--text-muted)]',
        bg: 'bg-[var(--surface-elevated)]',
    },
    elevated: {
        icon: ShieldCheck,
        label: 'Elevated raw access',
        color: 'text-[var(--warning-muted)]',
        bg: 'bg-[var(--warning-muted)]/10',
    },
    approval_required: {
        icon: ShieldWarning,
        label: 'Approval required',
        color: 'text-[var(--critical-access)]',
        bg: 'bg-[var(--critical-access)]/10',
    },
    expiring: {
        icon: Clock,
        label: 'Access expires',
        color: 'text-[var(--warning-muted)]',
        bg: 'bg-[var(--warning-muted)]/10',
    },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Compact access-level indicator badge with icon, label, and optional expiry countdown. */
export function AccessIndicator({ level, expiresInMinutes }: AccessIndicatorProps) {
    const config = LEVEL_CONFIG[level];
    const Icon = config.icon;

    const safeMinutes = typeof expiresInMinutes === 'number' && Number.isFinite(expiresInMinutes) && expiresInMinutes > 0
        ? Math.round(expiresInMinutes)
        : undefined;

    const label = level === 'expiring' && safeMinutes !== undefined
        ? `Access expires in ${safeMinutes}m`
        : config.label;

    return (
        <span
            className={`
                inline-flex items-center gap-1.5 px-2.5 py-1
                text-[10px] font-semibold tracking-wide rounded-full
                border border-current/10
                ${config.color} ${config.bg}
            `}
        >
            <Icon size={12} weight="bold" />
            {label}
        </span>
    );
}
