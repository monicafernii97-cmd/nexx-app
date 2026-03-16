'use client';

import { motion } from 'framer-motion';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { useUser } from '@/lib/user-context';
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
//  Sub-components
// ═══════════════════════════════════════════

/** A single clickable resource card with name, description, phone, and link. */
function ResourceCard({ resource }: { resource: ResourceEntry }) {
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
                            <a
                                href={`tel:${resource.phone.replace(/[^\d+]/g, '')}`}
                                className="flex items-center gap-1 text-xs font-medium no-underline transition-colors hover:opacity-80"
                                style={{ color: '#5A8EC9' }}
                            >
                                <Phone size={11} />
                                {resource.phone}
                            </a>
                        )}
                        {resource.url && (
                            <a
                                href={resource.url}
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
                {resource.url && (
                    <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
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
                    <ResourceCard key={r.name} resource={r} />
                ))}
            </div>
        </motion.div>
    );
}

/** Court & county resources section — link cards in a grid. */
function CourtResourcesGrid({
    county,
    stateData,
    countyData,
}: {
    county: string;
    stateData: StateResources;
    countyData: CountyResources | null;
}) {
    const items: { label: string; resource: ResourceEntry; icon: typeof Landmark }[] = [];

    if (countyData?.courtClerk) {
        items.push({ label: 'County Clerk', resource: countyData.courtClerk, icon: Landmark });
    }
    if (countyData?.courtsWebsite) {
        items.push({ label: 'Courts Website', resource: countyData.courtsWebsite, icon: Scale });
    }
    if (countyData?.familyDivision) {
        items.push({ label: 'Family Division', resource: countyData.familyDivision, icon: Users });
    }
    if (countyData?.rulesAndProcedures) {
        items.push({ label: 'Rules & Procedures', resource: countyData.rulesAndProcedures, icon: BookOpen });
    }
    items.push({
        label: 'State Family Law Code',
        resource: stateData.stateFamilyCode,
        icon: Shield,
    });

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((item) => (
                <a
                    key={item.label}
                    href={item.resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="no-underline"
                >
                    <motion.div
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        className="card-premium p-4 cursor-pointer group h-full"
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
                            <ExternalLink
                                size={13}
                                className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                style={{ color: '#7096D1' }}
                            />
                        </div>
                        {item.resource.phone && (
                            <p className="text-xs mt-2 ml-[52px]" style={{ color: '#5A8EC9' }}>
                                {item.resource.phone}
                            </p>
                        )}
                    </motion.div>
                </a>
            ))}
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

    const stateData = state ? getStateResources(state) : null;
    const countyData = state && county ? getCountyResources(state, county) : null;
    const hasCuratedData = isStateCurated(state);

    const locationLabel = county && state
        ? `${county}${county.toLowerCase().endsWith('county') ? '' : ' County'}, ${state}`
        : state || 'your area';

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
                                <Link href="/court-settings" className="no-underline">
                                    <button className="btn-primary text-xs flex items-center gap-2">
                                        <Settings size={13} />
                                        Court Settings
                                    </button>
                                </Link>
                                <Link href="/profile" className="no-underline">
                                    <button className="btn-outline text-xs flex items-center gap-2" style={{ color: '#0A1E54', borderColor: 'rgba(10, 30, 84, 0.2)' }}>
                                        My Profile
                                    </button>
                                </Link>
                            </div>
                        </div>
                    </div>
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
            {(stateData || state) && (
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                    className="mb-8"
                >
                    <SectionHeader
                        icon={Landmark}
                        label="Court & County Resources"
                        subtitle={county ? `${county} County courthouse, clerk, and court information` : 'Your local court resources'}
                        color="#7096D1"
                    />
                    {stateData ? (
                        <CourtResourcesGrid
                            county={county}
                            stateData={stateData}
                            countyData={countyData}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Statewide legal aid */}
                    {stateData?.statewideLegalAid.map((r) => (
                        <ResourceCard key={r.name} resource={r} />
                    ))}
                    {/* County-specific legal aid */}
                    {countyData?.legalAid.map((r) => (
                        <ResourceCard key={r.name} resource={r} />
                    ))}
                    {/* If no data at all, show a helpful message */}
                    {!stateData && !countyData && (
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
                </div>
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
                {countyData && countyData.nonprofits.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {countyData.nonprofits.map((r) => (
                            <ResourceCard key={r.name} resource={r} />
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
                                    <a
                                        href={`tel:${r.phone.replace(/[^\d+]/g, '')}`}
                                        className="flex items-center gap-1 text-xs font-bold no-underline"
                                        style={{ color: '#F7F2EB' }}
                                    >
                                        <Phone size={11} />
                                        {r.phone}
                                    </a>
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
                    Resources are curated and verified periodically. If you notice an issue, let us know through Settings.
                </p>
                <p className="text-xs mt-1" style={{ color: '#7096D1' }}>
                    In future updates, you&apos;ll be able to connect directly with attorneys and therapists
                    through NEXX — share documents, get feedback, and manage your care team.
                </p>
            </motion.div>
        </div>
    );
}
