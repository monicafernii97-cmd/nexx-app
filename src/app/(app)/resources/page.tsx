'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { useUser } from '@/lib/user-context';
import { titleCase } from '@/lib/utils/stringHelpers';
import {
    BookOpenText,
    Scales,
    Heart,
    Bank,
    HandHeart,
    Users,
    Phone,
    ArrowUpRight,
    MapPin,
    Shield,
    MagnifyingGlass,
    WarningCircle,
    Gear,
    Strategy,
    SealCheck,
    type Icon,
    type IconWeight,
} from '@phosphor-icons/react';
import Link from 'next/link';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
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

/** Derive cache resource types from the Convex schema to prevent drift. */
import type { Doc } from '@convex/_generated/dataModel';

/** Shape of a single AI-cached resource (court clerk, family division, etc.) */
type CachedResource = NonNullable<Doc<'resourcesCache'>['resources']['courtClerk']>;

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

/** Stable unique key for a ResourceEntry to prevent React key collisions. */
function resourceKey(r: ResourceEntry): string {
    return [r.name, r.url ?? '', r.phone ?? '', r.address ?? ''].join('|');
}

/** Merge multiple resource lists, deduplicating by resourceKey (first occurrence wins). */
function mergeUniqueResourceLists(...lists: ResourceEntry[][]): ResourceEntry[] {
    const out: ResourceEntry[] = [];
    const seen = new Set<string>();
    for (const list of lists) {
        for (const r of list) {
            const key = resourceKey(r);
            if (!seen.has(key)) {
                seen.add(key);
                out.push(r);
            }
        }
    }
    return out;
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
            whileHover={{ scale: 1.02, y: -4 }}
            className={`p-3 group flex flex-col justify-between h-full bg-white/5 backdrop-blur-xl border border-white/15 shadow-sm hover:shadow-md transition-all duration-300 rounded-xl relative overflow-hidden ${safeUrl ? 'hover:border-white/30 cursor-pointer' : ''}`}
        >
            <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[12px] text-white mb-0.5 truncate group-hover:text-[#60A5FA] transition-colors relative z-10 pointer-events-none">
                        {resource.name}
                    </h4>
                    {resource.description && (
                        <p className="text-[11px] text-white/70 line-clamp-2 leading-relaxed font-medium relative z-10 pointer-events-none">
                            {resource.description}
                        </p>
                    )}
                </div>
                {safeUrl && (
                    <a
                        href={safeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all hover:bg-[#123D7E] hover:text-white after:absolute after:inset-0 z-0"
                        aria-label={`Open ${resource.name} website`}
                    >
                        <ArrowUpRight size={14} weight="bold" className="relative z-10 pointer-events-none" />
                    </a>
                )}
            </div>
            
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-white/10">
                {resource.phone && (
                    isDialable(resource.phone) ? (
                        <a
                            href={`tel:${resource.phone.replace(/[^\d+]/g, '')}`}
                            className="relative z-10 flex items-center gap-1.5 text-[12px] font-bold no-underline transition-colors hover:text-white text-[#60A5FA]"
                        >
                            <Phone size={14} weight="fill" />
                            {resource.phone}
                        </a>
                    ) : (
                        <span
                            className="relative z-10 flex items-center gap-1.5 text-[12px] font-bold text-[#60A5FA]"
                        >
                            <Phone size={14} weight="fill" />
                            {resource.phone}
                        </span>
                    )
                )}
                
                {resource.address && (
                    <p className="flex items-center gap-1.5 text-[12px] font-medium text-white/70 ml-auto pointer-events-none relative z-10">
                        <MapPin size={14} weight="fill" />
                        <span className="truncate max-w-[120px]">{resource.address}</span>
                    </p>
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
    colorMode = 'default',
}: {
    icon: Icon;
    label: string;
    subtitle?: string;
    colorMode?: 'default' | 'rose' | 'warning';
}) {
    let iconColor = '#60A5FA';
    let iconBg = 'rgba(255,255,255,0.05)';
    const weight: IconWeight = "duotone";

    if (colorMode === 'rose') {
        iconColor = '#F43F5E';
        iconBg = 'rgba(244,63,94,0.1)';
    } else if (colorMode === 'warning') {
        iconColor = '#FBBF24';
        iconBg = 'rgba(251,191,36,0.1)';
    }

    return (
        <div className="mb-8 flex items-start gap-5">
            <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm backdrop-blur-xl border border-white/15 shrink-0"
                style={{ background: iconBg }}
            >
                <Icon size={24} weight={weight} color={iconColor} />
            </div>
            <div className="flex flex-col pt-0.5">
                <h2 className="text-[12px] font-bold tracking-[0.15em] uppercase text-white mb-1">
                    {label}
                </h2>
                {subtitle && (
                    <p className="text-[14px] font-medium text-white/80 drop-shadow-sm leading-snug">
                        {subtitle}
                    </p>
                )}
            </div>
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
}: {
    icon: Icon;
    title: string;
    description: string;
    localResources: ResourceEntry[];
    fallbackResources: ResourceEntry[];
    hasLocalData: boolean;
}) {
    const resources = hasLocalData && localResources.length > 0 ? localResources : fallbackResources;
    const showFallbackNotice = !hasLocalData || localResources.length === 0;

    return (
        <motion.div
            whileHover={{ y: -4 }}
            className="p-4 h-full rounded-xl bg-white/5 backdrop-blur-xl border border-white/15 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group"
        >
            <div className={`absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] pointer-events-none opacity-20 transition-opacity duration-500 group-hover:opacity-40 ${title.includes('Attorney') ? 'bg-[#60A5FA]' : 'bg-[#10B981]'}`} />
            
            {/* Header */}
            <div className="flex items-center gap-4 mb-6 relative z-10">
                <div
                    className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center bg-white/10 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] border border-white/30"
                >
                    <Icon size={28} weight="duotone" className={title.includes('Attorney') ? 'text-[#60A5FA] drop-shadow-[0_2px_8px_rgba(96,165,250,0.8)]' : 'text-[#10B981] drop-shadow-[0_2px_8px_rgba(16,185,129,0.8)]'} />
                </div>
                <div>
                    <h3 className="font-serif font-bold text-lg text-white mb-0.5 tracking-tight">
                        {title}
                    </h3>
                    <p className="text-[14px] font-medium text-white/80">
                        {description}
                    </p>
                </div>
            </div>

            {/* Fallback badge */}
            {showFallbackNotice && (
                <div
                    className="flex items-center gap-2.5 rounded-xl px-4 py-3 mb-6 bg-white/10 border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] relative z-10"
                >
                    <MagnifyingGlass size={16} weight="bold" className="text-white" />
                    <span className="text-[12px] font-bold uppercase tracking-widest text-[#E5A84A]">
                        Use directories to search locally
                    </span>
                </div>
            )}

            {/* Resources list */}
            <div className="grid grid-cols-1 gap-4">
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
    const items: { label: string; resource: ResourceEntry; icon: Icon }[] = [];

    // AI-cached data takes priority; fall back to curated data
    if (cachedResources?.courtClerk) {
        items.push({ label: 'County Clerk', resource: toResourceEntry(cachedResources.courtClerk, ['clerk', 'court']), icon: Bank });
    } else if (countyData?.courtClerk) {
        items.push({ label: 'County Clerk', resource: countyData.courtClerk, icon: Bank });
    }

    if (cachedResources?.courtsWebsite) {
        items.push({ label: 'Courts Website', resource: toResourceEntry(cachedResources.courtsWebsite, ['court', 'website']), icon: Scales });
    } else if (countyData?.courtsWebsite) {
        items.push({ label: 'Courts Website', resource: countyData.courtsWebsite, icon: Scales });
    }

    if (cachedResources?.familyDivision) {
        items.push({ label: 'Family Division', resource: toResourceEntry(cachedResources.familyDivision, ['court', 'family']), icon: Users });
    } else if (countyData?.familyDivision) {
        items.push({ label: 'Family Division', resource: countyData.familyDivision, icon: Users });
    }

    if (cachedResources?.localRules) {
        items.push({ label: 'Rules & Procedures', resource: toResourceEntry(cachedResources.localRules, ['rules', 'procedures']), icon: BookOpenText });
    } else if (countyData?.rulesAndProcedures) {
        items.push({ label: 'Rules & Procedures', resource: countyData.rulesAndProcedures, icon: BookOpenText });
    }

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

    if (items.length === 0) {
        return (
            <div className="card-premium p-8 text-center sm:col-span-2 lg:col-span-3 border-dashed">
                <p className="text-[14px] font-medium text-sapphire-muted">
                    Court resources for this location are still being securely curated. Check back soon.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => {
                const safeItemUrl = toSafeExternalUrl(item.resource.url);
                const CardContent = (
                    <motion.div
                        whileHover={safeItemUrl ? { scale: 1.02, y: -4 } : undefined}
                        whileTap={safeItemUrl ? { scale: 0.98 } : undefined}
                        className={`p-5 bg-white/5 backdrop-blur-2xl border border-white/20 rounded-2xl ${safeItemUrl ? 'cursor-pointer hover:border-white/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_8px_32px_rgba(0,0,0,0.3)] hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_16px_48px_rgba(0,0,0,0.5)]' : 'shadow-[inset_0_1px_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(0,0,0,0.2)]'} group h-full flex flex-col justify-between transition-all duration-300`}
                    >
                        <div className="flex items-start gap-4 mb-3">
                            <div
                                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-white/10 border border-white/20 text-[#60A5FA] group-hover:bg-[#123D7E] group-hover:text-white transition-colors"
                            >
                                <item.icon size={22} weight="duotone" color="#60A5FA" className="drop-shadow-sm" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[15px] font-bold truncate text-white mb-0.5">
                                    {item.label}
                                </p>
                                <p className="text-[13px] font-medium text-white/80 line-clamp-2 leading-snug">
                                    {item.resource.name}
                                </p>
                            </div>
                            {safeItemUrl && (
                                <ArrowUpRight
                                    size={16}
                                    weight="bold"
                                    className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 text-white relative top-1"
                                />
                            )}
                        </div>
                        {item.resource.phone && (
                            <p className="text-[12px] font-bold text-[#5A8EC9] mt-1 ml-[64px] flex items-center gap-1.5 border-t border-[rgba(10,22,41,0.04)] pt-3">
                                <Phone size={14} weight="fill" /> {item.resource.phone}
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
                        className="no-underline block h-full"
                    >
                        {CardContent}
                    </a>
                ) : (
                    <div key={item.label} className="h-full">
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
        <div className="card-premium p-5 animate-pulse bg-white/50 border-white h-full">
            <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl flex-shrink-0 bg-cloud/50" />
                <div className="flex-1 space-y-3 py-1">
                    <div className="h-3.5 rounded-full w-2/3 bg-cloud" />
                    <div className="h-2.5 rounded-full w-1/2 bg-cloud/50" />
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
    const normalizedLocationKey =
        normState && normCountyTitle ? `${normState}::${normCountyTitle}` : '';

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

    // Abort in-flight lookup on component unmount
    const activeLookupRef = useRef<{ key: string; controller: AbortController } | null>(null);

    useEffect(() => {
        return () => {
            activeLookupRef.current?.controller.abort();
            activeLookupRef.current = null;
        };
    }, []);

    useEffect(() => {
        activeLookupRef.current?.controller.abort();
        activeLookupRef.current = null;
        setLookupTriggered(false);
        setLookupError(null);
    }, [normalizedLocationKey]);

    /** Trigger an AI resource lookup for the current state + county. */
    const triggerLookup = useCallback(async () => {
        if (!normState || !normCountyTitle || lookupTriggered) return;
        const requestKey = normalizedLocationKey;
        activeLookupRef.current?.controller.abort();
        const controller = new AbortController();
        activeLookupRef.current = { key: requestKey, controller };

        setLookupTriggered(true);
        setLookupError(null);
        try {
            const res = await fetch('/api/resources/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ state: normState, county: normCountyTitle }),
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
    }, [normState, normCountyTitle, normalizedLocationKey, lookupTriggered]);

    // Auto-trigger lookup on cache miss for any location
    useEffect(() => {
        if (
            normState &&
            normCountyTitle &&
            cachedEntry === null &&
            !lookupTriggered
        ) {
            triggerLookup();
        }
    }, [normState, normCountyTitle, cachedEntry, lookupTriggered, triggerLookup]);

    const locationLabel = county && state
        ? `${county}${county.toLowerCase().endsWith('county') ? '' : ' County'}, ${state}`
        : state || 'your area';

    const hasCanonicalLocation = Boolean(normState && normCountyTitle);
    const isCacheQueryLoading = hasCanonicalLocation && cachedEntry === undefined;
    const isLookingUp = hasCanonicalLocation && cachedEntry === null && !lookupError;

    // Merge legal aid: AI-cached takes priority, curated supplements (deduplicated)
    const legalAidResources = mergeUniqueResourceLists(
        cachedResources?.legalAid?.map(r => toResourceEntry(r, ['legal-aid'])) ?? [],
        stateData?.statewideLegalAid ?? [],
        countyData?.legalAid ?? [],
    );

    // Merge nonprofits: AI-cached takes priority, curated supplements (deduplicated)
    const nonprofitResources = mergeUniqueResourceLists(
        cachedResources?.nonprofits?.map(r => toResourceEntry(r, ['nonprofit'])) ?? [],
        countyData?.nonprofits ?? [],
    );

    // My Case card rendering — cascading URL fallback:
    // 1. AI-cached case search URL (may 404)
    // 2. Court clerk URL (more stable, usually the county clerk homepage)
    // 3. Constructed Google search as last resort
    const safeCaseSearchUrl = toSafeExternalUrl(cachedResources?.caseSearch?.url);
    const safeClerkFallbackUrl = toSafeExternalUrl(cachedResources?.courtClerk?.url);
    const googleFallbackUrl = county && state
        ? `https://www.google.com/search?q=${encodeURIComponent(`${county} County ${state} case records search`)}`
        : null;
    const myCasePortalUrl = safeCaseSearchUrl || safeClerkFallbackUrl || googleFallbackUrl;
    const showMyCaseCard = courtSettings?.causeNumber && myCasePortalUrl;

    return (
        <PageContainer noHorizontalPadding>
            <div className="max-w-5xl mx-auto w-full px-4 sm:px-8 pb-16">
            <PageHeader
                icon={BookOpenText}
                title="Resources Hub"
                description={
                    state
                        ? <span className="text-white/90">Your personalized directory of legal &amp; support resources in <strong className="text-white font-bold">{locationLabel}</strong></span>
                        : 'Discover attorneys, therapists, legal aid, and community resources near you.'
                }
            />

            {/* ─── Location Not Set Banner ─── */}
            {!state && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-4 mb-6 rounded-xl border border-[#E5A84A]/20 bg-white/5 backdrop-blur-xl shadow-sm"
                >
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                        <div
                            className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-white/10 border border-white/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]"
                        >
                            <MapPin size={24} weight="duotone" className="text-[#E5A84A] drop-shadow-md" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-[16px] text-white mb-1">
                                Set your location to see local resources
                            </h3>
                            <p className="text-[14px] font-medium text-white/80 leading-relaxed max-w-2xl">
                                Configure your state and county in Court Settings or your Profile to unlock
                                personalized attorney, therapist, and court resources for your area.
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto mt-2 md:mt-0">
                            <Link
                                href="/court-settings"
                                className="btn-primary text-[12px] flex items-center justify-center gap-2 uppercase tracking-widest px-6 py-3.5 shadow-[0_4px_15px_rgba(255,255,255,0.1)] flex-1 whitespace-nowrap"
                            >
                                <Gear size={16} weight="bold" />
                                Court Settings
                            </Link>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* ─── AI Lookup Loading Banner ─── */}
            <AnimatePresence>
                {(isCacheQueryLoading || isLookingUp) && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="glass-ethereal p-6 mb-8 rounded-[1.5rem] border-white flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                            >
                                <Strategy size={24} weight="duotone" className="text-champagne" />
                            </motion.div>
                            <div>
                                <h4 className="text-[15px] font-bold text-sapphire mb-0.5">
                                    Discovering resources for {locationLabel}…
                                </h4>
                                <p className="text-[13px] font-medium text-sapphire-muted">
                                    NEXX is gathering robust local court, legal aid, and support data.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ─── Lookup Error ─── */}
            {lookupError && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="card-premium p-6 mb-8 border-rose/20 bg-rose/5"
                >
                    <div className="flex items-center gap-4">
                        <WarningCircle size={24} weight="fill" className="text-rose flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-[14px] font-bold text-rose">
                                {lookupError}
                            </p>
                        </div>
                        <button
                            onClick={() => { setLookupTriggered(false); setLookupError(null); }}
                            className="text-[12px] font-bold tracking-widest uppercase px-4 py-2 rounded-xl bg-rose/10 hover:bg-rose/20 text-rose transition-colors cursor-pointer shrink-0"
                        >
                            Retry
                        </button>
                    </div>
                </motion.div>
            )}

            {/* ─── My Case Card ─── */}
            {showMyCaseCard && myCasePortalUrl && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.5 }}
                    className="mb-10"
                >
                    <a
                        href={myCasePortalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-underline block"
                    >
                        <motion.div
                            whileHover={{ y: -4 }}
                            transition={{ duration: 0.5, ease: "easeOut" }}
                            className="glass-ethereal rounded-xl p-4 cursor-pointer group shadow-sm hover:shadow-md transition-all border border-white/15 overflow-hidden relative"
                        >
                            {/* Hover Glow Background Map */}
                            <div className="absolute inset-0 bg-gradient-to-r from-[#123D7E]/0 via-[#123D7E]/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                            
                            <div className="flex flex-col md:flex-row md:items-center gap-6 relative z-10 w-full mb-4 md:mb-0">
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 bg-[linear-gradient(135deg,#2E5C9A,#123D7E)] shadow-[0_4px_15px_rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.3)] group-hover:scale-110 transition-transform duration-500 text-white relative overflow-hidden"
                                >
                                    <div className="absolute inset-0 bg-white/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <MagnifyingGlass size={32} weight="bold" className="relative z-10 drop-shadow-sm" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h3 className="font-serif font-bold text-lg text-white">
                                            My Case
                                        </h3>
                                        <span
                                            className="text-[12px] font-bold font-mono px-3 py-1 rounded-lg bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-sm"
                                        >
                                            {courtSettings.causeNumber}
                                        </span>
                                    </div>
                                    <p className="text-[14px] font-medium text-white/70 leading-relaxed">
                                        {safeCaseSearchUrl
                                            ? (cachedResources?.caseSearch?.description || `Search your case on ${cachedResources?.caseSearch?.name || 'your county portal'}`)
                                            : safeClerkFallbackUrl
                                                ? `Look up your case through ${cachedResources?.courtClerk?.name || 'the county clerk\'s office'}`
                                                : `Search for your case records in ${locationLabel}`}
                                    </p>
                                    {courtSettings.courtName && (
                                        <p className="text-[13px] font-bold text-white mt-2">
                                            {courtSettings.courtName}
                                            {courtSettings.assignedJudge ? ` · Hon. ${courtSettings.assignedJudge}` : ''}
                                        </p>
                                    )}
                                </div>
                                <div className="flex-shrink-0 flex items-center justify-end w-full md:w-auto">
                                    <span
                                        className="text-[12px] font-bold uppercase tracking-widest px-6 py-3.5 rounded-xl transition-all duration-300 group-hover:scale-105 shadow-sm text-white bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.2)] hover:bg-[rgba(255,255,255,0.15)] flex items-center gap-2"
                                    >
                                        Access Portal <ArrowUpRight size={16} weight="bold" className="text-white drop-shadow-sm" />
                                    </span>
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
                className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-16"
            >
                <FinderHeroCard
                    icon={Scales}
                    title="Find an Attorney"
                    description={`Browse distinguished family law attorneys in ${locationLabel}`}
                    localResources={countyData?.attorneys ?? []}
                    fallbackResources={NATIONAL_ATTORNEY_DIRECTORIES}
                    hasLocalData={hasCuratedData}
                />
                <FinderHeroCard
                    icon={Heart}
                    title="Find a Therapist"
                    description="Your network of power. Connect with elite NPD-trained therapists and legal professionals in your area."
                    localResources={countyData?.therapists ?? []}
                    fallbackResources={NATIONAL_THERAPIST_DIRECTORIES}
                    hasLocalData={hasCuratedData}
                />
            </motion.div>

            {/* ─── Court & County Resources ─── */}
            {(stateData || cachedResources || state) && (
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                    className="mb-12"
                >
                    <SectionHeader
                        icon={Bank}
                        label="Court & County Resources"
                        subtitle={county
                            ? `${county}${county.toLowerCase().endsWith('county') ? '' : ' County'} courthouse, clerk, and procedural information`
                            : 'Your local court resources'
                        }
                    />
                    {isCacheQueryLoading || isLookingUp ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                        <div className="card-premium p-8 text-center border-dashed">
                            <p className="text-[14px] font-medium text-sapphire-muted">
                                Court resources for <strong className="text-sapphire">{state}</strong> are coming soon.
                                Check back as we continuously expand our coverage.
                            </p>
                        </div>
                    )}
                </motion.div>
            )}

            {/* ─── Legal Aid & Assistance ─── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
                className="mb-12"
            >
                <SectionHeader
                    icon={HandHeart}
                    label="Legal Aid & Assistance"
                    subtitle="Free and low-cost legal support, bar associations, and pro bono programs"
                    colorMode="warning"
                />
                {isCacheQueryLoading || isLookingUp ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <ShimmerCard />
                        <ShimmerCard />
                        <ShimmerCard />
                    </div>
                ) : legalAidResources.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {legalAidResources.map((r) => (
                            <ResourceCard key={resourceKey(r)} resource={r} />
                        ))}
                    </div>
                ) : (
                    <div className="card-premium p-8 md:col-span-2 text-center border-dashed flex flex-col items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-cloud flex items-center justify-center mb-4">
                            <HandHeart size={20} weight="duotone" className="text-sapphire-muted" />
                        </div>
                        <p className="text-[14px] font-medium text-sapphire-muted max-w-lg">
                            Set your location above to see local legal aid resources, or search{' '}
                            <a
                                href="https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-bold border-b border-sapphire-muted/30 hover:border-sapphire hover:text-sapphire transition-colors text-sapphire"
                            >
                                LSC.gov
                            </a>
                            {' '}for free legal aid programs nationwide.
                        </p>
                    </div>
                )}
            </motion.div>

            {/* ─── Nonprofits & Support Organizations ─── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="mb-12"
            >
                <SectionHeader
                    icon={Users}
                    label="Community Support Organizations"
                    subtitle="Shelters, crisis centers, family support, and specialized advocacy groups"
                />
                {isCacheQueryLoading || isLookingUp ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ShimmerCard />
                        <ShimmerCard />
                    </div>
                ) : nonprofitResources.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {nonprofitResources.map((r) => (
                            <ResourceCard key={resourceKey(r)} resource={r} />
                        ))}
                    </div>
                ) : (
                    <div className="card-premium p-8 text-center border-dashed">
                        <p className="text-[14px] font-medium text-sapphire-muted">
                            {state
                                ? `Local community support data for ${locationLabel} is actively being curated. Check back soon.`
                                : 'Set your location to discover robust local support organizations.'}
                        </p>
                    </div>
                )}
            </motion.div>

            {/* ─── Crisis & Safety ─── */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
            >
                <SectionHeader
                    icon={WarningCircle}
                    label="Crisis & Safety"
                    subtitle="Immediate emergency help — available 24/7, nationwide"
                    colorMode="rose"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {CRISIS_RESOURCES.map((r) => {
                        const safeCrisisUrl = toSafeExternalUrl(r.url);
                        return (
                        <motion.div
                            key={r.name}
                            whileHover={{ scale: 1.01, y: -2 }}
                            className="card-premium p-6 group border-rose/10 hover:border-rose/30 bg-rose/[0.02]"
                        >
                            <h4 className="font-bold text-[16px] text-rose mb-1.5 flex items-center gap-2">
                               {r.name}
                            </h4>
                            {r.description && (
                                <p className="text-[13px] font-medium text-sapphire mb-4 leading-relaxed">
                                    {r.description}
                                </p>
                            )}
                            <div className="flex flex-wrap items-center gap-4 pt-4 border-t border-rose/10">
                                {r.phone && (
                                    isDialable(r.phone) ? (
                                        <a
                                            href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
                                            className="flex items-center gap-1.5 text-[14px] font-bold text-rose hover:opacity-80 transition-all bg-rose/10 px-3 py-1.5 rounded-lg"
                                        >
                                            <Phone size={14} weight="fill" />
                                            {r.phone}
                                        </a>
                                    ) : (
                                        <span
                                            className="flex items-center gap-1.5 text-[14px] font-bold text-rose bg-rose/10 px-3 py-1.5 rounded-lg"
                                        >
                                            <Phone size={14} weight="fill" />
                                            {r.phone}
                                        </span>
                                    )
                                )}
                                {safeCrisisUrl && (
                                    <a
                                        href={safeCrisisUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-widest text-sapphire hover:text-rose transition-colors ml-auto"
                                    >
                                        Visit Site <ArrowUpRight size={14} weight="bold" />
                                    </a>
                                )}
                            </div>
                        </motion.div>
                        );
                    })}
                </div>
            </motion.div>

            {/* ─── Footer Note ─── */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mt-16 text-center max-w-2xl mx-auto pb-8"
            >
                <div className="w-16 h-px bg-cloud mx-auto mb-6" />
                <p className="text-[12px] font-bold uppercase tracking-widest text-[rgba(10,22,41,0.3)] mb-2 flex items-center justify-center gap-2">
                    <SealCheck size={14} className="text-[#10B981]" weight="fill" /> Verified Directory
                </p>
                <p className="text-[13px] font-medium text-sapphire-muted leading-relaxed">
                    Resources are secured and verified continuously. External resources should be verified independently.
                    Full attorney and therapist integration arriving in future capabilities.
                </p>
                </motion.div>
            </div>
        </PageContainer>
    );
}
