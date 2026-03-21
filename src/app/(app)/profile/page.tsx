'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import {
    User,
    MapPin,
    Users,
    Scales,
    Briefcase,
    FloppyDisk,
    Check,
    Strategy,
    Shapes,
} from '@phosphor-icons/react';
import { US_STATES } from '@/lib/constants';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';

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

type CustodyType = 'sole' | 'joint' | 'split' | 'visitation' | 'none' | 'pending' | '';
type CourtStatus = 'pending' | 'active' | 'closed' | 'none' | '';
type TonePreference = 'direct' | 'gentle' | 'strategic' | 'clinical' | '';
type EmotionalState = 'calm' | 'anxious' | 'angry' | 'overwhelmed' | 'numb' | '';

/** Ethereal User profile page for personal details, legal context, and tone preferences. */
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
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <div className="w-10 h-10 rounded-full border-2 border-sapphire border-t-transparent animate-spin" />
                <div className="text-sm font-semibold tracking-widest uppercase text-sapphire animate-pulse">Loading Profile</div>
            </div>
        );
    }

    return (
        <PageContainer>
            <PageHeader
                icon={User}
                title={
                    <>
                        Personal <span className="text-editorial shimmer">Profile</span>
                    </>
                }
                description="Your baseline of power. Establish your core context so NEXX can construct a tailored, impenetrable legal strategy for you."
                rightElement={
                    <div className="flex flex-col items-end gap-2 flex-shrink-0 pt-2">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`flex items-center gap-2.5 px-6 py-3 rounded-xl text-[14px] font-semibold cursor-pointer transition-all duration-300 shadow-md border ${
                                saved 
                                ? 'bg-emerald text-white border-transparent' 
                                : 'bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] text-white border-[rgba(255,255,255,0.2)] hover:border-[rgba(255,255,255,0.4)] hover:shadow-[0_12px_25px_rgba(26,75,155,0.6)] hover:-translate-y-0.5'
                            }`}
                        >
                            {saved ? <Check size={18} weight="bold" /> : <FloppyDisk size={18} weight={saving ? "duotone" : "bold"} className={saving ? "animate-pulse" : ""} />}
                            {saving ? 'Syncing...' : saved ? 'Synced' : 'Save Changes'}
                        </button>
                        {error && (
                            <p className="text-xs font-semibold text-rose">{error}</p>
                        )}
                    </div>
                }
            />

                <div className="grid grid-cols-1 gap-6">
                    {/* ── Personal Info ── */}
                    <Section icon={<User size={20} weight="duotone" />} title="Personal Information">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Field label="Full Legal Name">
                                <input
                                    className="input-premium"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="Your legal name"
                                />
                            </Field>
                            <Field label="Email Address">
                                <input
                                    className="input-premium bg-cloud opacity-80 cursor-not-allowed"
                                    value={user.email || ''}
                                    disabled
                                />
                                <p className="text-[11px] font-bold uppercase tracking-wider mt-2 text-sapphire-muted text-right">Managed securely via Clerk</p>
                            </Field>
                        </div>
                    </Section>

                    {/* ── Location ── */}
                    <Section icon={<MapPin size={20} weight="duotone" />} title="Jurisdiction">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <Field label="State of Filing">
                                <select
                                    className="input-premium appearance-none bg-white"
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
                                    className="input-premium"
                                    value={form.county}
                                    onChange={(e) => setForm({ ...form, county: e.target.value })}
                                    placeholder="e.g. Los Angeles"
                                />
                            </Field>
                        </div>
                    </Section>

                    {/* ── Legal & Support (Bento Row) ── */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
                        <Section icon={<Scales size={20} weight="duotone" />} title="Legal Overview">
                            <div className="space-y-5">
                                <Field label="Custody Arrangement">
                                    <select
                                        className="input-premium appearance-none bg-white"
                                        value={form.custodyType}
                                        onChange={(e) => setForm({ ...form, custodyType: e.target.value as CustodyType })}
                                    >
                                        <option value="">Select current status</option>
                                        <option value="sole">Sole Physical & Legal Custody</option>
                                        <option value="joint">Joint Custody</option>
                                        <option value="split">Split Custody</option>
                                        <option value="visitation">Visitation Rights Only</option>
                                        <option value="pending">Custody Pending</option>
                                        <option value="none">No Custody Order</option>
                                    </select>
                                </Field>
                                <div className="grid grid-cols-2 gap-4">
                                    <Field label="Court Status">
                                        <select
                                            className="input-premium appearance-none bg-white"
                                            value={form.courtStatus}
                                            onChange={(e) => setForm({ ...form, courtStatus: e.target.value as CourtStatus })}
                                        >
                                            <option value="">Select status</option>
                                            <option value="active">Active Litigation</option>
                                            <option value="pending">Pending</option>
                                            <option value="closed">Case Closed</option>
                                            <option value="none">No Court Case</option>
                                        </select>
                                    </Field>
                                    <Field label="Court Case No.">
                                        <input
                                            className="input-premium"
                                            value={form.courtCaseNumber}
                                            onChange={(e) => setForm({ ...form, courtCaseNumber: e.target.value })}
                                            placeholder="Optional"
                                        />
                                    </Field>
                                </div>
                            </div>
                        </Section>

                        <Section icon={<Briefcase size={20} weight="duotone" />} title="Support Infrastructure">
                            <div className="space-y-4">
                                <label className="flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all duration-300 bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border border-[rgba(255,255,255,0.2)] hover:border-[rgba(255,255,255,0.4)] shadow-sm hover:shadow-md">
                                    <div className="flex-shrink-0 relative">
                                        <input
                                            type="checkbox"
                                            checked={form.hasAttorney}
                                            onChange={(e) => setForm({ ...form, hasAttorney: e.target.checked })}
                                            className="peer sr-only"
                                        />
                                        <div className="w-6 h-6 rounded-md border-2 border-[rgba(255,255,255,0.4)] peer-checked:bg-white peer-checked:border-white transition-all flex items-center justify-center">
                                            {form.hasAttorney && <Check size={14} weight="bold" className="text-[#123D7E]" />}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[15px] font-semibold text-white">Active Legal Counsel</p>
                                        <p className="text-[13px] font-medium text-white/80">NEXX will format exports for attorney use</p>
                                    </div>
                                </label>
                                
                                <label className="flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all duration-300 bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] border border-[rgba(255,255,255,0.2)] hover:border-[rgba(255,255,255,0.4)] shadow-sm hover:shadow-md">
                                    <div className="flex-shrink-0 relative">
                                        <input
                                            type="checkbox"
                                            checked={form.hasTherapist}
                                            onChange={(e) => setForm({ ...form, hasTherapist: e.target.checked })}
                                            className="peer sr-only"
                                        />
                                        <div className="w-6 h-6 rounded-md border-2 border-[rgba(255,255,255,0.4)] peer-checked:bg-white peer-checked:border-white transition-all flex items-center justify-center">
                                            {form.hasTherapist && <Check size={14} weight="bold" className="text-[#123D7E]" />}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[15px] font-semibold text-white">Therapeutic Support</p>
                                        <p className="text-[13px] font-medium text-white/80">NEXX will consider emotional state in guidance</p>
                                    </div>
                                </label>
                            </div>
                        </Section>
                    </div>

                    {/* ── Children ── */}
                    <Section icon={<Users size={20} weight="duotone" />} title="Children Information">
                        <div className="mb-6">
                            <Field label="Total Number of Children Involved">
                                <select
                                    className="input-premium w-full max-w-[240px] appearance-none bg-white font-semibold"
                                    value={form.childrenCount}
                                    onChange={(e) => setForm({ ...form, childrenCount: parseInt(e.target.value) || 0 })}
                                >
                                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                                        <option key={n} value={n}>{n} {n === 1 ? 'Child' : 'Children'}</option>
                                    ))}
                                </select>
                            </Field>
                        </div>
                        {form.childrenCount > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {Array.from({ length: form.childrenCount }).map((_, i) => (
                                    <div key={i} className="flex gap-4 p-4 rounded-2xl bg-cloud/50 border border-[rgba(10,22,41,0.03)]">
                                        <div className="flex-1">
                                            <Field label={`Child ${i + 1} Name`}>
                                                <input
                                                    className="input-premium bg-white"
                                                    value={form.childrenNames[i] || ''}
                                                    onChange={(e) => updateChildName(i, e.target.value)}
                                                    placeholder="Name/Initial"
                                                />
                                            </Field>
                                        </div>
                                        <div className="w-24">
                                            <Field label="Age">
                                                <input
                                                    className="input-premium bg-white text-center"
                                                    type="number"
                                                    min={0}
                                                    max={25}
                                                    value={form.childrenAges[i] ?? ''}
                                                    onChange={(e) => updateChildAge(i, parseInt(e.target.value) || 0)}
                                                    placeholder="Age"
                                                />
                                            </Field>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Section>

                    {/* ── NEXX Personalization ── */}
                    <Section icon={<Shapes size={20} weight="duotone" className="text-champagne" />} title="NEXX Dynamics">
                        <div className="mb-6 p-4 rounded-xl bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] text-[13px] font-medium text-white/80 leading-relaxed shadow-sm">
                            <span className="font-bold text-white">Note:</span> These preferences only dictate how information is relayed to you. All facts, case details, and strategic advice from NEXX remain strictly direct and objective regardless of the chosen communication tone.
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                            <div>
                                <Field label="Communication Preference">
                                    <p className="text-[13px] font-medium text-white/70 mb-4 leading-relaxed">
                                        Select the linguistic tone NEXX should employ when generating documents and responses.
                                    </p>
                                    <div className="flex flex-col gap-3">
                                        {TONE_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.value}
                                                onClick={() => setForm({ ...form, tonePreference: opt.value })}
                                                className={`text-left p-4 rounded-2xl transition-all duration-300 cursor-pointer border ${
                                                    form.tonePreference === opt.value
                                                    ? 'bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] text-white shadow-[0_8px_20px_rgba(18,61,126,0.5)] border-[rgba(255,255,255,0.3)] scale-[1.02]'
                                                    : 'bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] border-[rgba(255,255,255,0.1)] shadow-sm hover:shadow-md text-white'
                                                }`}
                                            >
                                                <p className="text-[15px] font-bold mb-1">{opt.label}</p>
                                                <p className={`text-[13px] font-medium ${form.tonePreference === opt.value ? 'text-white/90' : 'text-white/60'}`}>
                                                    {opt.description}
                                                </p>
                                            </button>
                                        ))}
                                    </div>
                                </Field>
                            </div>

                            <div>
                                <Field label="Current Emotional State">
                                    <p className="text-[13px] font-medium text-sapphire-muted mb-4 leading-relaxed">
                                        How are you navigating this moment? NEXX will tailor advice framing to support you best.
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        {EMOTIONAL_STATES.map((s) => (
                                            <button
                                                key={s.value}
                                                onClick={() => setForm({ ...form, emotionalState: s.value })}
                                                className={`flex items-center gap-3 p-3 rounded-2xl transition-all duration-300 cursor-pointer border ${
                                                    form.emotionalState === s.value
                                                    ? 'bg-white border-champagne shadow-[0_4px_16px_rgba(212,175,55,0.15)] ring-1 ring-champagne scale-[1.02]'
                                                    : 'bg-cloud/50 border-[rgba(10,22,41,0.04)] hover:bg-white hover:shadow-sm'
                                                }`}
                                            >
                                                <span className="text-2xl">{s.emoji}</span>
                                                <span className={`text-[14px] font-semibold ${form.emotionalState === s.value ? 'text-sapphire' : 'text-sapphire-muted'}`}>
                                                    {s.label}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </Field>
                            </div>
                        </div>
                    </Section>
                </div>
        </PageContainer>
    );
}

/* ── Helper Components ── */

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
    return (
        <div className="glass-ethereal rounded-[2rem] p-6 md:p-8 bg-white/70 border-white shadow-sm">
            <div className="flex items-center gap-3 mb-6 pb-4 border-b border-[rgba(10,22,41,0.04)]">
                <div className="w-10 h-10 rounded-xl bg-cloud flex items-center justify-center shadow-inner text-sapphire">
                    {icon}
                </div>
                <h2 className="text-xl font-bold text-sapphire tracking-tight">{title}</h2>
            </div>
            <div>{children}</div>
        </div>
    );
}

/** Reusable form field wrapper */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex flex-col w-full group">
            <label className="text-[12px] font-bold tracking-widest uppercase mb-2 text-sapphire-muted group-focus-within:text-champagne transition-colors">
                {label}
            </label>
            {children}
        </div>
    );
}
