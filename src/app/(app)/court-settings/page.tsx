'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { US_STATES, searchCounties } from '@/lib/data/usCounties';
import {
    Gavel,
    MapPin,
    Save,
    Sparkles,
    Check,
    AlertTriangle,
    ChevronDown,
    Search,
    FileText,
    User,
    Building2,
} from 'lucide-react';

export default function CourtSettingsPage() {
    const existingSettings = useQuery(api.courtSettings.get);
    const upsertSettings = useMutation(api.courtSettings.upsert);
    const markVerified = useMutation(api.courtSettings.markAiVerified);

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

    // Load existing settings
    useEffect(() => {
        if (existingSettings) {
            setState(existingSettings.state || '');
            setCounty(existingSettings.county || '');
            setCourtName(existingSettings.courtName || '');
            setCauseNumber(existingSettings.causeNumber || '');
            setAssignedJudge(existingSettings.assignedJudge || '');
            setJudicialDistrict(existingSettings.judicialDistrict || '');
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
                body: JSON.stringify({ state, county, courtName: courtName || undefined }),
            });
            if (!response.ok) {
                throw new Error(`Verification failed: ${response.status}`);
            }
            const data = await response.json();
            setVerifyResult({
                confidence: data.confidence ?? 0,
                sources: data.sources ?? [],
            });

            // Auto-save the AI-verified formatting if we have settings
            if (existingSettings?._id && data.rules && Object.keys(data.rules).length > 0) {
                await markVerified({
                    id: existingSettings._id,
                    formattingOverrides: data.rules,
                });
            }
        } catch (error) {
            console.error('AI verification failed:', error);
            setVerifyError('AI verification failed. Please try again.');
        } finally {
            setVerifying(false);
        }
    }, [state, county, courtName, existingSettings, markVerified]);

    return (
        <div className="max-w-3xl mx-auto">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start justify-between mb-8"
            >
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{
                                background: 'linear-gradient(135deg, #C58B07, #E5B84A)',
                                boxShadow: '0 2px 12px rgba(197, 139, 7, 0.25)',
                            }}
                        >
                            <Gavel size={18} style={{ color: '#02022d' }} />
                        </div>
                        <h1 className="text-headline text-2xl" style={{ color: '#F5EFE0' }}>
                            Court Settings
                        </h1>
                    </div>
                    <p className="text-sm" style={{ color: '#8A7A60' }}>
                        Configure your court location and formatting preferences. These settings are used when generating legal documents.
                    </p>
                </div>
            </motion.div>

            {/* Court Location Section */}
            <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="card-gilded p-6 mb-6"
            >
                <div className="flex items-center gap-2 mb-5">
                    <MapPin size={16} style={{ color: '#C58B07' }} />
                    <h2
                        className="text-sm font-semibold tracking-[0.15em] uppercase"
                        style={{ color: '#92783A' }}
                    >
                        Court Location
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* State Dropdown */}
                    <div className="relative">
                        <label htmlFor="court-state-input" className="block text-xs font-medium mb-1.5" style={{ color: '#B8A88A' }}>
                            State <span style={{ color: '#C58B07' }}>*</span>
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
                                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
                                style={{
                                    background: 'rgba(2, 2, 45, 0.6)',
                                    border: '1px solid rgba(197, 139, 7, 0.15)',
                                    color: '#F5EFE0',
                                }}
                                id="court-state-input"
                            />
                            <ChevronDown
                                size={14}
                                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                                style={{ color: '#8A7A60' }}
                            />
                        </div>
                        <AnimatePresence>
                            {showStateDropdown && (
                                <motion.div
                                    ref={stateDropdownRef}
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-xl"
                                    style={{
                                        background: '#1A1008',
                                        border: '1px solid rgba(197, 139, 7, 0.2)',
                                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                                    }}
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
                                            className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[rgba(197,139,7,0.08)] cursor-pointer"
                                            style={{
                                                color: s === state ? '#C58B07' : '#B8A88A',
                                                fontWeight: s === state ? 600 : 400,
                                            }}
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
                        <label htmlFor="court-county-input" className="block text-xs font-medium mb-1.5" style={{ color: '#B8A88A' }}>
                            County <span style={{ color: '#C58B07' }}>*</span>
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
                                className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all disabled:opacity-40"
                                style={{
                                    background: 'rgba(2, 2, 45, 0.6)',
                                    border: '1px solid rgba(197, 139, 7, 0.15)',
                                    color: '#F5EFE0',
                                }}
                                id="court-county-input"
                            />
                            <Search
                                size={14}
                                className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                                style={{ color: '#8A7A60' }}
                            />
                        </div>
                        <AnimatePresence>
                            {showCountyDropdown && state && filteredCounties.length > 0 && (
                                <motion.div
                                    ref={countyDropdownRef}
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-xl"
                                    style={{
                                        background: '#1A1008',
                                        border: '1px solid rgba(197, 139, 7, 0.2)',
                                        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                                    }}
                                >
                                    {filteredCounties.map((c) => (
                                        <button
                                            key={c}
                                            onClick={() => {
                                                setCounty(c);
                                                setCountyQuery('');
                                                setShowCountyDropdown(false);
                                            }}
                                            className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-[rgba(197,139,7,0.08)] cursor-pointer"
                                            style={{
                                                color: c === county ? '#C58B07' : '#B8A88A',
                                                fontWeight: c === county ? 600 : 400,
                                            }}
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
                        <label htmlFor="court-name-input" className="block text-xs font-medium mb-1.5" style={{ color: '#B8A88A' }}>
                            Court Name <span className="text-xs" style={{ color: '#5A4A30' }}>(optional)</span>
                        </label>
                        <input
                            type="text"
                            value={courtName}
                            onChange={(e) => setCourtName(e.target.value)}
                            placeholder="e.g. 328th District Court"
                            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-all"
                            style={{
                                background: 'rgba(2, 2, 45, 0.6)',
                                border: '1px solid rgba(197, 139, 7, 0.15)',
                                color: '#F5EFE0',
                            }}
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
                className="card-gilded p-6 mb-6"
            >
                <div className="flex items-center gap-2 mb-5">
                    <FileText size={16} style={{ color: '#C58B07' }} />
                    <h2
                        className="text-sm font-semibold tracking-[0.15em] uppercase"
                        style={{ color: '#92783A' }}
                    >
                        Case Details
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="cause-number-input" className="block text-xs font-medium mb-1.5" style={{ color: '#B8A88A' }}>
                            Cause Number
                        </label>
                        <input
                            type="text"
                            value={causeNumber}
                            onChange={(e) => setCauseNumber(e.target.value)}
                            placeholder="e.g. 24-DCV-123456"
                            className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
                            style={{
                                background: 'rgba(2, 2, 45, 0.6)',
                                border: '1px solid rgba(197, 139, 7, 0.15)',
                                color: '#F5EFE0',
                            }}
                            id="cause-number-input"
                        />
                    </div>
                    <div>
                        <label htmlFor="judge-input" className="block text-xs font-medium mb-1.5" style={{ color: '#B8A88A' }}>
                            Assigned Judge
                        </label>
                        <div className="relative">
                            <User
                                size={14}
                                className="absolute left-3 top-1/2 -translate-y-1/2"
                                style={{ color: '#5A4A30' }}
                            />
                            <input
                                type="text"
                                value={assignedJudge}
                                onChange={(e) => setAssignedJudge(e.target.value)}
                                placeholder="e.g. Hon. Jane Smith"
                                className="w-full pl-8 pr-3 py-2.5 rounded-xl text-sm outline-none"
                                style={{
                                    background: 'rgba(2, 2, 45, 0.6)',
                                    border: '1px solid rgba(197, 139, 7, 0.15)',
                                    color: '#F5EFE0',
                                }}
                                id="judge-input"
                            />
                        </div>
                    </div>
                    <div className="md:col-span-2">
                        <label htmlFor="judicial-district-input" className="block text-xs font-medium mb-1.5" style={{ color: '#B8A88A' }}>
                            Judicial District
                        </label>
                        <div className="relative">
                            <Building2
                                size={14}
                                className="absolute left-3 top-1/2 -translate-y-1/2"
                                style={{ color: '#5A4A30' }}
                            />
                            <input
                                type="text"
                                value={judicialDistrict}
                                onChange={(e) => setJudicialDistrict(e.target.value)}
                                placeholder="e.g. 328th Judicial District"
                                className="w-full pl-8 pr-3 py-2.5 rounded-xl text-sm outline-none"
                                style={{
                                    background: 'rgba(2, 2, 45, 0.6)',
                                    border: '1px solid rgba(197, 139, 7, 0.15)',
                                    color: '#F5EFE0',
                                }}
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
                className="card-gilded p-6 mb-6"
            >
                <div className="flex items-center gap-2 mb-4">
                    <Sparkles size={16} style={{ color: '#C58B07' }} />
                    <h2
                        className="text-sm font-semibold tracking-[0.15em] uppercase"
                        style={{ color: '#92783A' }}
                    >
                        AI Court Rules Verification
                    </h2>
                </div>
                <p className="text-xs mb-4" style={{ color: '#8A7A60' }}>
                    NEXX AI will search official court websites and local rules to verify formatting
                    requirements for your selected court. This ensures your documents comply with
                    local filing standards.
                </p>

                <div className="flex items-center gap-3">
                    <button
                        onClick={handleVerify}
                        disabled={!state || !county || verifying}
                        className="btn-gold text-xs flex items-center gap-2 disabled:opacity-40"
                    >
                        {verifying ? (
                            <>
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                >
                                    <Sparkles size={14} />
                                </motion.div>
                                Verifying...
                            </>
                        ) : (
                            <>
                                <Sparkles size={14} />
                                Verify with AI
                            </>
                        )}
                    </button>

                    {existingSettings?.aiVerified && (
                        <span className="flex items-center gap-1.5 text-xs" style={{ color: '#4CAF50' }}>
                            <Check size={12} /> AI Verified
                        </span>
                    )}

                    {verifyError && (
                        <span className="flex items-center gap-1.5 text-xs" style={{ color: '#EF4444' }}>
                            <AlertTriangle size={12} /> {verifyError}
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
                            className="mt-4 rounded-xl p-4"
                            style={{
                                background: 'rgba(2, 2, 45, 0.4)',
                                border: '1px solid rgba(197, 139, 7, 0.1)',
                            }}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                {verifyResult.confidence > 0.5 ? (
                                    <Check size={14} style={{ color: '#4CAF50' }} />
                                ) : (
                                    <AlertTriangle size={14} style={{ color: '#FF9800' }} />
                                )}
                                <span className="text-xs font-medium" style={{ color: '#B8A88A' }}>
                                    Confidence: {Math.round(verifyResult.confidence * 100)}%
                                </span>
                            </div>
                            {verifyResult.sources.length > 0 && (
                                <div className="mt-2">
                                    <span className="text-xs" style={{ color: '#5A4A30' }}>Sources:</span>
                                    <ul className="mt-1 space-y-1">
                                        {verifyResult.sources.slice(0, 3).map((url, i) => (
                                            <li key={i}>
                                                <a
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs truncate block hover:underline"
                                                    style={{ color: '#C58B07' }}
                                                >
                                                    {(() => {
                                                        try { return new URL(url).hostname; }
                                                        catch { return url; }
                                                    })()}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {verifyResult.confidence === 0 && (
                                <p className="text-xs mt-2" style={{ color: '#8A7A60' }}>
                                    No specific formatting rules found for this court. Default state rules will be applied.
                                </p>
                            )}
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
                    className="btn-gold text-sm flex items-center gap-2 px-8 py-3 disabled:opacity-40"
                >
                    {saving ? (
                        'Saving...'
                    ) : saved ? (
                        <>
                            <Check size={16} /> Saved
                        </>
                    ) : (
                        <>
                            <Save size={16} /> Save Court Settings
                        </>
                    )}
                </button>

                {saved && (
                    <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-xs"
                        style={{ color: '#4CAF50' }}
                    >
                        Settings saved successfully
                    </motion.span>
                )}

                {saveError && (
                    <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-xs"
                        style={{ color: '#EF4444' }}
                    >
                        {saveError}
                    </motion.span>
                )}
            </motion.div>

            {/* Info Footer */}
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-center text-xs mt-8 mb-4"
                style={{ color: '#5A4A30' }}
            >
                Court settings are used to format legal documents per your local court&apos;s requirements.
            </motion.p>
        </div>
    );
}
