'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { useUser } from '@/lib/user-context';
import { titleCase } from '@/lib/utils/stringHelpers';
import {
    FileArrowUp,
    ArrowSquareOut,
    MapPin,
    CheckCircle,
    Circle,
    Download,
    ArrowRight,
    CaretDown,
    Warning,
    Bank,
    MagnifyingGlass,
    BookOpen,
    FileText,
    Scale,
    Shield,
    Clock,
    Building,
    Phone,
    Info,
} from '@phosphor-icons/react';
import Link from 'next/link';

// ═══════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════

import type { Doc } from '../../../../convex/_generated/dataModel';

/** Shape of the full cached resources object from Convex. */
type CachedResources = Doc<'resourcesCache'>['resources'];

// ═══════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════

/** Validate a dynamic URL — only allow http(s) to prevent javascript:/data: injection. */
function toSafeExternalUrl(url?: string): string | null {
    if (!url) return null;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
    } catch {
        return null;
    }
}

/** Format a timestamp to a human-readable date string. */
function formatDate(ts: number): string {
    return new Date(ts).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

// ═══════════════════════════════════════════
//  Sub-components
// ═══════════════════════════════════════════

/** Status pill for document lifecycle — Draft → Final → Filed. */
function StatusPill({ status }: { status: 'draft' | 'final' | 'filed' }) {
    const config = {
        draft: { label: 'Draft', bg: 'rgba(229, 168, 74, 0.1)', border: 'rgba(229, 168, 74, 0.25)', color: 'var(--warning)' },
        final: { label: 'Final', bg: 'rgba(90, 142, 201, 0.1)', border: 'rgba(90, 142, 201, 0.25)', color: 'var(--info)' },
        filed: { label: 'Filed', bg: 'rgba(74, 163, 100, 0.1)', border: 'rgba(74, 163, 100, 0.25)', color: '#4AA364' },
    }[status];

    return (
        <span
            className="text-xs font-medium px-2.5 py-0.5 rounded-full inline-flex items-center gap-1"
            style={{ background: config.bg, border: `1px solid ${config.border}`, color: config.color }}
        >
            {status === 'filed' && <CheckCircle size={10} />}
            {config.label}
        </span>
    );
}

/** Collapsible section wrapper for the Filing Guide. */
function CollapsibleSection({
    title,
    children,
    defaultOpen = false,
}: {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div
            className="rounded-xl overflow-hidden"
            style={{
                background: 'rgba(9, 9, 11, 0.25)',
                border: '1px solid rgba(63, 63, 70, 0.08)',
            }}
        >
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer text-left"
                style={{ background: 'transparent', border: 'none', color: 'var(--zinc-100)' }}
                aria-expanded={isOpen}
            >
                <span className="text-sm font-medium">{title}</span>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <CaretDown size={16} style={{ color: 'var(--zinc-400)' }} />
                </motion.div>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                    >
                        <div className="px-5 pb-4 text-xs leading-relaxed" style={{ color: 'var(--zinc-400)' }}>
                            {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/** Readiness checklist item. */
function ReadinessItem({
    label,
    isReady,
    href,
    detail,
}: {
    label: string;
    isReady: boolean;
    href?: string;
    detail?: string;
}) {
    const content = (
        <div
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${href && !isReady ? 'cursor-pointer group' : ''}`}
            style={{
                background: isReady ? 'rgba(74, 163, 100, 0.06)' : 'rgba(229, 168, 74, 0.04)',
                border: `1px solid ${isReady ? 'rgba(74, 163, 100, 0.15)' : 'rgba(229, 168, 74, 0.12)'}`,
            }}
        >
            {isReady ? (
                <CheckCircle size={16} style={{ color: '#4AA364' }} />
            ) : (
                <Circle size={16} style={{ color: 'var(--warning)' }} />
            )}
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: isReady ? '#4AA364' : 'var(--zinc-100)' }}>
                    {label}
                </p>
                {detail && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--zinc-400)' }}>
                        {detail}
                    </p>
                )}
            </div>
            {href && !isReady && (
                <ArrowRight
                    size={14}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: 'var(--zinc-400)' }}
                />
            )}
        </div>
    );

    return href && !isReady ? (
        <Link href={href} className="no-underline block">
            {content}
        </Link>
    ) : (
        content
    );
}

// ═══════════════════════════════════════════
//  Main Page
// ═══════════════════════════════════════════

/** eFiling Hub page — discover eFiling portals, check readiness, and manage documents for filing. */
export default function EFilingPage() {
    const { userId } = useUser();
    const courtSettings = useQuery(api.courtSettings.get);
    const user = useQuery(api.users.get, userId ? { id: userId } : 'skip');

    // Location — normalize with titleCase to match the cache keys written by the API route
    const rawState = courtSettings?.state || user?.state || '';
    const rawCounty = courtSettings?.county || user?.county || '';
    const state = titleCase(rawState);
    const county = titleCase(rawCounty);
    const locationLabel = county && state
        ? `${county}${county.toLowerCase().endsWith('county') ? '' : ' County'}, ${state}`
        : state || 'your area';

    // Resources cache — normalize county (strip "County" suffix) to match lookup route
    const normCounty = titleCase(rawCounty.replace(/\s+County$/i, '').trim());
    const hasCanonicalLocation = Boolean(state && normCounty);
    const cachedEntry = useQuery(
        api.resourcesCache.get,
        hasCanonicalLocation ? { state, county: normCounty } : 'skip',
    );
    const cachedResources: CachedResources | null = cachedEntry?.resources ?? null;
    const eFilingPortal = cachedResources?.eFilingPortal ?? null;
    const portalUrl = toSafeExternalUrl(eFilingPortal?.url);

    // Documents
    const finalDocs = useQuery(api.generatedDocuments.list, { status: 'final' }) ?? [];
    const filedDocs = useQuery(api.generatedDocuments.list, { status: 'filed' }) ?? [];
    const updateStatus = useMutation(api.generatedDocuments.updateStatus);

    // Mark as filed handler with inline error feedback
    const [filingId, setFilingId] = useState<string | null>(null);
    const [filingError, setFilingError] = useState<string | null>(null);
    const handleMarkAsFiled = useCallback(async (docId: Id<'generatedDocuments'>) => {
        setFilingId(docId);
        setFilingError(null);
        try {
            await updateStatus({ id: docId, status: 'filed' });
        } catch (err) {
            console.error('[eFiling] Failed to mark as filed:', err);
            setFilingError(err instanceof Error ? err.message : 'Failed to mark as filed. Please try again.');
            // Auto-dismiss error after 5 seconds
            setTimeout(() => setFilingError(null), 5000);
        } finally {
            setFilingId(null);
        }
    }, [updateStatus]);

    // Readiness checks
    const hasCourtSettings = Boolean(state && county);
    const hasCauseNumber = Boolean(courtSettings?.causeNumber);
    const hasCourtName = Boolean(courtSettings?.courtName);
    const hasFinalDocs = finalDocs.length > 0;

    // Loading states — cachedEntry is undefined while query is loading, null on cache miss
    const isCacheLoading = hasCanonicalLocation && cachedEntry === undefined;
    const isCacheMiss = hasCanonicalLocation && cachedEntry === null;

    // Quick links from cached resources
    const clerkUrl = toSafeExternalUrl(cachedResources?.courtClerk?.url);
    const caseSearchUrl = toSafeExternalUrl(cachedResources?.caseSearch?.url);
    const localRulesUrl = toSafeExternalUrl(cachedResources?.localRules?.url);

    return (
        <div className="max-w-5xl mx-auto pb-12">
            {/* ─── Header ─── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="mb-8"
            >
                <div className="flex items-center gap-3 mb-2">
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(135deg, var(--zinc-100), var(--zinc-400))',
                            boxShadow: '0 2px 12px rgba(63, 63, 70, 0.3)',
                        }}
                    >
                        <FileArrowUp size={18} style={{ color: 'var(--zinc-900)' }} />
                    </div>
                    <div>
                        <h1 className="text-headline text-3xl" style={{ color: 'var(--zinc-100)' }}>
                            eFiling Hub
                        </h1>
                    </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                    <p className="text-sm" style={{ color: 'var(--zinc-400)' }}>
                        Prepare and file your court documents electronically
                    </p>
                    {state && (
                        <span
                            className="text-xs font-medium px-2.5 py-0.5 rounded-full inline-flex items-center gap-1"
                            style={{
                                background: 'rgba(16, 185, 129, 0.1)',
                                border: '1px solid rgba(16, 185, 129, 0.2)',
                                color: 'var(--zinc-400)',
                            }}
                        >
                            <MapPin size={10} />
                            {locationLabel}
                        </span>
                    )}
                </div>
            </motion.div>

            {/* ─── No Location Set ─── */}
            {!hasCourtSettings && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="card-premium p-6 mb-8"
                >
                    <div className="flex items-start gap-4">
                        <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{
                                background: 'rgba(229, 168, 74, 0.12)',
                                border: '1px solid rgba(229, 168, 74, 0.3)',
                            }}
                        >
                            <MapPin size={20} style={{ color: 'var(--warning)' }} />
                        </div>
                        <div className="flex-1">
                            <p className="font-semibold text-sm mb-1" style={{ color: 'var(--zinc-900)' }}>
                                Set your court location first
                            </p>
                            <p className="text-xs mb-3" style={{ color: 'var(--zinc-700)' }}>
                                Configure your state and county in Court Settings to discover your local eFiling portal and filing resources.
                            </p>
                            <Link href="/court-settings" className="btn-primary text-xs inline-flex items-center gap-2 no-underline">
                                <Scale size={13} />
                                Court Settings
                            </Link>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ─── eFiling Portal Card ─── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
                className="mb-6"
            >
                {(isCacheLoading || isCacheMiss) ? (
                    /* Shimmer loading state — shown while cache query is in-flight OR while AI lookup is running */
                    <div className="card-premium p-8 animate-pulse">
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl" style={{ background: 'rgba(63, 63, 70, 0.08)' }} />
                            <div className="flex-1 space-y-3">
                                <div className="h-4 rounded-full w-1/3" style={{ background: 'rgba(63, 63, 70, 0.12)' }} />
                                <div className="h-3 rounded-full w-2/3" style={{ background: 'rgba(63, 63, 70, 0.08)' }} />
                            </div>
                        </div>
                    </div>
                ) : eFilingPortal && portalUrl ? (
                    /* eFiling portal found */
                    <div
                        className="rounded-2xl p-6 relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(135deg, rgba(90, 142, 201, 0.12), rgba(63, 63, 70, 0.05))',
                            border: '1px solid rgba(63, 63, 70, 0.2)',
                        }}
                    >
                        {/* Decorative gradient orb */}
                        <div
                            className="absolute -top-12 -right-12 w-40 h-40 rounded-full opacity-20 pointer-events-none"
                            style={{ background: 'radial-gradient(circle, var(--zinc-400), transparent)' }}
                        />
                        <div className="relative flex items-start gap-5">
                            <div
                                className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: 'linear-gradient(135deg, rgba(63, 63, 70, 0.15), rgba(16, 185, 129, 0.08))',
                                    border: '1px solid rgba(63, 63, 70, 0.25)',
                                }}
                            >
                                <FileArrowUp size={28} style={{ color: 'var(--zinc-400)' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h2 className="font-semibold text-lg mb-1" style={{ color: 'var(--zinc-100)' }}>
                                    {eFilingPortal.name}
                                </h2>
                                {eFilingPortal.provider && (
                                    <p className="text-xs mb-1.5" style={{ color: 'var(--zinc-400)' }}>
                                        Powered by {eFilingPortal.provider}
                                    </p>
                                )}
                                {eFilingPortal.description && (
                                    <p className="text-sm mb-4" style={{ color: 'var(--zinc-400)' }}>
                                        {eFilingPortal.description}
                                    </p>
                                )}
                                <a
                                    href={portalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold no-underline transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    style={{
                                        background: 'linear-gradient(135deg, var(--zinc-400), var(--zinc-400))',
                                        color: 'var(--zinc-900)',
                                        boxShadow: '0 4px 16px rgba(63, 63, 70, 0.25)',
                                    }}
                                >
                                    <ArrowSquareOut size={15} />
                                    Launch eFiling Portal
                                </a>
                            </div>
                        </div>
                    </div>
                ) : hasCourtSettings && cachedEntry && !eFilingPortal ? (
                    /* Lookup completed but no eFiling portal found — File in Person fallback */
                    <div
                        className="rounded-2xl p-6"
                        style={{
                            background: 'rgba(9, 9, 11, 0.3)',
                            border: '1px solid rgba(63, 63, 70, 0.1)',
                        }}
                    >
                        <div className="flex items-start gap-4">
                            <div
                                className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: 'rgba(229, 168, 74, 0.08)',
                                    border: '1px solid rgba(229, 168, 74, 0.2)',
                                }}
                            >
                                <Building size={24} style={{ color: 'var(--warning)' }} />
                            </div>
                            <div className="flex-1">
                                <h2 className="font-semibold text-base mb-1" style={{ color: 'var(--zinc-100)' }}>
                                    File in Person
                                </h2>
                                <p className="text-sm mb-3" style={{ color: 'var(--zinc-400)' }}>
                                    No eFiling portal was found for {locationLabel}. You can file your documents in person at the county clerk&apos;s office.
                                </p>
                                {cachedResources?.courtClerk && (
                                    <div
                                        className="rounded-xl px-4 py-3"
                                        style={{
                                            background: 'rgba(63, 63, 70, 0.04)',
                                            border: '1px solid rgba(63, 63, 70, 0.1)',
                                        }}
                                    >
                                        <p className="text-sm font-medium" style={{ color: 'var(--zinc-100)' }}>
                                            {cachedResources.courtClerk.name}
                                        </p>
                                        {cachedResources.courtClerk.phone && (
                                            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--info)' }}>
                                                <Phone size={10} />
                                                {cachedResources.courtClerk.phone}
                                            </p>
                                        )}
                                        {cachedResources.courtClerk.address && (
                                            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--zinc-400)' }}>
                                                <MapPin size={10} />
                                                {cachedResources.courtClerk.address}
                                            </p>
                                        )}
                                        {clerkUrl && (
                                            <a
                                                href={clerkUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs mt-2 inline-flex items-center gap-1 no-underline"
                                                style={{ color: 'var(--info)' }}
                                            >
                                                <ArrowSquareOut size={10} />
                                                Visit Website
                                            </a>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ) : null}
            </motion.div>

            {/* ─── Filing Readiness Checklist ─── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="mb-8"
            >
                <div className="flex items-center gap-2 mb-4">
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{
                            background: 'rgba(63, 63, 70, 0.06)',
                            border: '1px solid rgba(63, 63, 70, 0.12)',
                        }}
                    >
                        <Shield size={15} style={{ color: 'var(--zinc-400)' }} />
                    </div>
                    <h2
                        className="text-sm font-semibold tracking-[0.15em] uppercase"
                        style={{ color: 'var(--zinc-400)' }}
                    >
                        Filing Readiness
                    </h2>
                </div>
                <div className="space-y-2">
                    <ReadinessItem
                        label="Court settings configured"
                        isReady={hasCourtSettings}
                        href="/court-settings"
                        detail={hasCourtSettings ? `${locationLabel}` : 'Set your state and county'}
                    />
                    <ReadinessItem
                        label="Court name on file"
                        isReady={hasCourtName}
                        href="/court-settings"
                        detail={hasCourtName ? courtSettings?.courtName : 'Add your court name'}
                    />
                    <ReadinessItem
                        label="Cause number on file"
                        isReady={hasCauseNumber}
                        href="/court-settings"
                        detail={hasCauseNumber ? courtSettings?.causeNumber : 'Add your case/cause number'}
                    />
                    <ReadinessItem
                        label="At least one document marked as Final"
                        isReady={hasFinalDocs}
                        href="/docuvault"
                        detail={hasFinalDocs ? `${finalDocs.length} document${finalDocs.length !== 1 ? 's' : ''} ready` : 'Create and finalize a document'}
                    />
                </div>
            </motion.div>

            {/* ─── Documents Ready to File ─── */}
            {finalDocs.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25, duration: 0.5 }}
                    className="mb-8"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{
                                background: 'rgba(90, 142, 201, 0.08)',
                                border: '1px solid rgba(90, 142, 201, 0.15)',
                            }}
                        >
                            <FileText size={15} style={{ color: 'var(--info)' }} />
                        </div>
                        <h2
                            className="text-sm font-semibold tracking-[0.15em] uppercase"
                            style={{ color: 'var(--zinc-400)' }}
                        >
                            Documents Ready to File
                        </h2>
                        <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{
                                background: 'rgba(90, 142, 201, 0.1)',
                                color: 'var(--info)',
                            }}
                        >
                            {finalDocs.length}
                        </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {finalDocs.map((doc, i) => (
                            <motion.div
                                key={doc._id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.05 * i }}
                                className="card-premium p-4 group"
                            >
                                <div className="flex items-start gap-3">
                                    <div
                                        className="w-11 h-14 rounded-lg flex items-center justify-center flex-shrink-0"
                                        style={{
                                            background: 'rgba(90, 142, 201, 0.06)',
                                            border: '1px solid rgba(90, 142, 201, 0.12)',
                                        }}
                                    >
                                        <FileText size={18} style={{ color: 'var(--info)' }} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate mb-1" style={{ color: 'var(--zinc-100)' }}>
                                            {doc.templateTitle}
                                        </p>
                                        <div className="flex items-center gap-2 mb-2">
                                            <StatusPill status="final" />
                                            <span className="text-xs" style={{ color: 'var(--zinc-400)' }}>
                                                {doc.courtState} · {doc.courtCounty}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--info)' }}>
                                            <Clock size={10} />
                                            {formatDate(doc.createdAt)}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mt-3 pt-3" style={{ borderTop: '1px solid rgba(63, 63, 70, 0.06)' }}>
                                    {doc.storageId && (
                                        <button
                                            className="flex-1 text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all hover:opacity-80"
                                            style={{
                                                background: 'rgba(63, 63, 70, 0.06)',
                                                border: '1px solid rgba(63, 63, 70, 0.12)',
                                                color: 'var(--zinc-400)',
                                            }}
                                            onClick={() => {
                                                // Download PDF via Convex storage URL
                                                window.open(`${process.env.NEXT_PUBLIC_CONVEX_URL?.replace('.cloud', '.site')}/api/storage/${doc.storageId}`, '_blank');
                                            }}
                                        >
                                            <Download size={12} />
                                            Download PDF
                                        </button>
                                    )}
                                    <button
                                        className="flex-1 text-xs font-medium py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                        style={{
                                            background: 'linear-gradient(135deg, rgba(74, 163, 100, 0.15), rgba(74, 163, 100, 0.08))',
                                            border: '1px solid rgba(74, 163, 100, 0.25)',
                                            color: '#4AA364',
                                        }}
                                        onClick={() => handleMarkAsFiled(doc._id)}
                                        disabled={filingId === doc._id}
                                    >
                                        <CheckCircle size={12} />
                                        {filingId === doc._id ? 'Marking…' : 'Mark as Filed'}
                                    </button>
                                    {/* Inline error for this card */}
                                    {filingError && (
                                        <motion.p
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="text-xs mt-1.5 flex items-center gap-1 col-span-full"
                                            style={{ color: '#DC2626' }}
                                        >
                                            <Warning size={10} />
                                            {filingError}
                                        </motion.p>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ─── Recently Filed ─── */}
            {filedDocs.length > 0 && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="mb-8"
                >
                    <div className="flex items-center gap-2 mb-4">
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{
                                background: 'rgba(74, 163, 100, 0.06)',
                                border: '1px solid rgba(74, 163, 100, 0.12)',
                            }}
                        >
                            <CheckCircle size={15} style={{ color: '#4AA364' }} />
                        </div>
                        <h2
                            className="text-sm font-semibold tracking-[0.15em] uppercase"
                            style={{ color: '#4AA364' }}
                        >
                            Recently Filed
                        </h2>
                    </div>
                    <div className="space-y-2">
                        {filedDocs.map((doc) => (
                            <div
                                key={doc._id}
                                className="card-premium p-4 flex items-center gap-3"
                            >
                                <div
                                    className="w-10 h-12 rounded-lg flex items-center justify-center flex-shrink-0"
                                    style={{
                                        background: 'rgba(74, 163, 100, 0.06)',
                                        border: '1px solid rgba(74, 163, 100, 0.12)',
                                    }}
                                >
                                    <FileText size={16} style={{ color: '#4AA364' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate" style={{ color: 'var(--zinc-100)' }}>
                                        {doc.templateTitle}
                                    </p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <StatusPill status="filed" />
                                        <span className="text-xs" style={{ color: 'var(--zinc-400)' }}>
                                            {formatDate(doc.updatedAt)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </motion.div>
            )}

            {/* ─── Filing Guide ─── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.5 }}
                className="mb-8"
            >
                <div className="flex items-center gap-2 mb-4">
                    <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{
                            background: 'rgba(63, 63, 70, 0.06)',
                            border: '1px solid rgba(63, 63, 70, 0.12)',
                        }}
                    >
                        <Info size={15} style={{ color: 'var(--zinc-400)' }} />
                    </div>
                    <h2
                        className="text-sm font-semibold tracking-[0.15em] uppercase"
                        style={{ color: 'var(--zinc-400)' }}
                    >
                        Filing Guide
                    </h2>
                </div>
                <div className="space-y-2">
                    <CollapsibleSection title="What is eFiling?" defaultOpen>
                        <p className="mb-2">
                            eFiling (electronic filing) allows you to submit court documents online instead of
                            filing them in person at the courthouse. Most Texas counties use <strong style={{ color: 'var(--zinc-100)' }}>eFileTexas.gov</strong>,
                            while other states may use systems like TurboCourt, File &amp; ServeXpress, or Odyssey.
                        </p>
                        <p>
                            Benefits include 24/7 availability, instant confirmation receipts, reduced trips to the
                            courthouse, and faster document processing.
                        </p>
                    </CollapsibleSection>

                    <CollapsibleSection title={`How to file in ${state || 'your state'}`}>
                        <ol className="space-y-2 pl-4 list-decimal">
                            <li>Create your court document using the <Link href="/docuvault" className="no-underline" style={{ color: 'var(--info)' }}>Template Gallery</Link></li>
                            <li>Review the document and mark it as <strong style={{ color: 'var(--zinc-100)' }}>Final</strong></li>
                            <li>Download the PDF from this page</li>
                            <li>Open the eFiling portal and create an account (if you haven&apos;t already)</li>
                            <li>Upload your PDF and follow the portal&apos;s filing instructions</li>
                            <li>Pay any required filing fees</li>
                            <li>Save your confirmation receipt</li>
                            <li>Return here and click <strong style={{ color: '#4AA364' }}>Mark as Filed</strong></li>
                        </ol>
                    </CollapsibleSection>

                    <CollapsibleSection title="Common filing fees">
                        <div className="flex items-start gap-2 mb-2">
                            <Warning size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
                            <p>
                                Filing fees vary by court, case type, and state. Common fees include:
                            </p>
                        </div>
                        <ul className="space-y-1 pl-4 list-disc">
                            <li>Initial petition filing: $250–$350</li>
                            <li>Response/answer: $200–$300</li>
                            <li>Motions: $15–$50 each</li>
                            <li>Fee waivers may be available for low-income filers</li>
                        </ul>
                        <p className="mt-2 text-xs" style={{ color: 'var(--zinc-400)' }}>
                            Contact your local clerk&apos;s office for exact fee amounts. NEXX does not collect or process filing fees.
                        </p>
                    </CollapsibleSection>

                    <CollapsibleSection title="What to expect after filing">
                        <ul className="space-y-1 pl-4 list-disc">
                            <li>You&apos;ll receive an electronic confirmation with a timestamp</li>
                            <li>The clerk&apos;s office reviews your filing (usually within 1–3 business days)</li>
                            <li>If accepted, you&apos;ll get a file-stamped copy of your document</li>
                            <li>If rejected, you&apos;ll receive a notice explaining why — you can correct and refile</li>
                            <li>Keep all confirmation receipts in your records</li>
                        </ul>
                    </CollapsibleSection>
                </div>
            </motion.div>

            {/* ─── Quick Links ─── */}
            {(clerkUrl || caseSearchUrl || localRulesUrl) && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                >
                    <div className="flex items-center gap-2 mb-4">
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{
                                background: 'rgba(16, 185, 129, 0.06)',
                                border: '1px solid rgba(16, 185, 129, 0.12)',
                            }}
                        >
                            <BookOpen size={15} style={{ color: 'var(--zinc-400)' }} />
                        </div>
                        <h2
                            className="text-sm font-semibold tracking-[0.15em] uppercase"
                            style={{ color: 'var(--zinc-400)' }}
                        >
                            Quick Links
                        </h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {clerkUrl && (
                            <a
                                href={clerkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="no-underline"
                            >
                                <motion.div
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    className="card-premium p-4 cursor-pointer group h-full"
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                            style={{
                                                background: 'rgba(16, 185, 129, 0.1)',
                                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                            }}
                                        >
                                            <Bank size={16} style={{ color: 'var(--zinc-400)' }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--zinc-900)' }}>
                                                Court Clerk
                                            </p>
                                            <p className="text-xs truncate" style={{ color: 'var(--zinc-700)' }}>
                                                {cachedResources?.courtClerk?.name || 'County Clerk Office'}
                                            </p>
                                        </div>
                                        <ArrowSquareOut
                                            size={13}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                            style={{ color: 'var(--zinc-400)' }}
                                        />
                                    </div>
                                </motion.div>
                            </a>
                        )}
                        {caseSearchUrl && (
                            <a
                                href={caseSearchUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="no-underline"
                            >
                                <motion.div
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    className="card-premium p-4 cursor-pointer group h-full"
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                            style={{
                                                background: 'rgba(16, 185, 129, 0.1)',
                                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                            }}
                                        >
                                            <MagnifyingGlass size={16} style={{ color: 'var(--zinc-400)' }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--zinc-900)' }}>
                                                Case Search
                                            </p>
                                            <p className="text-xs truncate" style={{ color: 'var(--zinc-700)' }}>
                                                {cachedResources?.caseSearch?.name || 'Public Records Search'}
                                            </p>
                                        </div>
                                        <ArrowSquareOut
                                            size={13}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                            style={{ color: 'var(--zinc-400)' }}
                                        />
                                    </div>
                                </motion.div>
                            </a>
                        )}
                        {localRulesUrl && (
                            <a
                                href={localRulesUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="no-underline"
                            >
                                <motion.div
                                    whileHover={{ scale: 1.02, y: -2 }}
                                    className="card-premium p-4 cursor-pointer group h-full"
                                >
                                    <div className="flex items-center gap-3">
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                            style={{
                                                background: 'rgba(16, 185, 129, 0.1)',
                                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                            }}
                                        >
                                            <BookOpen size={16} style={{ color: 'var(--zinc-400)' }} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--zinc-900)' }}>
                                                Local Rules
                                            </p>
                                            <p className="text-xs truncate" style={{ color: 'var(--zinc-700)' }}>
                                                {cachedResources?.localRules?.name || 'Court Rules & Procedures'}
                                            </p>
                                        </div>
                                        <ArrowSquareOut
                                            size={13}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                            style={{ color: 'var(--zinc-400)' }}
                                        />
                                    </div>
                                </motion.div>
                            </a>
                        )}
                    </div>
                </motion.div>
            )}
        </div>
    );
}
