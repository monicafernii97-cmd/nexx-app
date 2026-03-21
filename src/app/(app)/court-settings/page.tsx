'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { US_STATES, searchCounties } from '@/lib/data/usCounties';
import {
    Gavel,
    MapPin,
    FloppyDisk,
    Check,
    Warning,
    CaretDown,
    MagnifyingGlass,
    FileText,
    User,
    Buildings,
} from '@phosphor-icons/react';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';

/** Court settings page for configuring state, county, judge, and cause number. */
export default function CourtSettingsPage() {
    const existingSettings = useQuery(api.courtSettings.get);
    const upsertSettings = useMutation(api.courtSettings.upsert);

    // Form state
    const [state, setState] = useState('');
    const [county, setCounty] = useState('');
    const [courtName, setCourtName] = useState('');
    const [causeNumber, setCauseNumber] = useState('');
    const [assignedJudge, setAssignedJudge] = useState('');
    const [judicialDistrict, setJudicialDistrict] = useState('');

    // UI state
    const [countyQuery, setCountyQuery] = useState('');
    const [showCountyDropdown, setShowCountyDropdown] = useState(false);
    const [showStateDropdown, setShowStateDropdown] = useState(false);
    const [stateQuery, setStateQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [verifying, setVerifying] = useState(false);
    const [verifyError, setVerifyError] = useState<string | null>(null);
    const [verifyResult, setVerifyResult] = useState<{
        confidence: number;
        sources: string[];
    } | null>(null);

    const countyInputRef = useRef<HTMLInputElement>(null);
    const countyDropdownRef = useRef<HTMLDivElement>(null);
    const stateInputRef = useRef<HTMLInputElement>(null);
    const stateDropdownRef = useRef<HTMLDivElement>(null);
    const initializedRef = useRef(false);

    // Load existing settings (only on first data arrival to avoid resetting mid-edit)
    useEffect(() => {
        if (existingSettings && !initializedRef.current) {
            setState(existingSettings.state || '');
            setCounty(existingSettings.county || '');
            setCourtName(existingSettings.courtName || '');
            setCauseNumber(existingSettings.causeNumber || '');
            setAssignedJudge(existingSettings.assignedJudge || '');
            setJudicialDistrict(existingSettings.judicialDistrict || '');
            initializedRef.current = true;
        }
    }, [existingSettings]);

    // Filtered counties based on current typing
    const filteredCounties = state
        ? searchCounties(state, countyQuery, 15)
        : [];

    // Filtered states based on typing
    const filteredStates = stateQuery
        ? US_STATES.filter(s => s.toLowerCase().startsWith(stateQuery.toLowerCase()))
        : US_STATES;

    // Close dropdowns on outside click
    useEffect(() => {
        /** Close open dropdowns when clicking outside their container. */
        function handleClick(e: MouseEvent) {
            if (countyDropdownRef.current && !countyDropdownRef.current.contains(e.target as Node) &&
                countyInputRef.current && !countyInputRef.current.contains(e.target as Node)) {
                setShowCountyDropdown(false);
            }
            if (stateDropdownRef.current && !stateDropdownRef.current.contains(e.target as Node) &&
                stateInputRef.current && !stateInputRef.current.contains(e.target as Node)) {
                setShowStateDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    // Save handler
    const handleSave = useCallback(async () => {
        if (!state || !county) return;
        setSaving(true);
        setSaved(false);
        setSaveError(null);
        try {
            await upsertSettings({
                state,
                county,
                courtName: courtName || undefined,
                causeNumber: causeNumber || undefined,
                assignedJudge: assignedJudge || undefined,
                judicialDistrict: judicialDistrict || undefined,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);

            // Fire-and-forget: refresh the Resources Hub for the new location.
            // The API route's upsert handles overwriting any existing cache.
            fetch('/api/resources/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    state,
                    county,
                    courtName: courtName || undefined,
                    causeNumber: causeNumber || undefined,
                    hasOpenCase: !!causeNumber,
                }),
            }).catch((err) => console.warn('[CourtSettings] Resource lookup failed (non-blocking):', err));
        } catch (error) {
            console.error('Failed to save court settings:', error);
            setSaveError('Failed to save settings. Please try again.');
        } finally {
            setSaving(false);
        }
    }, [state, county, courtName, causeNumber, assignedJudge, judicialDistrict, upsertSettings]);

    // AI Verify handler
    const handleVerify = useCallback(async () => {
        if (!state || !county) return;
        setVerifying(true);
        setVerifyResult(null);
        setVerifyError(null);
        try {
            const response = await fetch('/api/court-rules/lookup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    state,
                    county,
                    courtName: courtName || undefined,
                    settingsId: existingSettings?._id,
                }),
            });
            if (!response.ok) {
                throw new Error(`Verification failed: ${response.status}`);
            }
            const data = await response.json();
            setVerifyResult({
                confidence: data.confidence ?? 0,
                sources: data.sources ?? [],
            });
        } catch (error) {
            console.error('AI verification failed:', error);
            setVerifyError('AI verification failed. Please try again.');
        } finally {
            setVerifying(false);
        }
    }, [state, county, courtName, existingSettings]);

    return (
        <PageContainer>
            <PageHeader
                icon={Gavel}
                title="Court Settings"
                description="Calibrate your jurisdiction. Configure your legal parameters so every document hits with pinpoint local accuracy."
            />

            {/* Court Location Section */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="card-premium p-6 mb-8 border border-[var(--cloud-light)] bg-white/60"
            >
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-full bg-[var(--cloud)] flex items-center justify-center">
                        <MapPin size={16} className="text-[var(--champagne)]" weight="bold" />
                    </div>
                    <h2 className="text-sm font-semibold tracking-widest uppercase text-[var(--sapphire-dark)]">
                        Jurisdiction Setup
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pl-2">
                    {/* State Dropdown */}
                    <div className="relative">
                        <label htmlFor="court-state-input" className="block text-xs font-semibold mb-2 text-[var(--sapphire-base)] uppercase tracking-wide">
                            State <span className="text-[var(--champagne)]">*</span>
                        </label>
                        <div className="relative">
                            <input
                                ref={stateInputRef}
                                type="text"
                                value={showStateDropdown ? stateQuery : state}
                                onChange={(e) => {
                                    setStateQuery(e.target.value);
                                    setShowStateDropdown(true);
                                }}
                                onFocus={() => {
                                    setShowStateDropdown(true);
                                    setStateQuery('');
                                }}
                                placeholder="Select state..."
                                className="input-premium w-full text-sm bg-white/80 focus:bg-white text-[var(--sapphire-dark)] placeholder:text-[var(--sapphire-light)]"
                                id="court-state-input"
                            />
                            <CaretDown
                                size={14}
                                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--sapphire-base)]"
                                weight="bold"
                            />
                        </div>
                        <AnimatePresence>
                            {showStateDropdown && (
                                <motion.div
                                    ref={stateDropdownRef}
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    className="absolute z-50 w-full mt-2 max-h-48 overflow-y-auto rounded-xl shadow-lg border border-[var(--cloud-light)] bg-white/95 backdrop-blur-md"
                                >
                                    {filteredStates.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => {
                                                setState(s);
                                                setCounty('');
                                                setCountyQuery('');
                                                setShowStateDropdown(false);
                                                setStateQuery('');
                                            }}
                                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-slate-100 cursor-pointer ${
                                                s === state ? 'text-[#0A1128] font-bold' : 'text-[#334155] font-medium'
                                            }`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* County Typeahead */}
                    <div className="relative">
                        <label htmlFor="court-county-input" className="block text-xs font-semibold mb-2 text-[var(--sapphire-base)] uppercase tracking-wide">
                            County <span className="text-[var(--champagne)]">*</span>
                        </label>
                        <div className="relative">
                            <input
                                ref={countyInputRef}
                                type="text"
                                value={showCountyDropdown ? countyQuery : county}
                                onChange={(e) => {
                                    setCountyQuery(e.target.value);
                                    setShowCountyDropdown(true);
                                }}
                                onFocus={() => {
                                    setShowCountyDropdown(true);
                                    setCountyQuery('');
                                }}
                                placeholder={state ? 'Start typing county...' : 'Select state first'}
                                disabled={!state}
                                className="input-premium w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-white/80 focus:bg-white text-[var(--sapphire-dark)] placeholder:text-[var(--sapphire-light)]"
                                id="court-county-input"
                            />
                            <MagnifyingGlass
                                size={14}
                                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--sapphire-base)]"
                                weight="bold"
                            />
                        </div>
                        <AnimatePresence>
                            {showCountyDropdown && state && filteredCounties.length > 0 && (
                                <motion.div
                                    ref={countyDropdownRef}
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    className="absolute z-50 w-full mt-2 max-h-48 overflow-y-auto rounded-xl shadow-lg border border-[var(--cloud-light)] bg-white/95 backdrop-blur-md"
                                >
                                    {filteredCounties.map((c) => (
                                        <button
                                            key={c}
                                            onClick={() => {
                                                setCounty(c);
                                                setCountyQuery('');
                                                setShowCountyDropdown(false);
                                            }}
                                            className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-slate-100 cursor-pointer ${
                                                c === county ? 'text-[#0A1128] font-bold' : 'text-[#334155] font-medium'
                                            }`}
                                        >
                                            {c} County
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Court Name */}
                    <div className="md:col-span-2">
                        <label htmlFor="court-name-input" className="block text-xs font-semibold mb-2 text-[var(--sapphire-base)] uppercase tracking-wide">
                            Court Name <span className="text-[var(--sapphire-light)] font-normal text-[10px] ml-1">(Optional)</span>
                        </label>
                        <input
                            type="text"
                            value={courtName}
                            onChange={(e) => setCourtName(e.target.value)}
                            placeholder="e.g. 328th District Court"
                            className="input-premium w-full text-sm bg-white/80 focus:bg-white text-[var(--sapphire-dark)] placeholder:text-[var(--sapphire-light)]"
                            id="court-name-input"
                        />
                    </div>
                </div>
            </motion.div>

            {/* Case Details Section */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="card-premium p-6 mb-8 border border-[var(--cloud-light)] bg-white/60"
            >
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-8 h-8 rounded-full bg-[var(--cloud)] flex items-center justify-center">
                        <FileText size={16} className="text-[var(--champagne)]" weight="bold" />
                    </div>
                    <h2 className="text-sm font-semibold tracking-widest uppercase text-[var(--sapphire-dark)]">
                        Case Specifics
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pl-2">
                    <div>
                        <label htmlFor="cause-number-input" className="block text-xs font-semibold mb-2 text-[var(--sapphire-base)] uppercase tracking-wide">
                            Cause Number
                        </label>
                        <input
                            type="text"
                            value={causeNumber}
                            onChange={(e) => setCauseNumber(e.target.value)}
                            placeholder="e.g. 24-DCV-123456"
                            className="input-premium w-full text-sm bg-white/80 focus:bg-white text-[var(--sapphire-dark)] placeholder:text-[var(--sapphire-light)]"
                            id="cause-number-input"
                        />
                    </div>
                    <div>
                        <label htmlFor="judge-input" className="block text-xs font-semibold mb-2 text-[var(--sapphire-base)] uppercase tracking-wide">
                            Assigned Judge
                        </label>
                        <div className="relative">
                            <User
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sapphire-light)]"
                                weight="bold"
                            />
                            <input
                                type="text"
                                value={assignedJudge}
                                onChange={(e) => setAssignedJudge(e.target.value)}
                                placeholder="e.g. Hon. Jane Smith"
                                className="input-premium w-full !pl-10 pr-4 text-sm bg-white/80 focus:bg-white text-[var(--sapphire-dark)] placeholder:text-[var(--sapphire-light)]"
                                id="judge-input"
                            />
                        </div>
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="judicial-district-input" className="block text-xs font-semibold mb-2 text-[var(--sapphire-base)] uppercase tracking-wide">
                            Judicial District
                        </label>
                        <div className="relative">
                            <Buildings
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sapphire-light)]"
                                weight="bold"
                            />
                            <input
                                type="text"
                                value={judicialDistrict}
                                onChange={(e) => setJudicialDistrict(e.target.value)}
                                placeholder="e.g. 328th Judicial District"
                                className="input-premium w-full !pl-10 pr-4 text-sm bg-white/80 focus:bg-white text-[var(--sapphire-dark)] placeholder:text-[var(--sapphire-light)]"
                                id="judicial-district-input"
                            />
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* AI Verification Section */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="card-premium p-6 mb-8 border border-[var(--champagne)]/30 bg-gradient-to-br from-white to-[var(--pearl)] shadow-sm"
            >
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-[var(--champagne)]/10 flex items-center justify-center">
                        <Gavel size={18} className="text-[var(--champagne)]" weight="duotone" />
                    </div>
                    <h2 className="text-sm font-semibold tracking-widest uppercase text-[var(--sapphire-dark)]">
                        Court Rules Verification
                    </h2>
                </div>
                <p className="text-sm mb-6 text-[var(--sapphire-base)] leading-relaxed pl-2">
                    NEXX will search official court websites and local rules to verify formatting
                    requirements for your selected court. This ensures your documents comply with
                    local filing standards.
                </p>

                <div className="flex items-center gap-4 pl-2">
                    <button
                        onClick={handleVerify}
                        disabled={!state || !county || verifying}
                        className="relative overflow-hidden px-8 py-4 rounded-[1.25rem] text-[13px] font-bold tracking-[0.1em] uppercase flex items-center gap-3 transition-all duration-300 shadow-[0_16px_40px_rgba(0,0,0,0.5),inset_0_1px_2px_rgba(255,255,255,0.4)] hover:shadow-[0_24px_54px_rgba(0,0,0,0.7),inset_0_2px_4px_rgba(255,255,255,0.6)] hover:-translate-y-1.5 disabled:translate-y-0 disabled:opacity-50 border border-[rgba(255,255,255,0.3)] hover:border-[rgba(255,255,255,0.6)] backdrop-blur-3xl bg-[linear-gradient(135deg,rgba(255,255,255,0.1),rgba(255,255,255,0.02))] text-white group"
                    >
                        {/* Glossy top highlight overlay */}
                        <div className="absolute inset-0 rounded-[1.25rem] bg-[linear-gradient(to_bottom,rgba(255,255,255,0.15)_0%,transparent_40%)] pointer-events-none" />
                        {/* Hover shimmer effect */}
                        <div className="absolute inset-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-20deg] group-hover:animate-shimmer pointer-events-none" />
                        
                        {verifying ? (
                            <>
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                >
                                    <Gavel size={20} className="text-[#F7F2EB] drop-shadow-md" weight="fill" />
                                </motion.div>
                                <span className="relative z-10 drop-shadow-md">Verifying Framework...</span>
                            </>
                        ) : (
                            <>
                                <Gavel size={20} className="text-[#F7F2EB] group-hover:rotate-[-12deg] transition-transform drop-shadow-md" weight="fill" />
                                <span className="relative z-10 drop-shadow-md">Verify with NEXX</span>
                            </>
                        )}
                    </button>

                    {existingSettings?.aiVerified && (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--success)] bg-[var(--success)]/10 px-3 py-1.5 rounded-full border border-[var(--success)]/20">
                            <Check size={14} weight="bold" /> AI Verified
                        </span>
                    )}

                    {verifyError && (
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--error)] bg-[var(--error)]/10 px-3 py-1.5 rounded-full border border-[var(--error)]/20">
                            <Warning size={14} weight="bold" /> {verifyError}
                        </span>
                    )}
                </div>

                {/* Verify Results */}
                <AnimatePresence>
                    {verifyResult && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-6 rounded-xl p-5 border border-[var(--cloud-light)] bg-white/80 shadow-inner">
                                <div className="flex items-center gap-2 mb-3">
                                    {verifyResult.confidence > 0.5 ? (
                                        <Check size={18} className="text-[var(--success)]" weight="bold" />
                                    ) : (
                                        <Warning size={18} className="text-[#FF9800]" weight="bold" />
                                    )}
                                    <span className="text-sm font-semibold text-[var(--sapphire-dark)]">
                                        Confidence: {Math.round(verifyResult.confidence * 100)}%
                                    </span>
                                </div>
                                {verifyResult.sources.length > 0 && (
                                    <div className="mt-3">
                                        <span className="text-xs font-bold uppercase tracking-widest text-[var(--sapphire-light)]">Sources:</span>
                                        <ul className="mt-2 space-y-1.5 pl-1">
                                            {verifyResult.sources.slice(0, 3).map((url) => {
                                                try {
                                                    const parsed = new URL(url);
                                                    if (!['http:', 'https:'].includes(parsed.protocol)) {
                                                        return null;
                                                    }
                                                    return (
                                                        <li key={parsed.href}>
                                                            <a
                                                                href={parsed.href}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-sm truncate block hover:underline text-[var(--sapphire-base)] hover:text-[var(--sapphire-dark)]"
                                                            >
                                                                {parsed.hostname}
                                                            </a>
                                                        </li>
                                                    );
                                                } catch {
                                                    return null;
                                                }
                                            })}
                                        </ul>
                                    </div>
                                )}
                                {verifyResult.confidence === 0 && (
                                    <p className="text-sm mt-3 text-[var(--sapphire-base)] italic">
                                        No specific formatting rules found for this court. Default state rules will be applied.
                                    </p>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Save Button */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-center gap-4"
            >
                <button
                    onClick={handleSave}
                    disabled={!state || !county || saving}
                    className="btn-primary flex items-center gap-3 px-8 py-4 text-base shadow-md disabled:opacity-50"
                >
                    {saving ? (
                        'Saving Configuration...'
                    ) : saved ? (
                        <>
                            <Check size={20} weight="bold" /> Configuration Saved
                        </>
                    ) : (
                        <>
                            <FloppyDisk size={20} weight="bold" /> Save Court Settings
                        </>
                    )}
                </button>

                <AnimatePresence>
                    {saveError && (
                        <motion.span
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -10 }}
                            className="text-sm font-medium text-[var(--error)] flex items-center gap-1.5"
                        >
                            <Warning size={16} weight="bold" />
                            {saveError}
                        </motion.span>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Info Footer */}
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-center text-xs mt-10 text-[var(--sapphire-light)] font-medium"
            >
                Court settings directly inform NEXX for precision formatting of generated legal filings.
            </motion.p>
        </PageContainer>
    );
}
