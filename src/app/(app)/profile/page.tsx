'use client';

import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import {
    User,
    MapPin,
    Users,
    Scale,
    Briefcase,
    Heart,
    Save,
    Check,
    Sparkles,
} from 'lucide-react';
import { US_STATES } from '@/lib/constants';

const TONE_OPTIONS = [
    { value: 'direct', label: 'Direct', description: 'Concise, factual, action-oriented' },
    { value: 'gentle', label: 'Gentle', description: 'Warm, validating, supportive' },
    { value: 'strategic', label: 'Strategic', description: 'Tactical, analytical, chess-player mindset' },
    { value: 'clinical', label: 'Clinical', description: 'Professional, research-backed, precise' },
] as const;

const EMOTIONAL_STATES = [
    { value: 'calm', label: 'Calm', emoji: '😌' },
    { value: 'anxious', label: 'Anxious', emoji: '😰' },
    { value: 'angry', label: 'Angry', emoji: '😤' },
    { value: 'overwhelmed', label: 'Overwhelmed', emoji: '😵' },
    { value: 'numb', label: 'Numb', emoji: '😶' },
] as const;

type CustodyType = 'sole' | 'joint' | 'split' | 'none' | 'pending' | '';
type CourtStatus = 'pending' | 'active' | 'closed' | 'none' | '';
type TonePreference = 'direct' | 'gentle' | 'strategic' | 'clinical' | '';
type EmotionalState = 'calm' | 'anxious' | 'angry' | 'overwhelmed' | 'numb' | '';

export default function ProfilePage() {
    const user = useQuery(api.users.me);
    const updateProfile = useMutation(api.users.updateProfile);

    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [form, setForm] = useState({
        name: '',
        state: '',
        county: '',
        childrenCount: 0,
        childrenAges: [] as number[],
        childrenNames: [] as string[],
        courtCaseNumber: '',
        custodyType: '' as CustodyType,
        hasAttorney: false,
        hasTherapist: false,
        courtStatus: '' as CourtStatus,
        tonePreference: '' as TonePreference,
        emotionalState: '' as EmotionalState,
    });

    // Sync form with loaded user data
    useEffect(() => {
        if (user) {
            setForm({
                name: user.name || '',
                state: user.state || '',
                county: user.county || '',
                childrenCount: user.childrenCount || 0,
                childrenAges: user.childrenAges || [],
                childrenNames: user.childrenNames || [],
                courtCaseNumber: user.courtCaseNumber || '',
                custodyType: user.custodyType || '',
                hasAttorney: user.hasAttorney || false,
                hasTherapist: user.hasTherapist || false,
                courtStatus: user.courtStatus || '',
                tonePreference: user.tonePreference || '',
                emotionalState: user.emotionalState || '',
            });
        }
    }, [user]);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        setError(null);
        try {
            await updateProfile({
                id: user._id,
                name: form.name || undefined,
                state: form.state || undefined,
                county: form.county || undefined,
                childrenCount: form.childrenCount,
                childrenAges: form.childrenAges.length > 0 ? form.childrenAges : undefined,
                childrenNames: form.childrenNames.length > 0 ? form.childrenNames : undefined,
                courtCaseNumber: form.courtCaseNumber || undefined,
                custodyType: form.custodyType || undefined,
                hasAttorney: form.hasAttorney,
                hasTherapist: form.hasTherapist,
                courtStatus: form.courtStatus || undefined,
                tonePreference: form.tonePreference || undefined,
                emotionalState: form.emotionalState || undefined,
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (err) {
            console.error('Failed to save profile:', err);
            setError('Failed to save profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const updateChildName = (index: number, name: string) => {
        const names = [...form.childrenNames];
        names[index] = name;
        setForm({ ...form, childrenNames: names });
    };

    const updateChildAge = (index: number, age: number) => {
        const ages = [...form.childrenAges];
        ages[index] = age;
        setForm({ ...form, childrenAges: ages });
    };

    useEffect(() => {
        // Sync arrays when childrenCount changes
        setForm(prev => {
            const count = prev.childrenCount;
            if (count > prev.childrenNames.length) {
                return {
                    ...prev,
                    childrenNames: [...prev.childrenNames, ...Array(count - prev.childrenNames.length).fill('')],
                    childrenAges: [...prev.childrenAges, ...Array(count - prev.childrenAges.length).fill(0)],
                };
            } else if (count < prev.childrenNames.length) {
                return {
                    ...prev,
                    childrenNames: prev.childrenNames.slice(0, count),
                    childrenAges: prev.childrenAges.slice(0, count),
                };
            }
            return prev;
        });
    }, [form.childrenCount]);

    if (!user) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="animate-pulse-gold text-sm" style={{ color: '#8A7A60' }}>Loading profile...</div>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto pb-12">
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-serif font-bold" style={{ color: '#F5EFE0' }}>
                            My Profile
                        </h1>
                        <p className="text-sm mt-1" style={{ color: '#8A7A60' }}>
                            This information helps NEXX personalize your experience.
                        </p>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium cursor-pointer transition-all duration-200 hover:-translate-y-0.5"
                        style={{
                            background: saved ? 'rgba(90, 158, 111, 0.2)' : 'linear-gradient(135deg, #C58B07, #E5B84A)',
                            color: saved ? '#5A9E6F' : '#02022d',
                            border: saved ? '1px solid rgba(90, 158, 111, 0.3)' : 'none',
                        }}
                    >
                        {saved ? <Check size={16} /> : <Save size={16} />}
                        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
                    </button>
                    {error && (
                        <p className="text-xs mt-1" style={{ color: '#C75A5A' }}>{error}</p>
                    )}
                </div>

                <div className="space-y-6">
                    {/* ── Personal Info ── */}
                    <Section icon={<User size={18} />} title="Personal Information">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Full Name">
                                <input
                                    className="input-gilded w-full"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="Your name"
                                />
                            </Field>
                            <Field label="Email">
                                <input
                                    className="input-gilded w-full"
                                    value={user.email || ''}
                                    disabled
                                    style={{ opacity: 0.6 }}
                                />
                                <p className="text-xs mt-1" style={{ color: '#5A4A30' }}>Managed by Clerk</p>
                            </Field>
                        </div>
                    </Section>

                    {/* ── Location ── */}
                    <Section icon={<MapPin size={18} />} title="Location">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="State">
                                <select
                                    className="input-gilded w-full"
                                    value={form.state}
                                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                                >
                                    <option value="">Select state</option>
                                    {US_STATES.map((s) => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="County">
                                <input
                                    className="input-gilded w-full"
                                    value={form.county}
                                    onChange={(e) => setForm({ ...form, county: e.target.value })}
                                    placeholder="e.g. Los Angeles"
                                />
                            </Field>
                        </div>
                    </Section>

                    {/* ── Children ── */}
                    <Section icon={<Users size={18} />} title="Children">
                        <Field label="Number of Children">
                            <select
                                className="input-gilded w-full max-w-[200px]"
                                value={form.childrenCount}
                                onChange={(e) => setForm({ ...form, childrenCount: parseInt(e.target.value) || 0 })}
                            >
                                {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </Field>
                        {form.childrenCount > 0 && (
                            <div className="mt-4 space-y-3">
                                {Array.from({ length: form.childrenCount }).map((_, i) => (
                                    <div key={i} className="grid grid-cols-2 gap-3">
                                        <Field label={`Child ${i + 1} Name`}>
                                            <input
                                                className="input-gilded w-full"
                                                value={form.childrenNames[i] || ''}
                                                onChange={(e) => updateChildName(i, e.target.value)}
                                                placeholder="First name (optional)"
                                            />
                                        </Field>
                                        <Field label="Age">
                                            <input
                                                className="input-gilded w-full"
                                                type="number"
                                                min={0}
                                                max={18}
                                                value={form.childrenAges[i] ?? ''}
                                                onChange={(e) => updateChildAge(i, parseInt(e.target.value) || 0)}
                                                placeholder="Age"
                                            />
                                        </Field>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Section>

                    {/* ── Legal ── */}
                    <Section icon={<Scale size={18} />} title="Legal Situation">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Custody Type">
                                <select
                                    className="input-gilded w-full"
                                    value={form.custodyType}
                                    onChange={(e) => setForm({ ...form, custodyType: e.target.value as CustodyType })}
                                >
                                    <option value="">Select</option>
                                    <option value="sole">Sole Custody</option>
                                    <option value="joint">Joint Custody</option>
                                    <option value="split">Split Custody</option>
                                    <option value="pending">Pending</option>
                                    <option value="none">No Custody Order</option>
                                </select>
                            </Field>
                            <Field label="Court Status">
                                <select
                                    className="input-gilded w-full"
                                    value={form.courtStatus}
                                    onChange={(e) => setForm({ ...form, courtStatus: e.target.value as CourtStatus })}
                                >
                                    <option value="">Select</option>
                                    <option value="active">Active Case</option>
                                    <option value="pending">Pending</option>
                                    <option value="closed">Closed</option>
                                    <option value="none">No Court Case</option>
                                </select>
                            </Field>
                            <Field label="Court Case Number (optional)">
                                <input
                                    className="input-gilded w-full"
                                    value={form.courtCaseNumber}
                                    onChange={(e) => setForm({ ...form, courtCaseNumber: e.target.value })}
                                    placeholder="e.g. 24-FL-12345"
                                />
                            </Field>
                        </div>
                    </Section>

                    {/* ── Support Team ── */}
                    <Section icon={<Briefcase size={18} />} title="Support Team">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <label className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors hover:bg-[rgba(197,139,7,0.04)]"
                                style={{ border: '1px solid rgba(197, 139, 7, 0.1)' }}>
                                <input
                                    type="checkbox"
                                    checked={form.hasAttorney}
                                    onChange={(e) => setForm({ ...form, hasAttorney: e.target.checked })}
                                    className="accent-[#C58B07] w-4 h-4"
                                />
                                <div>
                                    <p className="text-sm font-medium" style={{ color: '#F5EFE0' }}>I have an attorney</p>
                                    <p className="text-xs" style={{ color: '#8A7A60' }}>NEXX will suggest coordinating with counsel</p>
                                </div>
                            </label>
                            <label className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-colors hover:bg-[rgba(197,139,7,0.04)]"
                                style={{ border: '1px solid rgba(197, 139, 7, 0.1)' }}>
                                <input
                                    type="checkbox"
                                    checked={form.hasTherapist}
                                    onChange={(e) => setForm({ ...form, hasTherapist: e.target.checked })}
                                    className="accent-[#C58B07] w-4 h-4"
                                />
                                <div>
                                    <p className="text-sm font-medium" style={{ color: '#F5EFE0' }}>I have a therapist</p>
                                    <p className="text-xs" style={{ color: '#8A7A60' }}>NEXX will suggest discussing emotional impacts</p>
                                </div>
                            </label>
                        </div>
                    </Section>

                    {/* ── NEXX Personalization ── */}
                    <Section icon={<Sparkles size={18} />} title="NEXX Personalization">
                        <Field label="How should NEXX speak to you?">
                            <div className="grid grid-cols-2 gap-3 mt-1">
                                {TONE_OPTIONS.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setForm({ ...form, tonePreference: opt.value })}
                                        className="text-left px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer"
                                        style={{
                                            background: form.tonePreference === opt.value ? 'rgba(197, 139, 7, 0.12)' : 'rgba(197, 139, 7, 0.03)',
                                            border: `1px solid ${form.tonePreference === opt.value ? 'rgba(197, 139, 7, 0.4)' : 'rgba(197, 139, 7, 0.08)'}`,
                                        }}
                                    >
                                        <p className="text-sm font-medium" style={{ color: form.tonePreference === opt.value ? '#C58B07' : '#F5EFE0' }}>{opt.label}</p>
                                        <p className="text-xs mt-0.5" style={{ color: '#8A7A60' }}>{opt.description}</p>
                                    </button>
                                ))}
                            </div>
                        </Field>

                        <Field label="How are you feeling right now?">
                            <p className="text-xs mb-2" style={{ color: '#5A4A30' }}>
                                This adjusts NEXX&apos;s language style only — never the substance of advice.
                            </p>
                            <div className="flex flex-wrap gap-2 mt-1">
                                {EMOTIONAL_STATES.map((s) => (
                                    <button
                                        key={s.value}
                                        onClick={() => setForm({ ...form, emotionalState: s.value })}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer"
                                        style={{
                                            background: form.emotionalState === s.value ? 'rgba(197, 139, 7, 0.12)' : 'rgba(197, 139, 7, 0.03)',
                                            border: `1px solid ${form.emotionalState === s.value ? 'rgba(197, 139, 7, 0.4)' : 'rgba(197, 139, 7, 0.08)'}`,
                                        }}
                                    >
                                        <span>{s.emoji}</span>
                                        <span className="text-sm" style={{ color: form.emotionalState === s.value ? '#C58B07' : '#B8A88A' }}>{s.label}</span>
                                    </button>
                                ))}
                            </div>
                        </Field>
                    </Section>
                </div>
            </motion.div>
        </div>
    );
}

/* ── Helper Components ── */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-6"
            style={{
                background: 'rgba(197, 139, 7, 0.02)',
                border: '1px solid rgba(197, 139, 7, 0.1)',
            }}
        >
            <div className="flex items-center gap-2 mb-5">
                <span style={{ color: '#C58B07' }}>{icon}</span>
                <h2 className="text-lg font-semibold" style={{ color: '#F5EFE0' }}>{title}</h2>
            </div>
            <div className="space-y-4">{children}</div>
        </motion.div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#B8A88A' }}>{label}</label>
            {children}
        </div>
    );
}
