'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import {
    Siren,
    Brain,
    ChatTeardropText,
    Strategy,
    FloppyDisk,
    Check,
    Warning,
    Plus,
    X,
    Scales,
} from '@phosphor-icons/react';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';

const LEGAL_RELATION_OPTIONS = [
    "Child's Father",
    "Child's Mother",
    'Ex-Husband',
    'Ex-Wife',
    'Co-Parent',
];

const BEHAVIOR_OPTIONS = [
    'Gaslighting', 'Love-bombing', 'DARVO', 'Triangulation',
    'Silent treatment', 'Flying monkeys', 'Narcissistic rage',
    'Financial control', 'Parental alienation', 'Hoovering',
    'Future faking', 'Projection', 'Word salad', 'Blame-shifting',
    'Emotional blackmail', 'Coercive control', 'Smear campaign',
    'Isolation tactics',
];

const MANIPULATION_OPTIONS = [
    'Guilt tripping', 'Playing the victim', 'Using children as leverage',
    'Withholding information', 'False accusations', 'Public humiliation',
    'Threatening legal action', 'Financial threats', 'Emotional withdrawal',
    'Love-bombing after conflict',
];

const COMMUNICATION_STYLES = [
    { value: 'aggressive', label: 'Aggressive', description: 'Hostile, threatening, confrontational' },
    { value: 'passive-aggressive', label: 'Passive-Aggressive', description: 'Subtle digs, backhanded compliments, sarcasm' },
    { value: 'chaotic', label: 'Chaotic', description: 'Unpredictable, rapid mood shifts, contradictory' },
    { value: 'calculated', label: 'Calculated', description: 'Precise, manipulative, strategic cruelty' },
    { value: 'charming', label: 'Charming / Covert', description: 'Appears kind publicly, controlling privately' },
];

/** NEX behavioral profile builder for documenting narcissistic ex-partner patterns. */
export default function NexProfilePage() {
    const nexProfile = useQuery(api.nexProfiles.getByUser);
    const createProfile = useMutation(api.nexProfiles.create);
    const updateProfile = useMutation(api.nexProfiles.update);

    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({
        nickname: '',
        relationship: '',
        legalName: '',
        legalRelation: [] as string[],
        partyRole: '' as '' | 'petitioner' | 'respondent',
        description: '',
        behaviors: [] as string[],
        communicationStyle: [] as string[],
        manipulationTactics: [] as string[],
        triggerPatterns: [] as string[],
    });
    const [newTrigger, setNewTrigger] = useState('');

    // Sync form with loaded profile
    useEffect(() => {
        if (nexProfile) {
            setForm({
                nickname: nexProfile.nickname || '',
                relationship: nexProfile.relationship || '',
                legalName: nexProfile.legalName || '',
                legalRelation: nexProfile.legalRelation || [],
                partyRole: (nexProfile.partyRole as '' | 'petitioner' | 'respondent') || '',
                description: nexProfile.description || '',
                behaviors: nexProfile.behaviors || [],
                communicationStyle: Array.isArray(nexProfile.communicationStyle)
                    ? nexProfile.communicationStyle
                    : nexProfile.communicationStyle
                        ? [nexProfile.communicationStyle]
                        : [],
                manipulationTactics: nexProfile.manipulationTactics || [],
                triggerPatterns: nexProfile.triggerPatterns || [],
            });
        }
    }, [nexProfile]);

    const toggleItem = (field: 'behaviors' | 'manipulationTactics' | 'communicationStyle', item: string) => {
        const current = form[field];
        const updated = current.includes(item)
            ? current.filter((b) => b !== item)
            : [...current, item];
        setForm({ ...form, [field]: updated });
    };

    const addTrigger = () => {
        if (newTrigger.trim() && !form.triggerPatterns.includes(newTrigger.trim())) {
            setForm({ ...form, triggerPatterns: [...form.triggerPatterns, newTrigger.trim()] });
            setNewTrigger('');
        }
    };

    const removeTrigger = (trigger: string) => {
        setForm({ ...form, triggerPatterns: form.triggerPatterns.filter((t) => t !== trigger) });
    };

    const handleSave = async () => {
        // Guard: nexProfile === undefined means the query is still loading.
        // Wait for it to resolve to prevent duplicate creates vs. updates.
        if (nexProfile === undefined) {
            setError('Profile is still loading. Please try again in a moment.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            if (nexProfile) {
                await updateProfile({
                    id: nexProfile._id,
                    behaviors: form.behaviors,
                    nickname: form.nickname || undefined,
                    relationship: form.relationship || undefined,
                    legalName: form.legalName || undefined,
                    legalRelation: form.legalRelation.length > 0 ? form.legalRelation : undefined,
                    partyRole: form.partyRole || undefined,
                    description: form.description || undefined,
                    communicationStyle: form.communicationStyle.length > 0 ? form.communicationStyle : undefined,
                    manipulationTactics: form.manipulationTactics.length > 0 ? form.manipulationTactics : undefined,
                    triggerPatterns: form.triggerPatterns.length > 0 ? form.triggerPatterns : undefined,
                });
            } else {
                await createProfile({
                    behaviors: form.behaviors,
                    nickname: form.nickname || undefined,
                    relationship: form.relationship || undefined,
                    legalName: form.legalName || undefined,
                    legalRelation: form.legalRelation.length > 0 ? form.legalRelation : undefined,
                    partyRole: form.partyRole || undefined,
                    description: form.description || undefined,
                    communicationStyle: form.communicationStyle.length > 0 ? form.communicationStyle : undefined,
                    manipulationTactics: form.manipulationTactics.length > 0 ? form.manipulationTactics : undefined,
                    triggerPatterns: form.triggerPatterns.length > 0 ? form.triggerPatterns : undefined,
                });
            }
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err) {
            console.error('Failed to save NEX profile:', err);
            setError('Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <PageContainer>
            <PageHeader
                icon={Siren}
                title="NEX Profile"
                description="Decode the playbook. Map their behavioral patterns so NEXX can predict, expose, and neutralize manipulation tactics."
                rightElement={
                    <div className="flex flex-col items-end shrink-0 pt-2">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] text-white rounded-lg px-4 py-2 text-xs flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md disabled:opacity-50 transition-all font-medium"
                        >
                            {saved ? <Check size={18} weight="bold" /> : <FloppyDisk size={18} weight="bold" />}
                            {saving ? 'Saving...' : saved ? 'Saved Successfully' : 'Save Profile'}
                        </button>
                        <AnimatePresence>
                            {error && (
                                <motion.p 
                                    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                                    className="text-xs font-semibold mt-2 text-[var(--error)] flex items-center gap-1.5"
                                >
                                    <Warning size={14} weight="bold" /> {error}
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>
                }
            />

                <div className="space-y-5">
                    {/* ── NEX Overview ── */}
                    <Section icon={<Siren size={16} className="text-rose" weight="duotone" />} title="NEX Overview">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="text-sm text-white mb-2 block">
                                    Nickname for your NEX
                                </label>
                                <input
                                    className="w-full text-sm p-2 rounded-lg bg-white text-[#0A1128] focus:outline-none focus:ring-2 focus:ring-[#1A4B9B]"
                                    value={form.nickname}
                                    onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                                    placeholder='e.g. "The NEX", a codename'
                                />
                                <p className="text-xs text-[rgba(255,255,255,0.7)] mt-1.5">NEXX will use this term in conversations</p>
                            </div>
                            <div>
                                <label className="text-sm text-white mb-2 block">
                                    Relationship
                                </label>
                                <select
                                    className="w-full text-sm p-2 rounded-lg bg-white text-[#0A1128] focus:outline-none focus:ring-2 focus:ring-[#1A4B9B]"
                                    value={form.relationship}
                                    onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                                >
                                    <option value="" disabled>Select</option>
                                    <option value="ex-spouse">Ex-Spouse</option>
                                    <option value="ex-partner">Ex-Partner</option>
                                    <option value="co-parent">Co-Parent</option>
                                    <option value="parent">Parent</option>
                                    <option value="sibling">Sibling</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                        <div className="mt-5">
                            <label className="text-sm text-white mb-2 block">
                                Brief Description
                            </label>
                            <textarea
                                className="w-full text-base p-3 rounded-xl bg-white text-[#0A1128] resize-none focus:outline-none focus:ring-2 focus:ring-[#1A4B9B]"
                                rows={3}
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="Briefly describe your NEX's personality and the dynamic..."
                            />
                        </div>
                    </Section>

                    {/* ── Legal Identity ── */}
                    <Section icon={<Scales size={16} className="text-[#60A5FA]" weight="duotone" />} title="Legal Identity">
                        <p className="text-[13px] text-white/90 mb-4">
                            These details ensure NEXX refers to the opposing party appropriately in court documents, incident reports, and generated filings.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-5">
                            <div>
                                <label className="text-sm text-white mb-2 block">
                                    Full Legal Name
                                </label>
                                <input
                                    className="w-full text-base p-3 rounded-xl bg-white text-[#0A1128] focus:outline-none focus:ring-2 focus:ring-[#1A4B9B]"
                                    value={form.legalName}
                                    onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                                    placeholder="Their full legal name as it appears on court documents"
                                />
                                <p className="text-xs text-[rgba(255,255,255,0.7)] mt-1.5">Used in court document captions and filings</p>
                            </div>
                            <div>
                                <label className="text-sm text-white mb-2 block">
                                    Party Role in Case
                                </label>
                                <select
                                    className="w-full text-base p-3 rounded-xl bg-white text-[#0A1128] focus:outline-none focus:ring-2 focus:ring-[#1A4B9B]"
                                    value={form.partyRole}
                                    onChange={(e) => setForm({ ...form, partyRole: e.target.value as '' | 'petitioner' | 'respondent' })}
                                >
                                    <option value="" disabled>Select their role</option>
                                    <option value="respondent">Respondent (you are the Petitioner)</option>
                                    <option value="petitioner">Petitioner (you are the Respondent)</option>
                                </select>
                                <p className="text-xs text-[rgba(255,255,255,0.7)] mt-1.5">Determines name placement in case captions</p>
                            </div>
                        </div>
                        <div>
                            <label className="text-sm text-white mb-2 block">
                                Court Designations
                            </label>
                            <p className="text-xs text-[rgba(255,255,255,0.6)] mb-3">Select all that apply — NEXX will use the most appropriate designation based on context.</p>
                            <div className="flex flex-wrap gap-2.5">
                                {LEGAL_RELATION_OPTIONS.map((relation) => {
                                    const selected = form.legalRelation.includes(relation);
                                    return (
                                        <button
                                            key={relation}
                                            onClick={() => {
                                                const updated = selected
                                                    ? form.legalRelation.filter((r) => r !== relation)
                                                    : [...form.legalRelation, relation];
                                                setForm({ ...form, legalRelation: updated });
                                            }}
                                            type="button"
                                            aria-pressed={selected}
                                            className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all border ${
                                                selected
                                                    ? 'bg-[#123D7E] text-white border-transparent'
                                                    : 'bg-transparent border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.8)] hover:bg-[#123D7E]/20 hover:text-white'
                                            }`}
                                        >
                                            {relation}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </Section>

                    {/* ── Behavioral Patterns ── */}
                    <Section icon={<Brain size={16} className="text-purple-400" weight="duotone" />} title="Behavioral Patterns">
                        <p className="text-[13px] text-white/90 mb-4">
                            Select all behaviors you&apos;ve observed. NEXX will flag these proactively in conversations.
                        </p>
                        <div className="flex flex-wrap gap-2.5">
                            {BEHAVIOR_OPTIONS.map((behavior) => {
                                const selected = form.behaviors.includes(behavior);
                                return (
                                    <button
                                        key={behavior}
                                        onClick={() => toggleItem('behaviors', behavior)}
                                        type="button"
                                        aria-pressed={selected}
                                        className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all border ${
                                            selected 
                                                ? 'bg-[#123D7E] text-white border-transparent' 
                                                : 'bg-transparent border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.8)] hover:bg-[#123D7E]/20 hover:text-white'
                                        }`}
                                    >
                                        {behavior}
                                    </button>
                                );
                            })}
                        </div>
                    </Section>

                    {/* ── Communication Style ── */}
                    <Section icon={<ChatTeardropText size={16} className="text-emerald" weight="duotone" />} title="Communication Style">
                        <p className="text-[13px] text-white/90 mb-4">
                            How does your NEX typically communicate?
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {COMMUNICATION_STYLES.map((style) => (
                                <button
                                    key={style.value}
                                    onClick={() => toggleItem('communicationStyle', style.value)}
                                    type="button"
                                    aria-pressed={form.communicationStyle.includes(style.value)}
                                    className={`text-left p-3 rounded-xl transition-all border ${
                                        form.communicationStyle.includes(style.value) 
                                            ? 'bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border-transparent' 
                                            : 'bg-[#0A1128] border-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.25)]'
                                    }`}
                                >
                                    <p className="text-sm font-semibold text-white mb-0.5">
                                        {style.label}
                                    </p>
                                    <p className="text-[13px] text-white/80">
                                        {style.description}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </Section>

                    {/* ── Manipulation Tactics ── */}
                    <Section icon={<Warning size={16} color="#F59E0B" weight="duotone" />} title="Known Manipulation Tactics">
                        <p className="text-[13px] text-white/90 mb-4">
                            Select tactics your NEX uses. NEXX will watch for these in your descriptions.
                        </p>
                        <div className="flex flex-wrap gap-2.5">
                            {MANIPULATION_OPTIONS.map((tactic) => {
                                const selected = form.manipulationTactics.includes(tactic);
                                return (
                                    <button
                                        key={tactic}
                                        onClick={() => toggleItem('manipulationTactics', tactic)}
                                        type="button"
                                        aria-pressed={selected}
                                        className={`px-4 py-2 rounded-md text-[13px] font-medium transition-all border ${
                                            selected 
                                                ? 'bg-[#123D7E] text-white border-transparent' 
                                                : 'bg-transparent border-[rgba(255,255,255,0.15)] text-[rgba(255,255,255,0.8)] hover:bg-[#123D7E]/20 hover:text-white'
                                        }`}
                                    >
                                        {tactic}
                                    </button>
                                );
                            })}
                        </div>
                    </Section>

                    {/* ── Trigger Patterns ── */}
                    <Section icon={<Strategy size={16} className="text-[#60A5FA]" weight="duotone" />} title="Trigger Patterns">
                        <p className="text-[13px] text-white/90 mb-4">
                            What sets your NEX off? Add specific patterns you&apos;ve noticed.
                        </p>
                        <div className="flex gap-3 mb-4">
                            <div className="flex-1 relative">
                                <Strategy size={16} weight="bold" className="absolute left-4 top-1/2 -translate-y-1/2 text-[#1A4B9B]" />
                                <input
                                    className="w-full text-base p-3 !pl-11 rounded-xl bg-white text-[#0A1128] focus:outline-none focus:ring-2 focus:ring-[#1A4B9B]"
                                    value={newTrigger}
                                    onChange={(e) => setNewTrigger(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addTrigger()}
                                    placeholder="e.g. 'When I set boundaries around pickup times'"
                                />
                            </div>
                            <button
                                onClick={addTrigger}
                                type="button"
                                disabled={!newTrigger.trim()}
                                aria-label="Add trigger vector"
                                className="w-12 h-[50px] rounded-xl flex items-center justify-center shrink-0 border border-[rgba(255,255,255,0.2)] text-[rgba(255,255,255,0.8)] hover:bg-[rgba(255,255,255,0.1)] hover:text-white transition-colors disabled:opacity-50"
                            >
                                <Plus size={18} weight="bold" />
                            </button>
                        </div>
                        <AnimatePresence mode="popLayout">
                            {form.triggerPatterns.map((trigger, i) => (
                                <motion.div
                                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.05 }}
                                    key={trigger}
                                    className="group flex items-center justify-between px-4 py-3 rounded-2xl bg-[#0A1128] border border-[rgba(255,255,255,0.15)] shadow-sm transition-all"
                                >
                                    <span className="text-sm font-semibold text-white break-words pr-4">{trigger}</span>
                                    <button
                                        onClick={() => removeTrigger(trigger)}
                                        type="button"
                                        aria-label={`Remove trigger pattern: ${trigger}`}
                                        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[rgba(255,255,255,0.1)] group-hover:bg-[#ef4444] text-[rgba(255,255,255,0.7)] group-hover:text-white transition-colors"
                                    >
                                        <X size={14} weight="bold" />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </Section>

                    {/* ── AI Insights (read-only) ── */}
                    {nexProfile?.aiInsights && (
                        <Section icon={<Strategy size={20} className="text-[#3b82f6]" weight="duotone" />} title="NEXX Threat Analysis Summary">
                            <div className="card-premium p-6 border border-[#3b82f6]/20 bg-gradient-to-br from-white to-[#eff6ff] shadow-sm ml-1">
                                <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--sapphire-dark)] font-medium">
                                    {nexProfile.aiInsights}
                                </p>
                                
                                {nexProfile.dangerLevel !== undefined && (
                                    <>
                                    <div className="mt-6 flex items-center gap-4 pt-4 border-t border-[var(--cloud)]">
                                        <span className="text-xs font-bold uppercase tracking-widest text-[var(--sapphire-base)]">Risk Level:</span>
                                        <div className="flex gap-1.5 flex-1 max-w-[180px]">
                                            {[1, 2, 3, 4, 5].map((level) => {
                                                const isActive = level <= (nexProfile.dangerLevel ?? 0);
                                                let bgColor = 'var(--cloud)';
                                                if (isActive) {
                                                    bgColor = level >= 4 ? '#ef4444' : level >= 3 ? '#f59e0b' : '#10b981';
                                                }
                                                return (
                                                    <div
                                                        key={level}
                                                        className={`flex-1 h-2 rounded-full transition-all ${isActive ? 'opacity-100 shadow-sm' : 'opacity-40'}`}
                                                        style={{ backgroundColor: bgColor }}
                                                    />
                                                );
                                            })}
                                        </div>
                                        <span className={`text-sm font-black ${
                                            (nexProfile.dangerLevel ?? 0) >= 4 ? 'text-[#ef4444]' : (nexProfile.dangerLevel ?? 0) >= 3 ? 'text-[#f59e0b]' : 'text-[#10b981]'
                                        }`}>
                                            {nexProfile.dangerLevel}/5
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-[var(--sapphire-light)] mt-2 italic">Self-reported 1–5 scale. Not a clinical or validated safety assessment.</p>
                                    </>
                                )}
                                
                                {nexProfile.detectedPatterns && nexProfile.detectedPatterns.length > 0 && (
                                    <div className="mt-5 pt-4 border-t border-[var(--cloud)]">
                                        <span className="text-xs font-bold uppercase tracking-widest text-[var(--sapphire-base)] block mb-3">Deep Analysis Footprints:</span>
                                        <div className="flex flex-wrap gap-2">
                                            {nexProfile.detectedPatterns.map((pattern, index) => (
                                                <span
                                                    key={`${pattern}-${index}`}
                                                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide uppercase bg-black hover:bg-black/80 shadow-md text-white transition-colors"
                                                >
                                                    [{pattern}]
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </Section>
                    )}
                </div>
        </PageContainer>
    );
}

/* ── Helper Component ── */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 border border-[rgba(255,255,255,0.08)] rounded-xl bg-[#0A1128]/80 relative overflow-hidden"
        >
            <div className="flex items-center gap-2 mb-3">
                {icon}
                <h2 className="text-sm font-bold tracking-tight text-white">{title}</h2>
            </div>
            <div className="space-y-3 relative z-10">{children}</div>
        </motion.div>
    );
}
