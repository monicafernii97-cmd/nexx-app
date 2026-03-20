'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import {
    Siren,
    Brain,
    ChatTeardropText,
    Lightning,
    FloppyDisk,
    Check,
    Warning,
    Sparkle,
    Plus,
    X,
} from '@phosphor-icons/react';

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
        description: '',
        behaviors: [] as string[],
        communicationStyle: '',
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
                description: nexProfile.description || '',
                behaviors: nexProfile.behaviors || [],
                communicationStyle: nexProfile.communicationStyle || '',
                manipulationTactics: nexProfile.manipulationTactics || [],
                triggerPatterns: nexProfile.triggerPatterns || [],
            });
        }
    }, [nexProfile]);

    const toggleItem = (field: 'behaviors' | 'manipulationTactics', item: string) => {
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
        setSaving(true);
        setError(null);
        try {
            if (nexProfile) {
                await updateProfile({
                    id: nexProfile._id,
                    behaviors: form.behaviors,
                    nickname: form.nickname || undefined,
                    relationship: form.relationship || undefined,
                    description: form.description || undefined,
                    communicationStyle: form.communicationStyle || undefined,
                    manipulationTactics: form.manipulationTactics.length > 0 ? form.manipulationTactics : undefined,
                    triggerPatterns: form.triggerPatterns.length > 0 ? form.triggerPatterns : undefined,
                });
            } else {
                await createProfile({
                    behaviors: form.behaviors,
                    nickname: form.nickname || undefined,
                    relationship: form.relationship || undefined,
                    description: form.description || undefined,
                    communicationStyle: form.communicationStyle || undefined,
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
        <div className="max-w-4xl mx-auto pb-20">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8">
                    <div>
                        <div className="flex items-center gap-4 mb-3">
                            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white shadow-sm border border-[var(--cloud-light)]">
                                <Siren size={28} className="text-[var(--error)]" weight="duotone" />
                            </div>
                            <h1 className="text-4xl font-light tracking-tight text-[var(--sapphire-dark)]">
                                NEX Target Profile
                            </h1>
                        </div>
                        <p className="text-base text-[var(--sapphire-base)] max-w-2xl leading-relaxed">
                            Document your high-conflict individual&apos;s behavioral patterns. This structural mapping enables NEXX to decode and proactively intercept tactical manipulation sequences.
                        </p>
                    </div>

                    <div className="flex flex-col items-end shrink-0 pt-2">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="btn-primary w-full md:w-auto px-8 py-3.5 text-sm flex items-center justify-center gap-3 shadow-md hover:shadow-lg disabled:opacity-50 transition-all font-semibold uppercase tracking-wider group"
                        >
                            {saved ? <Check size={18} weight="bold" /> : <FloppyDisk size={18} weight="bold" className="group-hover:scale-110 transition-transform" />}
                            {saving ? 'Saving...' : saved ? 'Saved Successfully' : 'Save Archetype'}
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
                </div>

                <div className="space-y-6">
                    {/* ── NEX Overview ── */}
                    <Section icon={<Siren size={20} className="text-[var(--sapphire-base)]" weight="duotone" />} title="Archetype Definition">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pl-1">
                            <div>
                                <label className="text-xs font-semibold mb-2 block text-[var(--sapphire-base)] uppercase tracking-wide">
                                    Target Alias / Codename
                                </label>
                                <input
                                    className="input-premium w-full text-sm placeholder:text-[var(--sapphire-light)] text-[var(--sapphire-dark)]"
                                    value={form.nickname}
                                    onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                                    placeholder='e.g. "The Narc", "Voldemort"'
                                />
                                <p className="text-xs font-medium text-[var(--sapphire-light)] mt-1.5">NEXX uses this alias in chat interfaces.</p>
                            </div>
                            <div>
                                <label className="text-xs font-semibold mb-2 block text-[var(--sapphire-base)] uppercase tracking-wide">
                                    Relationship Vector
                                </label>
                                <select
                                    className="input-premium w-full text-sm text-[var(--sapphire-dark)] bg-white/80 focus:bg-white"
                                    value={form.relationship}
                                    onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                                >
                                    <option value="" disabled>Select Role Dynamics</option>
                                    <option value="ex-spouse">Ex-Spouse</option>
                                    <option value="ex-partner">Ex-Partner</option>
                                    <option value="co-parent">Co-Parent</option>
                                    <option value="parent">Parent</option>
                                    <option value="sibling">Sibling</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                        <div className="mt-5 pl-1">
                            <label className="text-xs font-semibold mb-2 block text-[var(--sapphire-base)] uppercase tracking-wide">
                                Operational Baseline
                            </label>
                            <textarea
                                className="input-premium w-full text-sm placeholder:text-[var(--sapphire-light)] text-[var(--sapphire-dark)] resize-none"
                                rows={3}
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="Summarize the core conflict dynamic: e.g., 'Utilizes silent treatments followed by intense financial control threats. Highly litigious.'"
                            />
                        </div>
                    </Section>

                    {/* ── Behavioral Patterns ── */}
                    <Section icon={<Brain size={20} className="text-[var(--champagne)]" weight="duotone" />} title="Symptomatic Behaviors">
                        <p className="text-sm mb-4 text-[var(--sapphire-base)] pl-1">
                            Select all observed mechanisms of control. NEXX utilizes this index to anticipate behavioral pivots during correspondence logic mapping.
                        </p>
                        <div className="flex flex-wrap gap-2.5 pl-1">
                            {BEHAVIOR_OPTIONS.map((behavior) => {
                                const selected = form.behaviors.includes(behavior);
                                return (
                                    <button
                                        key={behavior}
                                        onClick={() => toggleItem('behaviors', behavior)}
                                        type="button"
                                        aria-pressed={selected}
                                        className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide uppercase transition-all duration-300 border shadow-sm ${
                                            selected 
                                                ? 'bg-gradient-to-r from-[var(--champagne)]/20 to-[var(--champagne)]/5 border-[var(--champagne)] text-[var(--sapphire-dark)] shadow-[0_2px_10px_rgba(229,168,74,0.15)]' 
                                                : 'bg-white border-[var(--cloud-light)] text-[var(--sapphire-base)] hover:border-[var(--sapphire-light)] hover:text-[var(--sapphire-dark)]'
                                        }`}
                                    >
                                        {behavior}
                                    </button>
                                );
                            })}
                        </div>
                    </Section>

                    {/* ── Communication Style ── */}
                    <Section icon={<ChatTeardropText size={20} className="text-[#3b82f6]" weight="duotone" />} title="Linguistic Footprint">
                        <p className="text-sm mb-4 text-[var(--sapphire-base)] pl-1">
                            Identify the primary dialect framework of their communication.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-1">
                            {COMMUNICATION_STYLES.map((style) => (
                                <button
                                    key={style.value}
                                    onClick={() => setForm({ ...form, communicationStyle: style.value })}
                                    type="button"
                                    aria-pressed={form.communicationStyle === style.value}
                                    className={`text-left p-5 rounded-2xl transition-all duration-300 border ${
                                        form.communicationStyle === style.value 
                                            ? 'bg-gradient-to-br from-white to-[var(--pearl)] border-[var(--sapphire-base)]/40 shadow-md ring-1 ring-[var(--sapphire-base)]/10 scale-[1.02]' 
                                            : 'bg-white/60 border-[var(--cloud-light)] hover:bg-white hover:border-[var(--sapphire-light)] shadow-sm hover:shadow-md'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-1.5">
                                        <p className={`text-sm font-bold tracking-wide uppercase ${form.communicationStyle === style.value ? 'text-[var(--sapphire-dark)]' : 'text-[var(--sapphire-base)]'}`}>
                                            {style.label}
                                        </p>
                                        {form.communicationStyle === style.value && (
                                            <Check size={16} weight="bold" className="text-[var(--champagne)]" />
                                        )}
                                    </div>
                                    <p className={`text-xs font-medium leading-relaxed ${form.communicationStyle === style.value ? 'text-[var(--sapphire-dark)]' : 'text-[var(--sapphire-light)]'}`}>
                                        {style.description}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </Section>

                    {/* ── Manipulation Tactics ── */}
                    <Section icon={<Warning size={20} className="text-[var(--error)]" weight="duotone" />} title="Known Manipulation Vectors">
                        <p className="text-sm mb-4 text-[var(--sapphire-base)] pl-1">
                            Select tactics historically deployed against you. NEXX scans messages specifically for these tactical signatures.
                        </p>
                        <div className="flex flex-wrap gap-2.5 pl-1">
                            {MANIPULATION_OPTIONS.map((tactic) => {
                                const selected = form.manipulationTactics.includes(tactic);
                                return (
                                    <button
                                        key={tactic}
                                        onClick={() => toggleItem('manipulationTactics', tactic)}
                                        type="button"
                                        aria-pressed={selected}
                                        className={`px-4 py-2 rounded-full text-xs font-semibold tracking-wide uppercase transition-all duration-300 border shadow-sm ${
                                            selected 
                                                ? 'bg-gradient-to-r from-[var(--error)]/10 to-[var(--error)]/5 border-[var(--error)] text-[#A72B2B] shadow-[0_2px_10px_rgba(200,60,60,0.1)]' 
                                                : 'bg-white border-[var(--cloud-light)] text-[var(--sapphire-base)] hover:border-[var(--sapphire-light)] hover:text-[#A72B2B]'
                                        }`}
                                    >
                                        {tactic}
                                    </button>
                                );
                            })}
                        </div>
                    </Section>

                    {/* ── Trigger Patterns ── */}
                    <Section icon={<Lightning size={20} className="text-[#a855f7]" weight="duotone" />} title="Escalation Triggers">
                        <p className="text-sm mb-4 text-[var(--sapphire-base)] pl-1">
                            What specific catalysts provoke narcissistic injury and rage? Document known flashpoints.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 mb-4 pl-1">
                            <div className="relative flex-1">
                                <Lightning size={16} weight="duotone" className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--sapphire-light)]" />
                                <input
                                    className="input-premium pl-10 w-full text-sm placeholder:text-[var(--sapphire-light)] text-[var(--sapphire-dark)]"
                                    value={newTrigger}
                                    onChange={(e) => setNewTrigger(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && addTrigger()}
                                    placeholder="e.g. 'Setting boundaries around scheduling'"
                                />
                            </div>
                            <button
                                onClick={addTrigger}
                                type="button"
                                disabled={!newTrigger.trim()}
                                aria-label="Add trigger vector"
                                className="btn-outline flex items-center justify-center gap-2 py-3 px-6 text-sm disabled:opacity-50"
                            >
                                <Plus size={16} weight="bold" />
                                <span className="sm:hidden lg:inline">Add Vector</span>
                            </button>
                        </div>
                        <AnimatePresence>
                            {form.triggerPatterns.length > 0 && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-2.5 pl-1 overflow-hidden">
                                    {form.triggerPatterns.map((trigger, i) => (
                                        <motion.div
                                            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ delay: i * 0.05 }}
                                            key={trigger}
                                            className="group flex items-center justify-between px-4 py-3 rounded-xl bg-white border border-[var(--cloud-light)] shadow-sm hover:shadow-md transition-all hover:border-[var(--sapphire-light)]"
                                        >
                                            <span className="text-sm font-medium text-[var(--sapphire-dark)] break-words pr-4">{trigger}</span>
                                            <button
                                                onClick={() => removeTrigger(trigger)}
                                                type="button"
                                                aria-label={`Remove trigger pattern`}
                                                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-[var(--cloud)]/50 group-hover:bg-[var(--error)]/10 text-[var(--sapphire-base)] group-hover:text-[var(--error)] transition-colors"
                                            >
                                                <X size={14} weight="bold" />
                                            </button>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </Section>

                    {/* ── AI Insights (read-only) ── */}
                    {nexProfile?.aiInsights && (
                        <Section icon={<Sparkle size={20} className="text-[#3b82f6]" weight="fill" />} title="AI Threat Analysis Summary">
                            <div className="card-premium p-6 border border-[#3b82f6]/20 bg-gradient-to-br from-white to-[#eff6ff] shadow-sm ml-1">
                                <p className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--sapphire-dark)] font-medium">
                                    {nexProfile.aiInsights}
                                </p>
                                
                                {nexProfile.dangerLevel !== undefined && (
                                    <div className="mt-6 flex items-center gap-4 pt-4 border-t border-[var(--cloud)]">
                                        <span className="text-xs font-bold uppercase tracking-widest text-[var(--sapphire-base)]">Lethality Index:</span>
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
            </motion.div>
        </div>
    );
}

/* ── Helper Component ── */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="card-premium p-7 border border-[var(--cloud-light)] bg-white/60 relative overflow-hidden group"
        >
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[var(--champagne)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-[var(--cloud)] shadow-inner">
                    {icon}
                </div>
                <h2 className="text-lg font-bold tracking-tight text-[var(--sapphire-dark)]">{title}</h2>
            </div>
            <div className="space-y-4 relative z-10">{children}</div>
        </motion.div>
    );
}
