'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useUser } from '@/lib/user-context';
import { titleCase } from '@/lib/utils/stringHelpers';
import {
    BookOpen,
    Scale,
    Heart,
    Landmark,
    HandHelping,
    Users,
    Phone,
    ExternalLink,
    MapPin,
    ArrowRight,
    Shield,
    Search,
    AlertTriangle,
    Settings,
    Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import {
    getStateResources,
    getCountyResources,
    isStateCurated,
    NATIONAL_ATTORNEY_DIRECTORIES,
    NATIONAL_THERAPIST_DIRECTORIES,
    CRISIS_RESOURCES,
    type ResourceEntry,
    type CountyResources,
    type StateResources,
} from '@/lib/data/resourcesData';

// ═══════════════════════════════════════════
//  Types
// ═══════════════════════════════════════════

/** Shape of a single AI-cached resource (court clerk, family division, etc.) */
interface CachedResource {
    name: string;
    description?: string;
    url?: string;
    phone?: string;
    address?: string;
}

/** Shape of the full cached resources object from Convex. */
interface CachedResources {
    courtClerk?: CachedResource;
    courtsWebsite?: CachedResource;
    familyDivision?: CachedResource;
    localRules?: CachedResource;
    stateFamilyCode?: CachedResource;
    legalAid?: CachedResource[];
    nonprofits?: CachedResource[];
    caseSearch?: CachedResource;
}

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

/** Stable unique key for a ResourceEntry to prevent React key collisions. */
function resourceKey(r: ResourceEntry): string {
    return [r.name, r.url ?? '', r.phone ?? '', r.address ?? ''].join('|');
}



/** True if the string looks like a dialable phone number (digits, spaces, dashes, parens). */
function isDialable(phone: string): boolean {
    return /^\+?[\d\s\-()]+$/.test(phone) && /\d/.test(phone);
}

/** Convert a CachedResource to a ResourceEntry for unified rendering. */
function toResourceEntry(r: CachedResource, tags: string[]): ResourceEntry {
    return {
        name: r.name,
        description: r.description,
        url: r.url,
        phone: r.phone,
        address: r.address,
        tags,
    };
}

// ═══════════════════════════════════════════
//  Sub-components
// ═══════════════════════════════════════════

/** A single clickable resource card with name, description, phone, and link. */
function ResourceCard({ resource }: { resource: ResourceEntry }) {
    const safeUrl = toSafeExternalUrl(resource.url);
    return (
        <motion.div
            whileHover={{ scale: 1.01, y: -1 }}
            className="card-premium p-4 group"
        >
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-sm truncate" style={{ color: '#0A1E54' }}>
                            {resource.name}
                        </p>
                    </div>
                    {resource.description && (
                        <p className="text-xs mb-2 line-clamp-2" style={{ color: '#123D7E' }}>
                            {resource.description}
                        </p>
                    )}
                    <div className="flex flex-wrap items-center gap-3">
                        {resource.phone && (
                            isDialable(resource.phone) ? (
                                <a
                                    href={`tel:${resource.phone.replace(/[^\d+]/g, '')}`}
                                    className="flex items-center gap-1 text-xs font-medium no-underline transition-colors hover:opacity-80"
                                    style={{ color: '#5A8EC9' }}
                                >
                                    <Phone size={11} />
                                    {resource.phone}
                                </a>
                            ) : (
                                <span
                                    className="flex items-center gap-1 text-xs font-medium"
                                    style={{ color: '#5A8EC9' }}
                                >
                                    <Phone size={11} />
                                    {resource.phone}
                                </span>
                            )
                        )}
                        {safeUrl && (
                            <a
                                href={safeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs font-medium no-underline transition-colors hover:opacity-80"
                                style={{ color: '#5A9E6F' }}
                            >
                                <ExternalLink size={11} />
                                Visit Website
                            </a>
                        )}
                    </div>
                    {resource.address && (
                        <p className="flex items-center gap-1 text-xs mt-1.5" style={{ color: '#7096D1' }}>
                            <MapPin size={10} />
                            {resource.address}
                        </p>
                    )}
                </div>
                {safeUrl && (
                    <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 rounded transition-opacity"
                        aria-label={`Open ${resource.name} website`}
                    >
                        <ArrowRight size={14} style={{ color: '#0A1E54' }} />
                    </a>
                )}
            </div>
        </motion.div>
    );
}

/** Section header with icon, label, and optional subtitle. */
function SectionHeader({
    icon: Icon,
    label,
    subtitle,
    color = '#D0E3FF',
}: {
    icon: typeof BookOpen;
    label: string;
    subtitle?: string;
    color?: string;
}) {
    return (
        <div className="mb-4">
            <div className="flex items-center gap-2 mb-1">
                <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{
                        background: `${color}15`,
                        border: `1px solid ${color}30`,
                    }}
                >
                    <Icon size={15} style={{ color }} />
                </div>
                <h2
                    className="text-sm font-semibold tracking-[0.15em] uppercase"
                    style={{ color: '#D0E3FF' }}
                >
                    {label}
                </h2>
            </div>
            {subtitle && (
                <p className="text-xs ml-10" style={{ color: '#7096D1' }}>
                    {subtitle}
                </p>
            )}
        </div>
    );
}

/** Hero finder card — "Find an Attorney" / "Find a Therapist" style. */
function FinderHeroCard({
    icon: Icon,
    title,
    description,
    localResources,
    fallbackResources,
    hasLocalData,
    accentColor,
}: {
    icon: typeof Scale;
    title: string;
    description: string;
    localResources: ResourceEntry[];
    fallbackResources: ResourceEntry[];
    hasLocalData: boolean;
    accentColor: string;
}) {
    const resources = hasLocalData && localResources.length > 0 ? localResources : fallbackResources;
    const showFallbackNotice = !hasLocalData || localResources.length === 0;

    return (
        <motion.div
            whileHover={{ y: -3 }}
            className="card-premium p-6 h-full"
        >
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{
                        background: `linear-gradient(135deg, ${accentColor}25, ${accentColor}08)`,
                        border: `1px solid ${accentColor}40`,
                    }}
                >
                    <Icon size={22} style={{ color: accentColor }} />
                </div>
                <div>
                    <h3 className="font-semibold text-base" style={{ color: '#0A1E54' }}>
                        {title}
                    </h3>
                    <p className="text-xs" style={{ color: '#123D7E' }}>
                        {description}
                    </p>
                </div>
            </div>

            {/* Fallback badge */}
            {showFallbackNotice && (
                <div
                    className="flex items-center gap-2 rounded-lg px-3 py-2 mb-4"
                    style={{
                        background: 'rgba(229, 168, 74, 0.08)',
                        border: '1px solid rgba(229, 168, 74, 0.2)',
                    }}
                >
                    <Search size={12} style={{ color: '#E5A84A' }} />
                    <span className="text-xs" style={{ color: '#E5A84A' }}>
                        Use these directories to search in your area
                    </span>
                </div>
            )}

            {/* Resources list */}
            <div className="space-y-3">
                {resources.map((r) => (
                    <ResourceCard key={resourceKey(r)} resource={r} />
                ))}
            </div>
        </motion.div>
    );
}

/** Court & county resources section — link cards in a grid. */
function CourtResourcesGrid({
    stateData,
    countyData,
    cachedResources,
}: {
    stateData: StateResources | null;
    countyData: CountyResources | null;
    cachedResources: CachedResources | null;
}) {
    const items: { label: string; resource: ResourceEntry; icon: typeof Landmark }[] = [];

    // AI-cached data takes priority; fall back to curated data
    if (cachedResources?.courtClerk) {
        items.push({ label: 'County Clerk', resource: toResourceEntry(cachedResources.courtClerk, ['clerk', 'court']), icon: Landmark });
    } else if (countyData?.courtClerk) {
        items.push({ label: 'County Clerk', resource: countyData.courtClerk, icon: Landmark });
    }

    if (cachedResources?.courtsWebsite) {
        items.push({ label: 'Courts Website', resource: toResourceEntry(cachedResources.courtsWebsite, ['court', 'website']), icon: Scale });
    } else if (countyData?.courtsWebsite) {
        items.push({ label: 'Courts Website', resource: countyData.courtsWebsite, icon: Scale });
    }

    if (cachedResources?.familyDivision) {
        items.push({ label: 'Family Division', resource: toResourceEntry(cachedResources.familyDivision, ['court', 'family']), icon: Users });
    } else if (countyData?.familyDivision) {
        items.push({ label: 'Family Division', resource: countyData.familyDivision, icon: Users });
    }

    if (cachedResources?.localRules) {
        items.push({ label: 'Rules & Procedures', resource: toResourceEntry(cachedResources.localRules, ['rules', 'procedures']), icon: BookOpen });
    } else if (countyData?.rulesAndProcedures) {
        items.push({ label: 'Rules & Procedures', resource: countyData.rulesAndProcedures, icon: BookOpen });
    }

    // State family code: AI-cached first, then curated
    if (cachedResources?.stateFamilyCode) {
        items.push({
            label: 'State Family Law Code',
            resource: toResourceEntry(cachedResources.stateFamilyCode, ['law', 'family-code']),
            icon: Shield,
        });
    } else if (stateData?.stateFamilyCode) {
        items.push({
            label: 'State Family Law Code',
            resource: stateData.stateFamilyCode,
            icon: Shield,
        });
    }

    if (items.length === 0) return null;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item) => {
                const safeItemUrl = toSafeExternalUrl(item.resource.url);
                const CardContent = (
                    <motion.div
                        whileHover={safeItemUrl ? { scale: 1.02, y: -2 } : undefined}
                        whileTap={safeItemUrl ? { scale: 0.98 } : undefined}
                        className={`card-premium p-4 ${safeItemUrl ? 'cursor-pointer' : ''} group h-full`}
                    >
                        <div className="flex items-center gap-3">
                            <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{
                                    background: 'rgba(112, 150, 209, 0.1)',
                                    border: '1px solid rgba(112, 150, 209, 0.25)',
                                }}
                            >
                                <item.icon size={16} style={{ color: '#7096D1' }} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: '#0A1E54' }}>
                                    {item.label}
                                </p>
                                <p className="text-xs truncate" style={{ color: '#123D7E' }}>
                                    {item.resource.name}
                                </p>
                            </div>
                            {safeItemUrl && (
                                <ExternalLink
                                    size={13}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                    style={{ color: '#7096D1' }}
                                />
                            )}
                        </div>
                        {item.resource.phone && (
                            <p className="text-xs mt-2 ml-[52px]" style={{ color: '#5A8EC9' }}>
                                {item.resource.phone}
                            </p>
                        )}
                    </motion.div>
                );
                return safeItemUrl ? (
                    <a
                        key={item.label}
                        href={safeItemUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-underline"
                    >
                        {CardContent}
                    </a>
                ) : (
                    <div key={item.label}>
                        {CardContent}
                    </div>
                );
            })}
        </div>
    );
}

/** Shimmer card placeholder for loading states. */
function ShimmerCard() {
    return (
        <div className="card-premium p-4 animate-pulse">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex-shrink-0" style={{ background: 'rgba(208, 227, 255, 0.08)' }} />
                <div className="flex-1 space-y-2">
                    <div className="h-3 rounded-full w-2/3" style={{ background: 'rgba(208, 227, 255, 0.12)' }} />
                    <div className="h-2.5 rounded-full w-1/2" style={{ background: 'rgba(208, 227, 255, 0.08)' }} />
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════
//  Main Page
// ═══════════════════════════════════════════

/** Resources Hub — a personalized directory of legal, therapeutic, and community resources. */
export default function ResourcesPage() {
    const { userId } = useUser();
    const user = useQuery(api.users.get, userId ? { id: userId } : 'skip');
    const courtSettings = useQuery(api.courtSettings.get);

    // Resolve location: prefer court settings, fall back to user profile
    const state = courtSettings?.state || user?.state || '';
    const county = courtSettings?.county || user?.county || '';

    // Normalize county for cache lookup (strip "County" suffix)
    const normCounty = county.replace(/\s+County$/i, '').trim();

    // Normalize casing to match API route's canonical cache key
    const normState = titleCase(state);
    const normCountyTitle = titleCase(normCounty);

    // Query curated static data
    const stateData = state ? getStateResources(state) : null;
    const countyData = state && normCounty ? getCountyResources(state, normCounty) : null;
    const hasCuratedData = isStateCurated(state);

    // Query AI-cached resources from Convex (using normalized titleCase keys)
    const cachedEntry = useQuery(
        api.resourcesCache.get,
        normState && normCountyTitle ? { state: normState, county: normCountyTitle } : 'skip',
    );
    const cachedResources: CachedResources | null = cachedEntry?.resources ?? null;

    // Auto-fetch state: track whether we've triggered a lookup for current location
    const [lookupTriggered, setLookupTriggered] = useState(false);
    const [lookupError, setLookupError] = useState<string | null>(null);

    // Reset lookup state and abort in-flight request when location changes
    const activeLookupRef = useRef<{ key: string; controller: AbortController } | null>(null);

    useEffect(() => {
        activeLookupRef.current?.controller.abort();
        activeLookupRef.current = null;
        setLookupTriggered(false);
        setLookupError(null);
    }, [state, normCounty]);

    /** Trigger an AI resource lookup for the current state + county. */
    const triggerLookup = useCallback(async () => {
        if (!state || !normCounty || lookupTriggered) return;
        const requestKey = `${state}::${normCounty}`;
        activeLookupRef.current?.controller.abort();
        const controller = new AbortController();
        activeLookupRef.current = { key: requestKey, controller };

        setLookupTriggered(true);
        setLookupError(null);
        try {
            const res = await fetch('/api/resources/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state, county: normCounty }),
                signal: controller.signal,
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Lookup failed (${res.status})`);
            }
        } catch (err) {
            if (controller.signal.aborted) return;
            if (activeLookupRef.current?.key !== requestKey) return;
            console.error('[Resources] Lookup failed:', err);
            setLookupError(err instanceof Error ? err.message : 'Resource lookup failed');
        }
    }, [state, normCounty, lookupTriggered]);

    // Auto-trigger lookup on cache miss for any location
    useEffect(() => {
        // Only trigger if:
        // 1. We have a state and county
        // 2. The cache query has loaded (not undefined) and returned null
        // 3. We haven't already triggered
        if (
            state &&
            normCounty &&
            cachedEntry === null &&
            !lookupTriggered
        ) {
            triggerLookup();
        }
    }, [state, normCounty, cachedEntry, lookupTriggered, triggerLookup]);

    const locationLabel = county && state
        ? `${county}${county.toLowerCase().endsWith('county') ? '' : ' County'}, ${state}`
        : state || 'your area';

    // isLookingUp: true only after cache query has completed (cachedEntry === null
    // indicates a miss; undefined means the query is still loading)
    const isLookingUp = state && normCounty && cachedEntry === null && !lookupError;

    // Merge legal aid: AI-cached takes priority, curated supplements (deduplicated)
    const legalAidResources: ResourceEntry[] = [];
    const seenLegalAidKeys = new Set<string>();
    if (cachedResources?.legalAid) {
        for (const r of cachedResources.legalAid.map(r => toResourceEntry(r, ['legal-aid']))) {
            const key = resourceKey(r);
            if (!seenLegalAidKeys.has(key)) { seenLegalAidKeys.add(key); legalAidResources.push(r); }
        }
    }
    if (stateData?.statewideLegalAid) {
        for (const r of stateData.statewideLegalAid) {
            const key = resourceKey(r);
            if (!seenLegalAidKeys.has(key)) { seenLegalAidKeys.add(key); legalAidResources.push(r); }
        }
    }
    if (countyData?.legalAid) {
        for (const r of countyData.legalAid) {
            const key = resourceKey(r);
            if (!seenLegalAidKeys.has(key)) { seenLegalAidKeys.add(key); legalAidResources.push(r); }
        }
    }

    // Merge nonprofits: AI-cached takes priority, curated supplements (deduplicated)
    const nonprofitResources: ResourceEntry[] = [];
    const seenNonprofitKeys = new Set<string>();
    if (cachedResources?.nonprofits) {
        for (const r of cachedResources.nonprofits.map(r => toResourceEntry(r, ['nonprofit']))) {
            const key = resourceKey(r);
            if (!seenNonprofitKeys.has(key)) { seenNonprofitKeys.add(key); nonprofitResources.push(r); }
        }
    }
    if (countyData?.nonprofits) {
        for (const r of countyData.nonprofits) {
            const key = resourceKey(r);
            if (!seenNonprofitKeys.has(key)) { seenNonprofitKeys.add(key); nonprofitResources.push(r); }
        }
    }

    // My Case card rendering
    const safeCaseSearchUrl = toSafeExternalUrl(cachedResources?.caseSearch?.url);
    const showMyCaseCard = courtSettings?.causeNumber && safeCaseSearchUrl;

    return (
        <div className="max-w-6xl mx-auto pb-12">
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
                            background: 'linear-gradient(135deg, #FFF9F0, #D0E3FF)',
                            boxShadow: '0 2px 12px rgba(208, 227, 255, 0.3)',
                        }}
                    >
                        <BookOpen size={18} style={{ color: '#0A1E54' }} />
                    </div>
                    <h1 className="text-headline text-3xl" style={{ color: '#F7F2EB' }}>
                        Resources Hub
                    </h1>
                </div>
                <p className="text-sm" style={{ color: '#D0E3FF' }}>
                    {state
                        ? <>Your personalized directory of legal &amp; support resources in <strong style={{ color: '#F7F2EB' }}>{locationLabel}</strong></>
                        : 'Discover attorneys, therapists, legal aid, and community resources near you.'
                    }
                </p>
            </motion.div>

            {/* ─── Location Not Set Banner ─── */}
            {!state && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
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
                            <MapPin size={20} style={{ color: '#E5A84A' }} />
                        </div>
                        <div className="flex-1">
                            <p className="font-semibold text-sm mb-1" style={{ color: '#0A1E54' }}>
                                Set your location to see local resources
                            </p>
                            <p className="text-xs mb-3" style={{ color: '#123D7E' }}>
                                Configure your state and county in Court Settings or your Profile to unlock
                                personalized attorney, therapist, and court resources for your area.
                            </p>
                            <div className="flex gap-3">
                                <Link
                                    href="/court-settings"
                                    className="btn-primary text-xs flex items-center gap-2 no-underline"
                                >
                                    <Settings size={13} />
                                    Court Settings
                                </Link>
                                <Link
                                    href="/profile"
                                    className="btn-outline text-xs flex items-center gap-2 no-underline"
                                    style={{ color: '#0A1E54', borderColor: 'rgba(10, 30, 84, 0.2)' }}
                                >
                                    My Profile
                                </Link>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ─── AI Lookup Loading Banner ─── */}
            {isLookingUp && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    className="card-premium p-5 mb-6"
                >
                    <div className="flex items-center gap-3">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        >
                            <Sparkles size={18} style={{ color: '#F7F2EB' }} />
                        </motion.div>
                        <div>
                            <p className="text-sm font-medium" style={{ color: '#F7F2EB' }}>
                                Discovering resources for {locationLabel}…
                            </p>
                            <p className="text-xs" style={{ color: '#D0E3FF' }}>
                                NEXX AI is finding your local court, legal aid, and support resources.
                            </p>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ─── Lookup Error ─── */}
            {lookupError && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card-premium p-5 mb-6"
                    style={{ borderColor: 'rgba(220, 38, 38, 0.2)' }}
                >
                    <div className="flex items-center gap-3">
                        <AlertTriangle size={16} style={{ color: '#DC2626' }} />
                        <div className="flex-1">
                            <p className="text-sm" style={{ color: '#DC2626' }}>
                                {lookupError}
                            </p>
                        </div>
                        <button
                            onClick={() => { setLookupTriggered(false); setLookupError(null); }}
                            className="text-xs font-medium px-3 py-1 rounded-lg transition-colors cursor-pointer"
                            style={{ color: '#5A8EC9', background: 'rgba(90, 142, 201, 0.1)' }}
                        >
                            Retry
                        </button>
                    </div>
                </motion.div>
            )}
            {/* ─── My Case Card ─── */}
            {showMyCaseCard && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18, duration: 0.5 }}
                    className="mb-6"
                >
                    <a
                        href={safeCaseSearchUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-underline block"
                    >
                        <motion.div
                            whileHover={{ scale: 1.01, y: -2 }}
                            className="rounded-2xl p-5 cursor-pointer group"
                            style={{
                                background: 'linear-gradient(135deg, rgba(90, 142, 201, 0.08), rgba(208, 227, 255, 0.04))',
                                border: '1px solid rgba(208, 227, 255, 0.2)',
                            }}
                        >
                            <div className="flex items-center gap-4">
                                <div
                                    className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{
                                        background: 'linear-gradient(135deg, rgba(208, 227, 255, 0.15), rgba(112, 150, 209, 0.08))',
                                        border: '1px solid rgba(208, 227, 255, 0.25)',
                                    }}
                                >
                                    <Search size={22} style={{ color: '#D0E3FF' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h3 className="font-semibold text-base" style={{ color: '#F7F2EB' }}>
                                            My Case
                                        </h3>
                                        <span
                                            className="text-xs font-mono px-2 py-0.5 rounded-md"
                                            style={{
                                                background: 'rgba(208, 227, 255, 0.1)',
                                                border: '1px solid rgba(208, 227, 255, 0.15)',
                                                color: '#D0E3FF',
                                            }}
                                        >
                                            {courtSettings.causeNumber}
                                        </span>
                                    </div>
                                    <p className="text-xs" style={{ color: '#7096D1' }}>
                                        {cachedResources?.caseSearch?.description || `Search your case on ${cachedResources?.caseSearch?.name}`}
                                    </p>
                                    {courtSettings.courtName && (
                                        <p className="text-xs mt-0.5" style={{ color: '#5A8EC9' }}>
                                            {courtSettings.courtName}
                                            {courtSettings.assignedJudge ? ` · ${courtSettings.assignedJudge}` : ''}
                                        </p>
                                    )}
                                </div>
                                <div className="flex-shrink-0 flex items-center gap-2">
                                    <span
                                        className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all group-hover:scale-105"
                                        style={{
                                            background: 'rgba(208, 227, 255, 0.1)',
                                            border: '1px solid rgba(208, 227, 255, 0.2)',
                                            color: '#D0E3FF',
                                        }}
                                    >
                                        View Case
                                    </span>
                                    <ExternalLink
                                        size={14}
                                        className="opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity"
                                        style={{ color: '#7096D1' }}
                                    />
                                </div>
                            </div>
                        </motion.div>
                    </a>
                </motion.div>
            )}

            {/* ─── Hero Finder Cards ─── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
                className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-8"
            >
                <FinderHeroCard
                    icon={Scale}
                    title="Find an Attorney Near Me"
                    description={`Browse family law attorneys in ${locationLabel}`}
                    localResources={countyData?.attorneys ?? []}
                    fallbackResources={NATIONAL_ATTORNEY_DIRECTORIES}
                    hasLocalData={hasCuratedData}
                    accentColor="#5A8EC9"
                />
                <FinderHeroCard
                    icon={Heart}
                    title="Find a Therapist / Counselor"
                    description="NPD-trained therapists & counselors in your area"
                    localResources={countyData?.therapists ?? []}
                    fallbackResources={NATIONAL_THERAPIST_DIRECTORIES}
                    hasLocalData={hasCuratedData}
                    accentColor="#5A9E6F"
                />
            </motion.div>

            {/* ─── Court & County Resources ─── */}
            {(stateData || cachedResources || state) && (
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                    className="mb-8"
                >
                    <SectionHeader
                        icon={Landmark}
                        label="Court & County Resources"
                        subtitle={county
                            ? `${county}${county.toLowerCase().endsWith('county') ? '' : ' County'} courthouse, clerk, and court information`
                            : 'Your local court resources'
                        }
                        color="#7096D1"
                    />
                    {isLookingUp ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            <ShimmerCard />
                            <ShimmerCard />
                            <ShimmerCard />
                        </div>
                    ) : stateData || cachedResources ? (
                        <CourtResourcesGrid
                            stateData={stateData}
                            countyData={countyData}
                            cachedResources={cachedResources}
                        />
                    ) : (
                        <div className="card-premium p-6 text-center">
                            <p className="text-sm" style={{ color: '#123D7E' }}>
                                Court resources for <strong>{state}</strong> are coming soon.
                                Check back as we expand our coverage.
                            </p>
                        </div>
                    )}


                </motion.div>
            )}

            {/* ─── Legal Aid & Assistance ─── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="mb-8"
            >
                <SectionHeader
                    icon={HandHelping}
                    label="Legal Aid & Assistance"
                    subtitle="Free and low-cost legal help, bar associations, and pro bono programs"
                    color="#E5A84A"
                />
                {isLookingUp ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <ShimmerCard />
                        <ShimmerCard />
                    </div>
                ) : legalAidResources.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {legalAidResources.map((r) => (
                            <ResourceCard key={resourceKey(r)} resource={r} />
                        ))}
                    </div>
                ) : (
                    <div className="card-premium p-5 md:col-span-2 text-center">
                        <p className="text-xs" style={{ color: '#123D7E' }}>
                            Set your location above to see local legal aid resources, or search&nbsp;
                            <a
                                href="https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium no-underline"
                                style={{ color: '#5A8EC9' }}
                            >
                                LSC.gov
                            </a>
                            &nbsp;for free legal aid programs nationwide.
                        </p>
                    </div>
                )}
            </motion.div>

            {/* ─── Nonprofits & Support Organizations ─── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
                className="mb-8"
            >
                <SectionHeader
                    icon={Users}
                    label="Nonprofits & Support Organizations"
                    subtitle="Shelters, crisis centers, family support, and advocacy groups"
                    color="#C75A5A"
                />
                {isLookingUp ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <ShimmerCard />
                        <ShimmerCard />
                    </div>
                ) : nonprofitResources.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {nonprofitResources.map((r) => (
                            <ResourceCard key={resourceKey(r)} resource={r} />
                        ))}
                    </div>
                ) : (
                    <div className="card-premium p-5 text-center">
                        <p className="text-xs" style={{ color: '#123D7E' }}>
                            {state
                                ? `Local nonprofit data for ${locationLabel} is being curated. Check back soon.`
                                : 'Set your location to discover local support organizations.'}
                        </p>
                    </div>
                )}
            </motion.div>

            {/* ─── Crisis & Safety ─── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.5 }}
            >
                <SectionHeader
                    icon={AlertTriangle}
                    label="Crisis & Safety"
                    subtitle="Immediate help — available 24/7, nationwide"
                    color="#C75A5A"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {CRISIS_RESOURCES.map((r) => (
                        <motion.div
                            key={r.name}
                            whileHover={{ scale: 1.01, y: -1 }}
                            className="rounded-2xl p-4 group"
                            style={{
                                background: 'linear-gradient(135deg, rgba(199, 90, 90, 0.06), rgba(199, 90, 90, 0.02))',
                                border: '1px solid rgba(199, 90, 90, 0.15)',
                            }}
                        >
                            <p className="font-semibold text-sm mb-1" style={{ color: '#F7F2EB' }}>
                                {r.name}
                            </p>
                            {r.description && (
                                <p className="text-xs mb-2" style={{ color: '#D0E3FF' }}>
                                    {r.description}
                                </p>
                            )}
                            <div className="flex flex-wrap items-center gap-3">
                                {r.phone && (
                                    isDialable(r.phone) ? (
                                        <a
                                            href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
                                            className="flex items-center gap-1 text-xs font-bold no-underline"
                                            style={{ color: '#F7F2EB' }}
                                        >
                                            <Phone size={11} />
                                            {r.phone}
                                        </a>
                                    ) : (
                                        <span
                                            className="flex items-center gap-1 text-xs font-bold"
                                            style={{ color: '#F7F2EB' }}
                                        >
                                            <Phone size={11} />
                                            {r.phone}
                                        </span>
                                    )
                                )}
                                {r.url && (
                                    <a
                                        href={r.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1 text-xs font-medium no-underline"
                                        style={{ color: '#D0E3FF' }}
                                    >
                                        <ExternalLink size={11} />
                                        Website
                                    </a>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </div>
            </motion.div>

            {/* ─── Footer Note ─── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="mt-10 text-center"
            >
                <p className="text-xs" style={{ color: '#7096D1' }}>
                    Resources are curated and verified periodically. AI-discovered resources should be verified independently.
                </p>
                <p className="text-xs mt-1" style={{ color: '#7096D1' }}>
                    In future updates, you&apos;ll be able to connect directly with attorneys and therapists
                    through NEXX — share documents, get feedback, and manage your care team.
                </p>
            </motion.div>
        </div>
    );
}
