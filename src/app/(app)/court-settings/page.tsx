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
    Scroll,
} from '@phosphor-icons/react';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';

type CaseTitleFormat = '' | 'name_v_name' | 'in_interest_of' | 'in_matter_of_marriage' | 'in_re_marriage' | 'custom';

const CASE_TITLE_OPTIONS: { value: CaseTitleFormat; label: string; example: string }[] = [
    { value: 'name_v_name', label: 'Name v. Name', example: 'SMITH, Petitioner v. JONES, Respondent' },
    { value: 'in_interest_of', label: 'In the Interest of (SAPCR)', example: 'IN THE INTEREST OF [CHILD], A CHILD' },
    { value: 'in_matter_of_marriage', label: 'In the Matter of the Marriage of', example: 'IN THE MATTER OF THE MARRIAGE OF SMITH AND JONES' },
    { value: 'in_re_marriage', label: 'In Re Marriage of', example: 'IN RE MARRIAGE OF SMITH AND JONES' },
    { value: 'custom', label: 'Custom', example: 'Enter your own case caption' },
];

/** Court settings page for configuring state, county, judge, and cause number. */
export default function CourtSettingsPage() {
    const existingSettings = useQuery(api.courtSettings.get);
    const nexProfile = useQuery(api.nexProfiles.getByUser);
    const currentUser = useQuery(api.users.me);
    const upsertSettings = useMutation(api.courtSettings.upsert);
    const updateProfile = useMutation(api.users.updateProfile);

    // Form state
    const [state, setState] = useState('');
    const [county, setCounty] = useState('');
    const [courtName, setCourtName] = useState('');
    const [causeNumber, setCauseNumber] = useState('');
    const [assignedJudge, setAssignedJudge] = useState('');
    const [judicialDistrict, setJudicialDistrict] = useState('');
    const [caseTitleFormat, setCaseTitleFormat] = useState<CaseTitleFormat>('');
    const [caseTitleCustom, setCaseTitleCustom] = useState('');
    const [respondentLegalName, setRespondentLegalName] = useState('');
    const [petitionerLegalName, setPetitionerLegalName] = useState('');
    const [petitionerRole, setPetitionerRole] = useState<'' | 'petitioner' | 'respondent'>('');
    const [childrenCount, setChildrenCount] = useState(0);
    const [children, setChildren] = useState<{ name: string; age: string }[]>([]);

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
    // Mark initialized once the query resolves (even if null) so NEX autofill can fire.
    useEffect(() => {
        if (initializedRef.current) return;
        // existingSettings is undefined while loading, null if no record exists
        if (existingSettings === undefined) return;
        // Wait for currentUser to resolve before attempting autofill
        if (existingSettings === null && currentUser === undefined) return;

        if (existingSettings) {
            setState(existingSettings.state || '');
            setCounty(existingSettings.county || '');
            setCourtName(existingSettings.courtName || '');
            setCauseNumber(existingSettings.causeNumber || '');
            setAssignedJudge(existingSettings.assignedJudge || '');
            setJudicialDistrict(existingSettings.judicialDistrict || '');
            setCaseTitleFormat((existingSettings.caseTitleFormat as CaseTitleFormat) || '');
            setCaseTitleCustom(existingSettings.caseTitleCustom || '');
            setRespondentLegalName(existingSettings.respondentLegalName || '');
            setPetitionerLegalName(existingSettings.petitionerLegalName || '');
            setPetitionerRole((existingSettings.petitionerRole as '' | 'petitioner' | 'respondent') || '');
            const existingChildren = existingSettings.children
                ?? (existingSettings.childrenNames
                    ? existingSettings.childrenNames.map((n: string, i: number) => ({
                        name: n,
                        age: existingSettings.childrenAges?.[i] ?? 0,
                    }))
                    : []);
            const count = existingChildren.length || existingSettings.childrenCount || 0;
            setChildrenCount(count);
            setChildren(existingChildren.length > 0
                ? existingChildren.map((c: Record<string, unknown>) => ({ name: String(c.name ?? ''), age: String(c.age ?? '') }))
                : Array.from({ length: count }, () => ({ name: '', age: '' })));
            initializedRef.current = true;
        } else if (currentUser) {
            // No court settings yet but user profile has children data — autofill
            const userChildren = currentUser.children
                ?? (currentUser.childrenNames
                    ? currentUser.childrenNames.map((n: string, i: number) => ({
                        name: n,
                        age: currentUser.childrenAges?.[i] ?? 0,
                    }))
                    : []);
            if (userChildren.length > 0) {
                setChildrenCount(userChildren.length);
                setChildren(userChildren.map((c: { name: string; age: number }) => ({ name: c.name, age: String(c.age) })));
            }
            initializedRef.current = true;
        }
    }, [existingSettings, currentUser]);

    // Auto-populate opposing party name from NEX profile if not already set
    // nexProfile.legalName is the NEX (opposing party), not the current user
    const autofilledRef = useRef(false);
    useEffect(() => {
        if (nexProfile?.legalName && !respondentLegalName && initializedRef.current && !autofilledRef.current) {
            setRespondentLegalName(nexProfile.legalName);
            autofilledRef.current = true;
        }
    }, [nexProfile?.legalName, respondentLegalName]);

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
                caseTitleFormat: caseTitleFormat || undefined,
                caseTitleCustom: caseTitleCustom || undefined,
                respondentLegalName: respondentLegalName || undefined,
                petitionerLegalName: petitionerLegalName || undefined,
                petitionerRole: petitionerRole || undefined,
                children: children.length > 0
                    ? children.map(c => ({ name: c.name, age: parseInt(c.age) || 0 }))
                    : undefined,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);

            // Bidirectional sync: push children data back to users table
            if (currentUser && children.length > 0) {
                try {
                    await updateProfile({
                        id: currentUser._id,
                        children: children.map(c => ({ name: c.name, age: parseInt(c.age) || 0 })),
                        childrenCount: children.length,
                        childrenNames: children.map(c => c.name),
                        childrenAges: children.map(c => parseInt(c.age) || 0),
                    });
                } catch (e) {
                    console.warn('[CourtSettings] User profile children sync failed (non-blocking):', e);
                }
            }

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
    }, [state, county, courtName, causeNumber, assignedJudge, judicialDistrict, caseTitleFormat, caseTitleCustom, respondentLegalName, petitionerLegalName, petitionerRole, children, upsertSettings, currentUser, updateProfile]);

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

            {/* Case Title & Parties Section */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
                className="card-premium p-6 mb-8 border border-[var(--champagne)]/30 bg-gradient-to-br from-white to-[var(--pearl)] shadow-sm"
            >
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-[var(--champagne)]/10 flex items-center justify-center">
                        <Scroll size={18} className="text-[var(--champagne)]" weight="duotone" />
                    </div>
                    <h2 className="text-sm font-semibold tracking-widest uppercase text-[var(--sapphire-dark)]">
                        Case Title &amp; Parties
                    </h2>
                </div>
                <p className="text-sm mb-6 text-[var(--sapphire-base)] leading-relaxed pl-2">
                    Configure how parties are named and how the case caption appears on generated documents.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                    <div>
                        <label htmlFor="petitioner-name-input" className="block text-xs font-semibold mb-2 text-[var(--sapphire-base)] uppercase tracking-wide">
                            Your Legal Name
                        </label>
                        <div className="relative">
                            <User
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sapphire-light)]"
                                weight="bold"
                            />
                            <input
                                type="text"
                                value={petitionerLegalName}
                                onChange={(e) => setPetitionerLegalName(e.target.value)}
                                placeholder="Your full legal name as it appears on court docs"
                                className="input-premium w-full !pl-10 pr-4 text-sm bg-white/80 focus:bg-white text-[var(--sapphire-dark)] placeholder:text-[var(--sapphire-light)]"
                                id="petitioner-name-input"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold mb-2 text-[var(--sapphire-base)] uppercase tracking-wide">
                            Your Role in Case
                        </label>
                        <div className="flex gap-2">
                            {(['petitioner', 'respondent'] as const).map((role) => (
                                <button
                                    key={role}
                                    type="button"
                                    onClick={() => setPetitionerRole(role)}
                                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                                        petitionerRole === role
                                            ? 'bg-[var(--champagne)]/15 border-[var(--champagne)]/40 text-[var(--sapphire-dark)] shadow-sm'
                                            : 'bg-white/50 border-[var(--cloud)] text-[var(--sapphire-light)] hover:border-[var(--sapphire-light)]'
                                    }`}
                                >
                                    {role === 'petitioner' ? '✦ Petitioner' : '✦ Respondent'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
                    <div>
                        <label htmlFor="respondent-name-input" className="block text-xs font-semibold mb-2 text-[var(--sapphire-base)] uppercase tracking-wide">
                            Opposing Party Legal Name
                        </label>
                        <div className="relative">
                            <User
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--sapphire-light)]"
                                weight="bold"
                            />
                            <input
                                type="text"
                                value={respondentLegalName}
                                onChange={(e) => setRespondentLegalName(e.target.value)}
                                placeholder="Full legal name of the opposing party"
                                className="input-premium w-full !pl-10 pr-4 text-sm bg-white/80 focus:bg-white text-[var(--sapphire-dark)] placeholder:text-[var(--sapphire-light)]"
                                id="respondent-name-input"
                            />
                        </div>
                        {nexProfile?.legalName && respondentLegalName !== nexProfile.legalName && (
                            <button
                                type="button"
                                onClick={() => setRespondentLegalName(nexProfile.legalName!)}
                                className="text-[11px] text-[var(--champagne)] mt-1.5 hover:underline"
                            >
                                Sync opposing party from NEX Profile: {nexProfile.legalName}
                            </button>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-semibold mb-2 text-[var(--sapphire-base)] uppercase tracking-wide">
                            Opposing Party Role
                        </label>
                        <div className="text-sm text-[var(--sapphire-dark)] p-3 rounded-xl bg-white/60 border border-[var(--cloud)]">
                            {petitionerRole === 'petitioner'
                                ? '✦ Respondent'
                                : petitionerRole === 'respondent'
                                    ? '✦ Petitioner'
                                    : '⚠ Select your role above'
                            }
                </div>
            </div>
        </div>

                <div className="mb-6">
                    <label className="block text-xs font-semibold mb-3 text-[var(--sapphire-base)] uppercase tracking-wide">
                        Children Involved
                    </label>
                    <div className="flex items-center gap-3 mb-4">
                        <label htmlFor="children-count-input" className="text-sm text-[var(--sapphire-base)]">
                            How many children?
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={12}
                            value={childrenCount || ''}
                            onChange={(e) => {
                                const count = Math.max(0, Math.min(12, parseInt(e.target.value) || 0));
                                setChildrenCount(count);
                                // Grow or shrink the children array
                                setChildren(prev => {
                                    if (count > prev.length) return [...prev, ...Array.from({ length: count - prev.length }, () => ({ name: '', age: '' }))];
                                    return prev.slice(0, count);
                                });
                            }}
                            className="input-premium w-20 text-sm text-center bg-white/80 focus:bg-white text-[var(--sapphire-dark)]"
                            id="children-count-input"
                        />
                    </div>
                    {childrenCount > 0 && (
                        <div className="space-y-3">
                            {children.map((child, i) => (
                                <div key={i} className="grid grid-cols-[1fr_80px] gap-3 items-end">
                                    <div>
                                        <label htmlFor={`child-name-${i}`} className="block text-[11px] font-semibold mb-1.5 text-[var(--sapphire-light)] uppercase tracking-wide">
                                            Child {i + 1} — Full Legal Name
                                        </label>
                                        <input
                                            type="text"
                                            value={child.name}
                                            onChange={(e) => {
                                                const updated = [...children];
                                                updated[i] = { ...updated[i], name: e.target.value };
                                                setChildren(updated);
                                            }}
                                            placeholder={`Child ${i + 1} full name`}
                                            className="input-premium w-full text-sm bg-white/80 focus:bg-white text-[var(--sapphire-dark)] placeholder:text-[var(--sapphire-light)]"
                                            id={`child-name-${i}`}
                                        />
                                    </div>
                                    <div>
                                        <label htmlFor={`child-age-${i}`} className="block text-[11px] font-semibold mb-1.5 text-[var(--sapphire-light)] uppercase tracking-wide">
                                            Age
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            max={25}
                                            value={child.age}
                                            onChange={(e) => {
                                                const updated = [...children];
                                                updated[i] = { ...updated[i], age: e.target.value };
                                                setChildren(updated);
                                            }}
                                            className="input-premium w-full text-sm text-center bg-white/80 focus:bg-white text-[var(--sapphire-dark)]"
                                            id={`child-age-${i}`}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Case Title Format */}
                <div className="mb-6">
                    <label className="block text-xs font-semibold mb-3 text-[var(--sapphire-base)] uppercase tracking-wide">
                        Case Title Format
                    </label>
                    <div className="space-y-2.5" role="radiogroup" aria-label="Case Title Format">
                        {CASE_TITLE_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                role="radio"
                                aria-checked={caseTitleFormat === option.value}
                                tabIndex={caseTitleFormat === option.value ? 0 : -1}
                                onClick={() => setCaseTitleFormat(option.value)}
                                className={`w-full text-left p-3.5 rounded-xl transition-all border ${
                                    caseTitleFormat === option.value
                                        ? 'bg-[var(--champagne)]/10 border-[var(--champagne)]/40 shadow-sm'
                                        : 'bg-white/50 border-[var(--cloud)] hover:border-[var(--sapphire-light)]'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                        caseTitleFormat === option.value
                                            ? 'border-[var(--champagne)] bg-[var(--champagne)]'
                                            : 'border-[var(--cloud-dark)]'
                                    }`}>
                                        {caseTitleFormat === option.value && (
                                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                        )}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-[var(--sapphire-dark)]">{option.label}</p>
                                        <p className="text-[11px] text-[var(--sapphire-light)] mt-0.5 font-mono">{option.example}</p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Custom Caption */}
                {caseTitleFormat === 'custom' && (
                    <div className="mb-6">
                        <label htmlFor="custom-caption-input" className="block text-xs font-semibold mb-2 text-[var(--sapphire-base)] uppercase tracking-wide">
                            Custom Case Caption
                        </label>
                        <textarea
                            value={caseTitleCustom}
                            onChange={(e) => setCaseTitleCustom(e.target.value)}
                            placeholder="Enter your custom case caption exactly as it should appear..."
                            rows={3}
                            className="input-premium w-full text-sm bg-white/80 focus:bg-white text-[var(--sapphire-dark)] placeholder:text-[var(--sapphire-light)] resize-none"
                            id="custom-caption-input"
                        />
                    </div>
                )}

                {/* Live Preview */}
                {caseTitleFormat && (
                    <div className="bg-[#0A1128] rounded-xl p-5 border border-[rgba(255,255,255,0.1)]">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-3">Caption Preview</p>
                        <div className="font-mono text-[12px] text-white/80 leading-relaxed whitespace-pre-line">
                            {caseTitleFormat === 'name_v_name' && (() => {
                                const opposingName = (respondentLegalName || '[OPPOSING PARTY]').toUpperCase();
                                const userName = (petitionerLegalName || '[YOUR NAME]').toUpperCase();
                                if (petitionerRole === 'petitioner') {
                                    return <>{userName}, Petitioner{'\n'}v.{'\n'}{opposingName}, Respondent</>;
                                } else if (petitionerRole === 'respondent') {
                                    return <>{opposingName}, Petitioner{'\n'}v.{'\n'}{userName}, Respondent</>;
                                } else {
                                    return <>{userName}, [ROLE]{'\n'}v.{'\n'}{opposingName}, [ROLE]</>;
                                }
                            })()}

                            {caseTitleFormat === 'in_interest_of' && (() => {
                                const names = children.map(c => c.name).filter(Boolean);
                                const childLabel = names.length > 0
                                    ? names.map(n => n.toUpperCase()).join(', ')
                                    : '[CHILD NAME(S)]';
                                const pluralLabel = names.length > 1 ? 'CHILDREN' : 'A CHILD';
                                return <>IN THE INTEREST OF{'\n'}{childLabel},{'\n'}{pluralLabel}</>;
                            })()}
                            {caseTitleFormat === 'in_matter_of_marriage' && (() => {
                                const name1 = (petitionerLegalName || 'PARTY 1').toUpperCase().split(' ').pop();
                                const name2 = (respondentLegalName || 'PARTY 2').toUpperCase().split(' ').pop();
                                return <>IN THE MATTER OF THE MARRIAGE OF{'\n'}{name1} AND {name2}</>;
                            })()}
                            {caseTitleFormat === 'in_re_marriage' && (() => {
                                const name1 = (petitionerLegalName || 'PARTY 1').toUpperCase().split(' ').pop();
                                const name2 = (respondentLegalName || 'PARTY 2').toUpperCase().split(' ').pop();
                                return <>IN RE MARRIAGE OF{'\n'}{name1} AND {name2}</>;
                            })()}
                            {caseTitleFormat === 'custom' && (
                                <>{caseTitleCustom || 'Your custom caption will appear here...'}</>
                            )}
                        </div>
                    </div>
                )}
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
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--success)] bg-[var(--success)]/10 px-3 py-1.5 rounded-full border border-[var(--success)]/20 shadow-sm backdrop-blur-md">
                            <Check size={14} weight="bold" /> NEXX Verified
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
                            <div className="mt-6 rounded-[1.5rem] p-5 border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                                <div className="flex items-center gap-2 mb-3">
                                    {verifyResult.confidence > 0.5 ? (
                                        <Check size={18} className="text-[var(--success)]" weight="bold" />
                                    ) : (
                                        <Warning size={18} className="text-[#FF9800]" weight="bold" />
                                    )}
                                    <span className="text-sm font-semibold text-white/90 tracking-wide">
                                        Confidence: {Math.round(verifyResult.confidence * 100)}%
                                    </span>
                                </div>
                                {verifyResult.sources.length > 0 && (
                                    <div className="mt-3">
                                        <span className="text-xs font-bold uppercase tracking-widest text-white/50">Sources:</span>
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
                                                                className="text-sm truncate block hover:underline text-[#60A5FA] hover:text-white transition-colors"
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
                                    <p className="text-sm mt-3 text-white/60 italic">
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
