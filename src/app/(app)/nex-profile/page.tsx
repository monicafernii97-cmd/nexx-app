'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import {
    Siren,
    Brain,
    MessageSquareWarning,
    Zap,
    Save,
    Check,
    AlertTriangle,
    Sparkles,
    Plus,
    X,
} from 'lucide-react';

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
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            console.error('Failed to save NEX profile:', err);
            setError('Failed to save. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto pb-12">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-serif font-bold" style={{ color: '#F7F2EB' }}>
                            NEX Profile
                        </h1>
                        <p className="text-sm mt-1" style={{ color: '#FFF9F0' }}>
                            Document your NEX&apos;s behavioral patterns. This helps NEXX proactively identify tactics.
                        </p>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                        style={{
                            background: saved ? 'rgba(90, 158, 111, 0.2)' : 'linear-gradient(135deg, #F7F2EB, #123D7E)',
                            color: saved ? '#5A9E6F' : '#F7F2EB',
                            border: saved ? '1px solid rgba(90, 158, 111, 0.3)' : 'none',
                        }}
                    >
                        {saved ? <Check size={16} /> : <Save size={16} />}
                        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Profile'}
                    </button>
                    {error && (
                        <p className="text-xs mt-1" style={{ color: '#C75A5A' }}>{error}</p>
                    )}
                </div>

                <div className="space-y-6">
                    {/* ── NEX Overview ── */}
                    <Section icon={<Siren size={18} />} title="NEX Overview">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-medium mb-1.5 block" style={{ color: '#D0E3FF' }}>
                                    Nickname for your NEX
                                </label>
                                <input
                                    className="input-premium w-full"
                                    value={form.nickname}
                                    onChange={(e) => setForm({ ...form, nickname: e.target.value })}
                                    placeholder='e.g. "The NEX", a codename'
                                />
                                <p className="text-xs mt-1" style={{ color: '#0A1E54' }}>NEXX will use this term in conversations</p>
                            </div>
                            <div>
                                <label className="text-xs font-medium mb-1.5 block" style={{ color: '#D0E3FF' }}>
                                    Relationship
                                </label>
                                <select
                                    className="input-premium w-full"
                                    value={form.relationship}
                                    onChange={(e) => setForm({ ...form, relationship: e.target.value })}
                                >
                                    <option value="">Select</option>
                                    <option value="ex-spouse">Ex-Spouse</option>
                                    <option value="ex-partner">Ex-Partner</option>
                                    <option value="co-parent">Co-Parent</option>
                                    <option value="parent">Parent</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>
                        <div className="mt-4">
                            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#D0E3FF' }}>
                                Brief Description
                            </label>
                            <textarea
                                className="input-premium w-full"
                                rows={3}
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                placeholder="Briefly describe your NEX's personality and the dynamic..."
                            />
                        </div>
                    </Section>

                    {/* ── Behavioral Patterns ── */}
                    <Section icon={<Brain size={18} />} title="Behavioral Patterns">
                        <p className="text-xs mb-3" style={{ color: '#FFF9F0' }}>
                            Select all behaviors you&apos;ve observed. NEXX will flag these proactively in conversations.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {BEHAVIOR_OPTIONS.map((behavior) => {
                                const selected = form.behaviors.includes(behavior);
                                return (
                                    <button
                                        key={behavior}
                                        onClick={() => toggleItem('behaviors', behavior)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200"
                                        style={{
                                            background: selected ? 'rgba(199, 90, 90, 0.15)' : 'rgba(208, 227, 255, 0.04)',
                                            border: `1px solid ${selected ? 'rgba(199, 90, 90, 0.4)' : 'rgba(208, 227, 255, 0.1)'}`,
                                            color: selected ? '#C75A5A' : '#D0E3FF',
                                        }}
                                    >
                                        {behavior}
                                    </button>
                                );
                            })}
                        </div>
                    </Section>

                    {/* ── Communication Style ── */}
                    <Section icon={<MessageSquareWarning size={18} />} title="Communication Style">
                        <p className="text-xs mb-3" style={{ color: '#FFF9F0' }}>
                            How does your NEX typically communicate?
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {COMMUNICATION_STYLES.map((style) => (
                                <button
                                    key={style.value}
                                    onClick={() => setForm({ ...form, communicationStyle: style.value })}
                                    className="text-left px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer"
                                    style={{
                                        background: form.communicationStyle === style.value ? 'rgba(208, 227, 255, 0.12)' : 'rgba(208, 227, 255, 0.03)',
                                        border: `1px solid ${form.communicationStyle === style.value ? 'rgba(208, 227, 255, 0.4)' : 'rgba(208, 227, 255, 0.08)'}`,
                                    }}
                                >
                                    <p className="text-sm font-medium" style={{ color: form.communicationStyle === style.value ? '#F7F2EB' : '#F7F2EB' }}>
                                        {style.label}
                                    </p>
                                    <p className="text-xs mt-0.5" style={{ color: '#FFF9F0' }}>{style.description}</p>
                                </button>
                            ))}
                        </div>
                    </Section>

                    {/* ── Manipulation Tactics ── */}
                    <Section icon={<AlertTriangle size={18} />} title="Known Manipulation Tactics">
                        <p className="text-xs mb-3" style={{ color: '#FFF9F0' }}>
                            Select tactics your NEX uses. NEXX will watch for these in your descriptions.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {MANIPULATION_OPTIONS.map((tactic) => {
                                const selected = form.manipulationTactics.includes(tactic);
                                return (
                                    <button
                                        key={tactic}
                                        onClick={() => toggleItem('manipulationTactics', tactic)}
                                        className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200"
                                        style={{
                                            background: selected ? 'rgba(229, 168, 74, 0.15)' : 'rgba(208, 227, 255, 0.04)',
                                            border: `1px solid ${selected ? 'rgba(229, 168, 74, 0.4)' : 'rgba(208, 227, 255, 0.1)'}`,
                                            color: selected ? '#E5A84A' : '#D0E3FF',
                                        }}
                                    >
                                        {tactic}
                                    </button>
                                );
                            })}
                        </div>
                    </Section>

                    {/* ── Trigger Patterns ── */}
                    <Section icon={<Zap size={18} />} title="Trigger Patterns">
                        <p className="text-xs mb-3" style={{ color: '#FFF9F0' }}>
                            What sets your NEX off? Add specific patterns you&apos;ve noticed.
                        </p>
                        <div className="flex gap-2 mb-3">
                            <input
                                className="input-premium flex-1"
                                value={newTrigger}
                                onChange={(e) => setNewTrigger(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addTrigger()}
                                placeholder="e.g. 'When I set boundaries around pickup times'"
                            />
                            <button
                                onClick={addTrigger}
                                className="px-3 py-2 rounded-lg cursor-pointer transition-colors hover:bg-[rgba(208, 227, 255,0.15)]"
                                style={{
                                    background: 'rgba(208, 227, 255, 0.08)',
                                    border: '1px solid rgba(208, 227, 255, 0.15)',
                                    color: '#F7F2EB',
                                }}
                            >
                                <Plus size={16} />
                            </button>
                        </div>
                        {form.triggerPatterns.length > 0 && (
                            <div className="space-y-2">
                                {form.triggerPatterns.map((trigger) => (
                                    <div
                                        key={trigger}
                                        className="flex items-center justify-between px-3 py-2 rounded-lg"
                                        style={{
                                            background: 'rgba(208, 227, 255, 0.04)',
                                            border: '1px solid rgba(208, 227, 255, 0.1)',
                                        }}
                                    >
                                        <span className="text-sm" style={{ color: '#D0E3FF' }}>{trigger}</span>
                                        <button
                                            onClick={() => removeTrigger(trigger)}
                                            className="cursor-pointer p-1 rounded hover:bg-[rgba(199,90,90,0.1)] transition-colors"
                                        >
                                            <X size={14} style={{ color: '#C75A5A' }} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Section>

                    {/* ── AI Insights (read-only) ── */}
                    {nexProfile?.aiInsights && (
                        <Section icon={<Sparkles size={18} />} title="AI Behavioral Analysis">
                            <div
                                className="p-4 rounded-xl"
                                style={{
                                    background: 'rgba(208, 227, 255, 0.04)',
                                    border: '1px solid rgba(208, 227, 255, 0.1)',
                                }}
                            >
                                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: '#D0E3FF' }}>
                                    {nexProfile.aiInsights}
                                </p>
                                {nexProfile.dangerLevel !== undefined && (
                                    <div className="mt-4 flex items-center gap-2">
                                        <span className="text-xs font-medium" style={{ color: '#FFF9F0' }}>Danger Assessment:</span>
                                        <div className="flex gap-1">
                                            {[1, 2, 3, 4, 5].map((level) => (
                                                <div
                                                    key={level}
                                                    className="w-6 h-2 rounded-full"
                                                    style={{
                                                        background: level <= (nexProfile.dangerLevel ?? 0)
                                                            ? level >= 4 ? '#C75A5A' : level >= 3 ? '#E5A84A' : '#5A9E6F'
                                                            : 'rgba(208, 227, 255, 0.08)',
                                                    }}
                                                />
                                            ))}
                                        </div>
                                        <span className="text-xs" style={{ color: '#FFF9F0' }}>
                                            {nexProfile.dangerLevel}/5
                                        </span>
                                    </div>
                                )}
                                {nexProfile.detectedPatterns && nexProfile.detectedPatterns.length > 0 && (
                                    <div className="mt-3">
                                        <span className="text-xs font-medium block mb-1.5" style={{ color: '#FFF9F0' }}>AI-Detected Patterns:</span>
                                        <div className="flex flex-wrap gap-1.5">
                                            {nexProfile.detectedPatterns.map((pattern, index) => (
                                                <span
                                                    key={`${pattern}-${index}`}
                                                    className="px-2 py-1 rounded-md text-xs"
                                                    style={{
                                                        background: 'rgba(208, 227, 255, 0.08)',
                                                        color: '#F7F2EB',
                                                    }}
                                                >
                                                    {pattern}
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
            className="rounded-2xl p-6"
            style={{
                background: 'rgba(208, 227, 255, 0.02)',
                border: '1px solid rgba(208, 227, 255, 0.1)',
            }}
        >
            <div className="flex items-center gap-2 mb-5">
                <span style={{ color: '#F7F2EB' }}>{icon}</span>
                <h2 className="text-lg font-semibold" style={{ color: '#F7F2EB' }}>{title}</h2>
            </div>
            <div className="space-y-4">{children}</div>
        </motion.div>
    );
}
