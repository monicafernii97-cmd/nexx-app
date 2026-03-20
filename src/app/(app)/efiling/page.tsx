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
    DownloadSimple,
    ArrowRight,
    CaretDown,
    Warning,
    Bank,
    MagnifyingGlass,
    BookOpen,
    FileText,
    Scales,
    ShieldCheck,
    Clock,
    Buildings,
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
        draft: { label: 'Draft', bg: 'var(--champagne)', border: 'var(--champagne)', color: 'white' },
        final: { label: 'Final', bg: 'var(--sapphire-base)', border: 'var(--sapphire-base)', color: 'white' },
        filed: { label: 'Filed', bg: 'var(--success)', border: 'var(--success)', color: 'white' },
    }[status];

    return (
        <span
            className="text-xs font-medium px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 shadow-sm"
            style={{ background: config.bg, border: `1px solid ${config.border}`, color: config.color }}
        >
            {status === 'filed' && <CheckCircle size={12} weight="fill" />}
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
            className="rounded-2xl overflow-hidden bg-[rgba(255,255,255,0.05)] backdrop-blur-md border border-[rgba(255,255,255,0.15)] shadow-sm transition-all duration-300"
        >
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-6 py-4 cursor-pointer text-left focus:outline-none hover:bg-white/5 transition-colors"
                aria-expanded={isOpen}
            >
                <span className="text-sm font-bold text-white tracking-wide">{title}</span>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <CaretDown size={16} className="text-white" weight="bold" />
                </motion.div>
            </button>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden bg-[rgba(0,0,0,0.2)]"
                    >
                        <div className="px-6 pb-5 text-[15px] leading-relaxed text-white font-medium m-0">
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
            className={`flex items-center gap-4 px-5 py-4 rounded-xl transition-all duration-300 ${href && !isReady ? 'cursor-pointer hover:shadow-md hover:bg-white/10' : 'shadow-sm'} bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.15)] backdrop-blur-md`}
        >
            {isReady ? (
                <div className="bg-[var(--success)]/20 p-2 rounded-full border border-[var(--success)]/30">
                    <CheckCircle size={20} className="text-[var(--success)] drop-shadow-sm" weight="fill" />
                </div>
            ) : (
                <div className="bg-[#B38644]/20 p-2 rounded-full border border-[#B38644]/30">
                    <Circle size={20} className="text-[#E5A84A] drop-shadow-sm" weight="fill" />
                </div>
            )}
            <div className="flex-1 min-w-0">
                <p className={`text-[15px] tracking-wide font-bold text-white m-0`}>
                    {label}
                </p>
                {detail && (
                    <p className="text-sm mt-1 text-white font-medium m-0">
                        {detail}
                    </p>
                )}
            </div>
            {href && !isReady && (
                <ArrowRight
                    size={16}
                    className="text-[var(--sapphire-base)] transition-transform group-hover:translate-x-1"
                    weight="bold"
                />
            )}
        </div>
    );

    return href && !isReady ? (
        <Link href={href} className="no-underline block group">
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
        <div className="max-w-5xl mx-auto pb-16 space-y-12">
            {/* ─── Header ─── */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
            >
                <div className="flex items-center gap-4 mb-3">
                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[linear-gradient(135deg,#2E5C9A,#123D7E)] border border-[rgba(255,255,255,0.3)] shadow-[0_8px_30px_rgba(46,92,154,0.5)] relative overflow-hidden">
                        <div className="absolute inset-0 bg-white/10" />
                        <FileArrowUp size={28} className="text-white relative z-10 drop-shadow-md" weight="fill" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-serif font-bold text-white tracking-tight m-0">
                            eFiling Hub
                        </h1>
                    </div>
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-3 mt-4">
                    <p className="text-base font-medium text-white tracking-wide leading-relaxed">
                        Prepare and file your court documents electronically
                    </p>
                    {state && (
                        <span className="text-xs font-medium px-3 py-1 rounded-full bg-white/60 border border-[var(--cloud-light)] text-[var(--sapphire-base)] backdrop-blur-sm shadow-sm flex items-center gap-1.5">
                            <MapPin size={12} weight="fill" />
                            {locationLabel}
                        </span>
                    )}
                </div>
            </motion.div>

            {/* ─── No Location Set ─── */}
            {!hasCourtSettings && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="p-8 border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.05)] backdrop-blur-xl rounded-3xl"
                >
                    <div className="flex items-start gap-5">
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-[linear-gradient(135deg,#B38644,#E5A84A)] text-white shadow-[0_4px_15px_rgba(229,168,74,0.3)] shrink-0">
                            <MapPin size={28} weight="fill" className="drop-shadow-md" />
                        </div>
                        <div className="flex-1 space-y-3">
                            <p className="text-lg font-bold tracking-wide text-white m-0">
                                Set your court location first
                            </p>
                            <p className="text-[15px] text-white leading-relaxed max-w-2xl font-medium m-0">
                                Configure your state and county in Court Settings to discover your local eFiling portal and filing resources.
                            </p>
                            <Link href="/court-settings" className="btn-primary text-[13px] font-bold tracking-widest uppercase inline-flex items-center gap-2 mt-2 px-6 py-3 shadow-md">
                                <Scales size={16} weight="bold" />
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
                transition={{ delay: 0.15, duration: 0.5 }}
            >
                {(isCacheLoading || isCacheMiss) ? (
                    <div className="card-premium p-8 animate-pulse border border-[var(--cloud-light)]">
                        <div className="flex items-center gap-5">
                            <div className="w-20 h-20 rounded-2xl bg-[var(--sapphire-light)]/10" />
                            <div className="flex-1 space-y-4">
                                <div className="h-5 rounded-full w-1/3 bg-[var(--sapphire-light)]/20" />
                                <div className="h-4 rounded-full w-2/3 bg-[var(--sapphire-light)]/10" />
                            </div>
                        </div>
                    </div>
                ) : eFilingPortal && portalUrl ? (
                    <div className="relative overflow-hidden rounded-3xl p-8 bg-gradient-to-br from-white/90 to-[var(--pearl)] border border-[var(--cloud-light)] shadow-[0_8px_32px_-8px_rgba(10,30,84,0.08)] backdrop-blur-xl group hover:shadow-[0_12px_48px_-12px_rgba(10,30,84,0.12)] transition-all duration-500">
                        {/* Decorative background elements */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-[var(--champagne)]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 w-48 h-48 bg-[var(--sapphire-light)]/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 pointer-events-none" />
                        
                        <div className="relative z-10 flex items-start sm:items-center gap-6 flex-col sm:flex-row">
                            <div className="w-20 h-20 rounded-2xl flex items-center justify-center bg-white shadow-md border border-[var(--cloud-light)] shrink-0">
                                <FileArrowUp size={36} className="text-[var(--sapphire-base)]" weight="duotone" />
                            </div>
                            <div className="flex-1 space-y-2">
                                <h2 className="text-xl font-semibold tracking-tight text-[var(--sapphire-dark)]">
                                    {eFilingPortal.name}
                                </h2>
                                {eFilingPortal.provider && (
                                    <p className="text-xs uppercase tracking-widest font-medium text-[var(--sapphire-light)]">
                                        Powered by {eFilingPortal.provider}
                                    </p>
                                )}
                                {eFilingPortal.description && (
                                    <p className="text-sm text-[var(--sapphire-base)] leading-relaxed max-w-2xl pt-1">
                                        {eFilingPortal.description}
                                    </p>
                                )}
                            </div>
                            <div className="shrink-0 pt-4 sm:pt-0">
                                <a
                                    href={portalUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-primary px-8 py-3.5 flex items-center gap-2 group/btn shadow-md hover:shadow-lg"
                                >
                                    Launch Portal
                                    <ArrowSquareOut size={18} weight="bold" className="transition-transform group-hover/btn:-translate-y-0.5 group-hover/btn:translate-x-0.5" />
                                </a>
                            </div>
                        </div>
                    </div>
                ) : hasCourtSettings && cachedEntry && !eFilingPortal ? (
                    <div className="card-premium p-8 border border-[var(--cloud-light)] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--champagne)]/5 rounded-full blur-2xl pointer-events-none" />
                        <div className="flex flex-col md:flex-row items-start gap-8 relative z-10">
                            <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br from-white to-[var(--pearl)] shadow-sm border border-[var(--cloud-light)] shrink-0">
                                <Buildings size={32} className="text-[var(--champagne)]" weight="duotone" />
                            </div>
                            <div className="flex-1 space-y-3">
                                <h2 className="text-lg font-medium tracking-wide text-[var(--sapphire-dark)]">
                                    File in Person
                                </h2>
                                <p className="text-sm text-[var(--sapphire-base)] max-w-2xl leading-relaxed">
                                    No eFiling portal was found for <span className="font-semibold">{locationLabel}</span>. You can file your documents in person at the county clerk&apos;s office.
                                </p>
                            </div>
                            
                            {cachedResources?.courtClerk && (
                                <div className="w-full md:w-80 bg-white/60 p-5 rounded-2xl border border-[var(--cloud-light)] backdrop-blur-sm shadow-sm space-y-3">
                                    <p className="text-sm font-semibold tracking-wide text-[var(--sapphire-dark)]">
                                        {cachedResources.courtClerk.name}
                                    </p>
                                    <div className="space-y-2">
                                        {cachedResources.courtClerk.phone && (
                                            <p className="text-xs flex items-center gap-2 text-[var(--sapphire-base)] font-medium">
                                                <div className="bg-[var(--sapphire-light)]/10 p-1 rounded-md">
                                                    <Phone size={12} weight="fill" className="text-[var(--sapphire-base)]" />
                                                </div>
                                                {cachedResources.courtClerk.phone}
                                            </p>
                                        )}
                                        {cachedResources.courtClerk.address && (
                                            <p className="text-xs flex items-start gap-2 text-[var(--sapphire-base)] font-medium">
                                                <div className="bg-[var(--sapphire-light)]/10 p-1 rounded-md mt-0.5 shrink-0">
                                                    <MapPin size={12} weight="fill" className="text-[var(--sapphire-base)]" />
                                                </div>
                                                <span className="leading-snug">{cachedResources.courtClerk.address}</span>
                                            </p>
                                        )}
                                    </div>
                                    {clerkUrl && (
                                        <a
                                            href={clerkUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-4 text-xs font-semibold text-[var(--sapphire-base)] hover:text-[var(--sapphire-dark)] transition-colors inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--cloud-light)] bg-white/50 hover:bg-white w-full justify-center"
                                        >
                                            <ArrowSquareOut size={14} weight="bold" />
                                            Visit Website
                                        </a>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* ─── Left Column (Main Content) ─── */}
                <div className="lg:col-span-8 space-y-8">
                    {/* ─── Filing Readiness Checklist ─── */}
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                    >
                        <div className="flex items-center gap-4 mb-5">
                            <div className="w-12 h-12 rounded-2xl bg-[linear-gradient(135deg,#2E5C9A,#123D7E)] border border-[rgba(255,255,255,0.3)] shadow-[0_8px_30px_rgba(46,92,154,0.5)] flex items-center justify-center relative overflow-hidden shrink-0">
                                <div className="absolute inset-0 bg-white/10" />
                                <ShieldCheck size={24} className="text-white relative z-10 drop-shadow-md" weight="fill" />
                            </div>
                            <h2 className="text-lg font-bold tracking-widest uppercase text-white m-0">
                                Filing Readiness
                            </h2>
                        </div>
                        <div className="space-y-3">
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
                        >
                            <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-[linear-gradient(135deg,#2E5C9A,#123D7E)] border border-[rgba(255,255,255,0.3)] shadow-[0_8px_30px_rgba(46,92,154,0.5)] flex items-center justify-center relative overflow-hidden shrink-0">
                                        <div className="absolute inset-0 bg-white/10" />
                                        <FileText size={24} className="text-white relative z-10 drop-shadow-md" weight="fill" />
                                    </div>
                                    <h2 className="text-lg font-bold tracking-widest uppercase text-white m-0">
                                        Ready to File
                                    </h2>
                                </div>
                                <span className="text-[13px] font-bold px-4 py-1.5 rounded-full bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.2)] text-white shadow-sm backdrop-blur-md">
                                    {finalDocs.length} Items
                                </span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {finalDocs.map((doc, i) => (
                                    <motion.div
                                        key={doc._id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 0.05 * i }}
                                        className="p-5 group hover:shadow-[0_8px_25px_rgba(0,0,0,0.3)] transition-all border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.05)] backdrop-blur-xl rounded-2xl hover:-translate-y-1"
                                    >
                                        <div className="flex items-start gap-4 mb-4">
                                            <div className="w-12 h-14 rounded-xl flex items-center justify-center bg-[linear-gradient(135deg,#2E5C9A,#123D7E)] shadow-[0_4px_15px_rgba(46,92,154,0.4)] border border-[rgba(255,255,255,0.3)] shrink-0 relative overflow-hidden">
                                                <div className="absolute inset-0 bg-white/10" />
                                                <FileText size={22} className="text-white relative z-10 drop-shadow-md" weight="fill" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[15px] font-bold text-white truncate mb-1">
                                                    {doc.templateTitle}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-2 mb-2">
                                                    <StatusPill status="final" />
                                                    <span className="text-[12px] font-bold text-white">
                                                        {doc.courtState} · {doc.courtCounty}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-[12px] font-bold text-white">
                                                    <Clock size={12} weight="bold" />
                                                    {formatDate(doc.createdAt)}
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-2 pt-4 border-t border-[rgba(255,255,255,0.15)]">
                                            {doc.storageId && (
                                                <button
                                                    className="btn-outline text-xs py-2.5 flex justify-center items-center gap-2"
                                                    onClick={() => {
                                                        window.open(`${process.env.NEXT_PUBLIC_CONVEX_URL?.replace('.cloud', '.site')}/api/storage/${doc.storageId}`, '_blank');
                                                    }}
                                                >
                                                    <DownloadSimple size={14} weight="bold" />
                                                    PDF
                                                </button>
                                            )}
                                            <button
                                                className="btn-primary text-xs py-2.5 flex justify-center items-center gap-2 shadow-sm disabled:opacity-50"
                                                onClick={() => handleMarkAsFiled(doc._id)}
                                                disabled={filingId === doc._id}
                                            >
                                                <CheckCircle size={14} weight="bold" />
                                                {filingId === doc._id ? 'Saving…' : 'Mark Filed'}
                                            </button>
                                            {filingError && (
                                                <motion.p
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    className="col-span-2 text-xs flex items-center gap-1 text-[var(--error)] bg-[var(--error)]/10 px-3 py-2 rounded-lg mt-1"
                                                >
                                                    <Warning size={14} weight="bold" />
                                                    {filingError}
                                                </motion.p>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* ─── Right Column (Sidebar) ─── */}
                <div className="lg:col-span-4 space-y-8">
                    {/* ─── Filing Guide ─── */}
                    <motion.div
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                    >
                        <div className="flex items-center gap-4 mb-5">
                            <div className="w-12 h-12 rounded-2xl bg-[linear-gradient(135deg,#2E5C9A,#123D7E)] border border-[rgba(255,255,255,0.3)] shadow-[0_8px_30px_rgba(46,92,154,0.5)] flex items-center justify-center relative overflow-hidden shrink-0">
                                <div className="absolute inset-0 bg-white/10" />
                                <Info size={24} className="text-white relative z-10 drop-shadow-md" weight="fill" />
                            </div>
                            <h2 className="text-lg font-bold tracking-widest uppercase text-white m-0">
                                Filing Guide
                            </h2>
                        </div>
                        <div className="space-y-3">
                            <CollapsibleSection title="What is eFiling?" defaultOpen>
                                <p className="mb-3">
                                    eFiling allows you to submit court documents securely online instead of
                                    filing in person. Most Texas counties use <strong className="text-[var(--sapphire-dark)]">eFileTexas.gov</strong>.
                                </p>
                                <p>
                                    Enjoy 24/7 availability, instant confirmation receipts, and faster document processing directly from your home.
                                </p>
                            </CollapsibleSection>

                            <CollapsibleSection title={`How to file in ${state || 'your state'}`}>
                                <ul className="space-y-3">
                                    <li className="flex gap-3"><span className="font-bold text-[var(--champagne)]">1.</span> <span>Create formatting-compliant docs using <Link href="/docuvault" className="font-semibold text-[var(--sapphire-base)] hover:underline">DocuVault</Link>.</span></li>
                                    <li className="flex gap-3"><span className="font-bold text-[var(--champagne)]">2.</span> <span>Mark the document as <strong className="text-[var(--sapphire-dark)]">Final</strong>.</span></li>
                                    <li className="flex gap-3"><span className="font-bold text-[var(--champagne)]">3.</span> <span>Download your generated PDF.</span></li>
                                    <li className="flex gap-3"><span className="font-bold text-[var(--champagne)]">4.</span> <span>Upload it to your local eFiling portal and pay any court fees.</span></li>
                                    <li className="flex gap-3"><span className="font-bold text-[var(--champagne)]">5.</span> <span>Return here and mark it <strong className="text-[var(--success)]">Filed</strong> to track completion.</span></li>
                                </ul>
                            </CollapsibleSection>

                            <CollapsibleSection title="Common filing fees">
                                <div className="flex items-start gap-3 mb-3 bg-[var(--champagne)]/10 p-4 rounded-xl text-[var(--sapphire-dark)]">
                                    <Warning size={18} className="shrink-0 text-[var(--champagne)]" weight="duotone" />
                                    <p className="font-medium text-sm">
                                        Filing fees vary by court and case type. Check locally.
                                    </p>
                                </div>
                                <ul className="space-y-2 list-disc pl-5">
                                    <li>Initial petition: $250–$350</li>
                                    <li>Response/answer: $200–$300</li>
                                    <li>Motions: $15–$50 each</li>
                                    <li className="text-[var(--sapphire-light)] italic">Fee waivers may be available</li>
                                </ul>
                            </CollapsibleSection>
                        </div>
                    </motion.div>

                    {/* ─── Recently Filed ─── */}
                    {filedDocs.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.35, duration: 0.5 }}
                        >
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-10 h-10 rounded-xl bg-[var(--success)]/10 text-[var(--success)] shadow-sm border border-[var(--success)]/20 flex items-center justify-center">
                                    <CheckCircle size={20} weight="fill" />
                                </div>
                                <h2 className="text-base font-semibold tracking-widest uppercase text-[var(--success)]">
                                    Recently Filed
                                </h2>
                            </div>
                            <div className="space-y-3">
                                {filedDocs.map((doc) => (
                                    <div
                                        key={doc._id}
                                        className="card-premium p-4 flex items-center gap-4 bg-white/60 border border-[var(--cloud-light)] shadow-sm"
                                    >
                                        <div className="w-10 h-10 rounded-xl bg-[var(--success)]/10 text-[var(--success)] flex items-center justify-center shrink-0 border border-[var(--success)]/20">
                                            <FileText size={18} weight="duotone" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold truncate text-[var(--sapphire-dark)] mb-1">
                                                {doc.templateTitle}
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <StatusPill status="filed" />
                                                <span className="text-[11px] font-medium text-[var(--sapphire-light)]">
                                                    {formatDate(doc.updatedAt)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </motion.div>
                    )}

                    {/* ─── Quick Links ─── */}
                    {(clerkUrl || caseSearchUrl || localRulesUrl) && (
                        <motion.div
                            initial={{ opacity: 0, x: 12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.4, duration: 0.5 }}
                        >
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-10 h-10 rounded-xl bg-white shadow-sm border border-[var(--cloud-light)] flex items-center justify-center">
                                    <BookOpen size={20} className="text-[var(--sapphire-base)]" weight="duotone" />
                                </div>
                                <h2 className="text-base font-semibold tracking-widest uppercase text-[var(--sapphire-dark)]">
                                    Court Resources
                                </h2>
                            </div>
                            <div className="space-y-3">
                                {clerkUrl && (
                                    <a href={clerkUrl} target="_blank" rel="noopener noreferrer" className="block group">
                                        <div className="card-premium p-4 flex items-center gap-4 hover:shadow-md transition-all border border-[var(--cloud-light)]">
                                            <div className="w-10 h-10 rounded-xl bg-[var(--sapphire-light)]/10 flex items-center justify-center text-[var(--sapphire-base)] shrink-0 group-hover:bg-[var(--sapphire-base)] group-hover:text-white transition-colors">
                                                <Bank size={18} weight="duotone" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold truncate text-[var(--sapphire-dark)]">Court Clerk</p>
                                                <p className="text-xs truncate text-[var(--sapphire-light)]">{cachedResources?.courtClerk?.name || 'County Clerk Office'}</p>
                                            </div>
                                            <ArrowSquareOut size={16} className="text-[var(--sapphire-light)] group-hover:text-[var(--sapphire-base)] transition-colors shrink-0" weight="bold" />
                                        </div>
                                    </a>
                                )}
                                {caseSearchUrl && (
                                    <a href={caseSearchUrl} target="_blank" rel="noopener noreferrer" className="block group">
                                        <div className="card-premium p-4 flex items-center gap-4 hover:shadow-md transition-all border border-[var(--cloud-light)]">
                                            <div className="w-10 h-10 rounded-xl bg-[var(--sapphire-light)]/10 flex items-center justify-center text-[var(--sapphire-base)] shrink-0 group-hover:bg-[var(--sapphire-base)] group-hover:text-white transition-colors">
                                                <MagnifyingGlass size={18} weight="bold" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold truncate text-[var(--sapphire-dark)]">Case Search</p>
                                                <p className="text-xs truncate text-[var(--sapphire-light)]">{cachedResources?.caseSearch?.name || 'Public Records Search'}</p>
                                            </div>
                                            <ArrowSquareOut size={16} className="text-[var(--sapphire-light)] group-hover:text-[var(--sapphire-base)] transition-colors shrink-0" weight="bold" />
                                        </div>
                                    </a>
                                )}
                                {localRulesUrl && (
                                    <a href={localRulesUrl} target="_blank" rel="noopener noreferrer" className="block group">
                                        <div className="card-premium p-4 flex items-center gap-4 hover:shadow-md transition-all border border-[var(--cloud-light)]">
                                            <div className="w-10 h-10 rounded-xl bg-[var(--sapphire-light)]/10 flex items-center justify-center text-[var(--sapphire-base)] shrink-0 group-hover:bg-[var(--sapphire-base)] group-hover:text-white transition-colors">
                                                <BookOpen size={18} weight="duotone" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold truncate text-[var(--sapphire-dark)]">Local Rules</p>
                                                <p className="text-xs truncate text-[var(--sapphire-light)]">{cachedResources?.localRules?.name || 'Rules & Procedures'}</p>
                                            </div>
                                            <ArrowSquareOut size={16} className="text-[var(--sapphire-light)] group-hover:text-[var(--sapphire-base)] transition-colors shrink-0" weight="bold" />
                                        </div>
                                    </a>
                                )}
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        </div>
    );
}
