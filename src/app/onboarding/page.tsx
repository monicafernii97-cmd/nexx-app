'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useConvexAuth } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useUser } from '@/lib/user-context';
import { useClerk } from '@clerk/nextjs';
import {
    ChevronRight,
    ChevronLeft,
    Sparkles,
    MapPin,
    Users,
    Heart,
    Target,
    FileText,
    Check,
} from 'lucide-react';
import { US_STATES, ONBOARDING_STEPS } from '@/lib/constants';

/**
 * Onboarding flow for new NEXX users.
 *
 * Collects user profile data (name, state, custody arrangement, NEX behaviors,
 * goals) across a multi-step form and saves it to Convex on completion.
 *
 * Returning users who have already completed onboarding are automatically
 * redirected to the dashboard via a Convex-auth-gated guard.
 */
export default function OnboardingPage() {
    const router = useRouter();
    const { userId, isLoading: userLoading, error: userError, clerkUser } = useUser();
    const { signOut } = useClerk();

    // Wait for Convex auth to sync before querying — prevents false-null
    // from querying before the Clerk JWT is available on the Convex side.
    const { isAuthenticated: convexReady, isLoading: convexLoading } = useConvexAuth();

    // Guard: redirect returning users who already completed onboarding
    const currentUser = useQuery(api.users.me, convexReady ? {} : 'skip');
    useEffect(() => {
        if (currentUser?.onboardingComplete) {
            router.replace('/dashboard');
        }
    }, [currentUser, router]);

    // ─── Form state (must be declared before any early returns) ───
    const [currentStep, setCurrentStep] = useState(0);
    const [formData, setFormData] = useState({
        name: '',
        state: '',
        county: '',
        childrenCount: '',
        childrenAges: '',
        custodyType: '',
        hasAttorney: '',
        hasTherapist: '',
        courtStatus: '',
        nexBehaviors: [] as string[],
        nexDescription: '',
        primaryGoals: [] as string[],
        acceptedDisclaimer: false,
    });
    const updateProfile = useMutation(api.users.updateProfile);
    const completeOnboarding = useMutation(api.users.completeOnboarding);
    const createNexProfile = useMutation(api.nexProfiles.create);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    /** Terminal state: Clerk signed in but Convex auth failed to sync. */
    const convexAuthFailed = !convexLoading && !convexReady && !!clerkUser;

    // Show loading state while Convex auth is syncing
    if (
        convexLoading ||
        (convexReady && currentUser === undefined) ||
        currentUser?.onboardingComplete
    ) {
        return (
            <div className="silk-bg min-h-screen flex items-center justify-center">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                    <div
                        className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
                        style={{
                            background: 'linear-gradient(135deg, #F7F2EB, #123D7E)',
                            boxShadow: '0 8px 32px rgba(208, 227, 255, 0.3)',
                        }}
                    >
                        <span className="text-lg font-black" style={{ color: '#F7F2EB' }}>N</span>
                    </div>
                    <p className="text-sm" style={{ color: '#FFF9F0' }}>Loading...</p>
                </motion.div>
            </div>
        );
    }

    // Terminal auth error: Clerk signed in but Convex token sync failed
    if (convexAuthFailed) {
        return (
            <div className="silk-bg min-h-screen flex items-center justify-center">
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center max-w-sm px-6">
                    <div
                        className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center"
                        style={{ background: 'rgba(199, 90, 90, 0.15)', border: '1px solid rgba(199, 90, 90, 0.3)' }}
                    >
                        <span className="text-lg" style={{ color: '#C75A5A' }}>!</span>
                    </div>
                    <p className="text-sm font-semibold mb-2" style={{ color: '#F7F2EB' }}>Connection issue</p>
                    <p className="text-xs mb-5" style={{ color: '#FFF9F0' }}>
                        We couldn&apos;t sync your session. Please try signing in again.
                    </p>
                    <button onClick={() => signOut({ redirectUrl: '/' })} className="btn-outline text-xs">
                        Sign in again
                    </button>
                </motion.div>
            </div>
        );
    }

    /** Update a single field in the onboarding form data. */
    const update = <K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    /** Toggle an item in a multi-select array field (nexBehaviors or primaryGoals). */
    const toggleArrayItem = (field: 'nexBehaviors' | 'primaryGoals', item: string) => {
        setFormData((prev) => ({
            ...prev,
            [field]: prev[field].includes(item)
                ? prev[field].filter((i) => i !== item)
                : [...prev[field], item],
        }));
    };

    /** Check whether the current onboarding step has valid, required data to proceed. */
    const canProceed = () => {
        switch (currentStep) {
            case 0: return true;
            case 1: return formData.name.trim() && formData.state.trim();
            case 2: return formData.custodyType;
            case 3: return formData.nexBehaviors.length > 0;
            case 4: return formData.primaryGoals.length > 0;
            case 5: return formData.acceptedDisclaimer;
            default: return true;
        }
    };

    /** Advance to the next step or, on the final step, save profile data and redirect. */
    const handleNext = async () => {
        if (currentStep < ONBOARDING_STEPS.length - 1) {
            setCurrentStep((prev) => prev + 1);
        } else {
            if (!userId) {
                router.push('/sign-in');
                return;
            }
            // Final step — save profile data to Convex.
            // Mutations run sequentially: updateProfile → createNexProfile → completeOnboarding.
            // completeOnboarding is called last so a partial failure leaves the flag false,
            // allowing the user to retry the onboarding flow without data corruption.
            setIsSaving(true);
            setSaveError(null);
            try {
                // Update user profile with onboarding data
                // Convert childrenAges string to number array
                const parsedAges = formData.childrenAges
                    ? formData.childrenAges.split(',').map((a) => parseInt(a.trim(), 10)).filter((n) => !isNaN(n))
                    : undefined;

                // Map custodyType display values to schema enum
                const custodyMap: Record<string, 'sole' | 'joint' | 'split' | 'visitation' | 'none' | 'pending'> = {
                    'Joint / Shared Custody': 'joint',
                    'Sole Custody': 'sole',
                    'Visitation Only': 'visitation',
                    'No Order Yet': 'pending',
                    'Other': 'none',
                };

                await updateProfile({
                    id: userId,
                    name: formData.name || undefined,
                    state: formData.state || undefined,
                    county: formData.county || undefined,
                    childrenCount: formData.childrenCount ? parseInt(formData.childrenCount, 10) : undefined,
                    childrenAges: parsedAges && parsedAges.length > 0 ? parsedAges : undefined,
                    custodyType: formData.custodyType ? custodyMap[formData.custodyType] ?? undefined : undefined,
                    hasAttorney: formData.hasAttorney ? formData.hasAttorney === 'Yes' : undefined,
                    primaryGoals: formData.primaryGoals.length > 0 ? formData.primaryGoals : undefined,
                });

                // Create NEX profile with behaviors (backend mutation is idempotent)
                if (formData.nexBehaviors.length > 0) {
                    await createNexProfile({
                        behaviors: formData.nexBehaviors,
                        description: formData.nexDescription || undefined,
                    });
                }

                // Mark onboarding complete
                await completeOnboarding({ id: userId });

                router.replace('/dashboard');
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                console.error('Failed to save onboarding data:', error);
                setSaveError(message);
            } finally {
                setIsSaving(false);
            }
        }
    };

    /** NEX behavior options presented during onboarding step 3. */
    const nexBehaviorOptions = [
        'Threatens contempt / court action',
        'Micromanages my parenting',
        'Contacts schools / doctors behind my back',
        'Weaponizes child support',
        'Creates arguments over trivial items',
        'Makes false accusations',
        'Tries to alienate children from me',
        'Monitors / stalks my activities',
        'Sends hostile or manipulative messages',
        'Refuses to follow court orders',
        'Uses double standards',
        'Gaslights or rewrites history',
    ];

    /** Goal options presented during onboarding step 4. */
    const goalOptions = [
        'Respond strategically to my NEX',
        'Document incidents for court',
        'Understand my legal rights',
        'Regulate my emotions better',
        'Find an attorney',
        'File documents pro-se',
        'Prepare for court hearings',
        'Find a therapist who understands NPD',
        'Get scripts for communication',
        'Feel less alone in this',
    ];

    return (
        <div className="silk-bg min-h-screen flex items-center justify-center relative overflow-hidden">
            <div className="w-full max-w-lg mx-auto px-6 py-10 relative z-10">
                {/* Progress Bar */}
                <div className="flex items-center gap-1 mb-8">
                    {ONBOARDING_STEPS.map((_, i) => (
                        <div
                            key={i}
                            className="flex-1 h-1 rounded-full transition-all duration-500"
                            style={{
                                background: i <= currentStep
                                    ? 'linear-gradient(90deg, #F7F2EB, #123D7E)'
                                    : 'rgba(138, 122, 96, 0.15)',
                            }}
                        />
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentStep}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                    >
                        {/* Step 0: Welcome */}
                        {currentStep === 0 && (
                            <div className="text-center py-8">
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ delay: 0.2, type: 'spring' }}
                                    className="w-16 h-16 rounded-2xl mx-auto mb-6 flex items-center justify-center"
                                    style={{
                                        background: 'linear-gradient(135deg, #F7F2EB, #123D7E)',
                                        boxShadow: '0 8px 32px rgba(208, 227, 255, 0.3)',
                                    }}
                                >
                                    <Sparkles size={28} style={{ color: '#F7F2EB' }} />
                                </motion.div>
                                <h1 className="font-serif text-3xl font-bold mb-4" style={{ color: '#F7F2EB' }}>
                                    Welcome to <span className="shimmer">NEXX</span>
                                </h1>
                                <p className="text-sm leading-relaxed mb-2" style={{ color: '#D0E3FF' }}>
                                    If you&apos;re here, you already know something isn&apos;t right.
                                </p>
                                <p className="text-sm leading-relaxed" style={{ color: '#FFF9F0' }}>
                                    You&apos;re not crazy, you&apos;re not overreacting, and you&apos;re not alone. Let&apos;s get you set up with the tools, strategy, and support you deserve.
                                </p>
                            </div>
                        )}

                        {/* Step 1: About You */}
                        {currentStep === 1 && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Users size={20} style={{ color: '#F7F2EB' }} />
                                    <h2 className="font-serif text-xl font-semibold" style={{ color: '#F7F2EB' }}>About You</h2>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-2 block" style={{ color: '#D0E3FF' }}>Your Name</label>
                                    <input value={formData.name} onChange={(e) => update('name', e.target.value)} placeholder="First name" className="input-premium" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-2 block" style={{ color: '#D0E3FF' }}>State</label>
                                    <select value={formData.state} onChange={(e) => update('state', e.target.value)} className="input-premium">
                                        <option value="">Select your state</option>
                                        {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-2 block" style={{ color: '#D0E3FF' }}>County</label>
                                    <input value={formData.county} onChange={(e) => update('county', e.target.value)} placeholder="e.g. Harris County" className="input-premium" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-2 block" style={{ color: '#D0E3FF' }}>Children</label>
                                        <input type="number" value={formData.childrenCount} onChange={(e) => update('childrenCount', e.target.value)} placeholder="How many?" className="input-premium" min="1" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-2 block" style={{ color: '#D0E3FF' }}>Ages</label>
                                        <input value={formData.childrenAges} onChange={(e) => update('childrenAges', e.target.value)} placeholder="e.g. 4, 7" className="input-premium" />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Situation */}
                        {currentStep === 2 && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <MapPin size={20} style={{ color: '#F7F2EB' }} />
                                    <h2 className="font-serif text-xl font-semibold" style={{ color: '#F7F2EB' }}>Your Situation</h2>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-3 block" style={{ color: '#D0E3FF' }}>Custody Arrangement</label>
                                    {['Joint / Shared Custody', 'Sole Custody', 'Visitation Only', 'No Order Yet', 'Other'].map((opt) => (
                                        <button
                                            key={opt}
                                            onClick={() => update('custodyType', opt)}
                                            className="w-full text-left px-4 py-3 rounded-xl mb-2 transition-all text-sm"
                                            style={{
                                                background: formData.custodyType === opt ? 'rgba(208, 227, 255, 0.12)' : 'rgba(255, 249, 240, 0.4)',
                                                border: `1px solid ${formData.custodyType === opt ? 'rgba(208, 227, 255, 0.3)' : 'rgba(208, 227, 255, 0.08)'}`,
                                                color: formData.custodyType === opt ? '#F7F2EB' : '#D0E3FF',
                                            }}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                                <div>
                                    <label className="text-xs font-semibold tracking-[0.1em] uppercase mb-3 block" style={{ color: '#D0E3FF' }}>Do you have an attorney?</label>
                                    <div className="flex gap-3">
                                        {['Yes', 'No', 'Looking'].map((opt) => (
                                            <button
                                                key={opt}
                                                onClick={() => update('hasAttorney', opt)}
                                                className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
                                                style={{
                                                    background: formData.hasAttorney === opt ? 'rgba(208, 227, 255, 0.12)' : 'rgba(255, 249, 240, 0.4)',
                                                    border: `1px solid ${formData.hasAttorney === opt ? 'rgba(208, 227, 255, 0.3)' : 'rgba(208, 227, 255, 0.08)'}`,
                                                    color: formData.hasAttorney === opt ? '#F7F2EB' : '#FFF9F0',
                                                }}
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Your NEX */}
                        {currentStep === 3 && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Heart size={20} style={{ color: '#F7F2EB' }} />
                                    <h2 className="font-serif text-xl font-semibold" style={{ color: '#F7F2EB' }}>Your NEX</h2>
                                </div>
                                <p className="text-sm" style={{ color: '#FFF9F0' }}>
                                    Select all behaviors you regularly experience:
                                </p>
                                <div className="grid grid-cols-1 gap-2">
                                    {nexBehaviorOptions.map((opt) => (
                                        <button
                                            key={opt}
                                            onClick={() => toggleArrayItem('nexBehaviors', opt)}
                                            className="text-left px-4 py-3 rounded-xl transition-all text-sm flex items-center gap-3"
                                            style={{
                                                background: formData.nexBehaviors.includes(opt) ? '#FFF9F0' : 'transparent',
                                                border: formData.nexBehaviors.includes(opt) ? '1px solid rgba(10, 30, 84, 0.12)' : '1px solid rgba(208, 227, 255, 0.25)',
                                                backgroundImage: !formData.nexBehaviors.includes(opt) ? 'linear-gradient(135deg, rgba(10, 30, 84, 0.05), rgba(18, 61, 126, 0.1))' : 'none',
                                                color: formData.nexBehaviors.includes(opt) ? '#0A1E54' : '#FFFFFF',
                                            }}
                                        >
                                            <div
                                                className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                                                style={{
                                                    background: formData.nexBehaviors.includes(opt) ? '#7096D1' : '#FFFFFF',
                                                    border: formData.nexBehaviors.includes(opt) ? '1.5px solid #7096D1' : '1.5px solid rgba(255, 255, 255, 0.6)',
                                                }}
                                            >
                                                {formData.nexBehaviors.includes(opt) && <Check size={12} style={{ color: '#FFFFFF' }} />}
                                            </div>
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 4: Goals */}
                        {currentStep === 4 && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <Target size={20} style={{ color: '#F7F2EB' }} />
                                    <h2 className="font-serif text-xl font-semibold" style={{ color: '#F7F2EB' }}>Your Goals</h2>
                                </div>
                                <p className="text-sm" style={{ color: '#FFF9F0' }}>
                                    What do you need the most help with right now?
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {goalOptions.map((opt) => (
                                        <button
                                            key={opt}
                                            onClick={() => toggleArrayItem('primaryGoals', opt)}
                                            className="badge cursor-pointer transition-all text-sm py-2 px-4"
                                            style={{
                                                background: formData.primaryGoals.includes(opt) ? 'rgba(208, 227, 255, 0.15)' : 'rgba(255, 249, 240, 0.5)',
                                                color: formData.primaryGoals.includes(opt) ? '#F7F2EB' : '#FFF9F0',
                                                border: `1px solid ${formData.primaryGoals.includes(opt) ? 'rgba(208, 227, 255, 0.3)' : 'rgba(208, 227, 255, 0.06)'}`,
                                            }}
                                        >
                                            {opt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 5: Disclaimer */}
                        {currentStep === 5 && (
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <FileText size={20} style={{ color: '#F7F2EB' }} />
                                    <h2 className="font-serif text-xl font-semibold" style={{ color: '#F7F2EB' }}>Important Notice</h2>
                                </div>
                                <div className="p-5 space-y-3 rounded-2xl" style={{ background: '#7096D1', border: '1px solid rgba(208, 227, 255, 0.2)' }}>
                                    <p className="text-sm leading-relaxed" style={{ color: '#0A1E54' }}>
                                        NEXX is an AI-powered tool that provides <strong style={{ color: '#FFFFFF' }}>legal information, strategic guidance, and emotional support</strong>. It is <strong style={{ color: '#FFFFFF' }}>not</strong> a law firm, does not provide legal advice, and is not a substitute for a licensed attorney or therapist.
                                    </p>
                                    <p className="text-sm leading-relaxed" style={{ color: '#0A1E54' }}>
                                        Information provided by NEXX should be used as a starting point for your own research and decision-making. For specific legal advice regarding your situation, please consult with a licensed attorney in your state.
                                    </p>
                                    <p className="text-sm leading-relaxed" style={{ color: '#0A1E54' }}>
                                        If you or your children are in immediate danger, please call <strong style={{ color: '#FFFFFF' }}>911</strong> or the National Domestic Violence Hotline at <strong style={{ color: '#FFFFFF' }}>1-800-799-7233</strong>.
                                    </p>
                                </div>
                                <button
                                    onClick={() => update('acceptedDisclaimer', !formData.acceptedDisclaimer)}
                                    className="w-full text-left px-4 py-3 rounded-xl transition-all text-sm flex items-center gap-3"
                                    style={{
                                        background: formData.acceptedDisclaimer ? 'rgba(208, 227, 255, 0.1)' : 'rgba(255, 249, 240, 0.4)',
                                        border: `1px solid ${formData.acceptedDisclaimer ? 'rgba(208, 227, 255, 0.25)' : 'rgba(208, 227, 255, 0.06)'}`,
                                        color: formData.acceptedDisclaimer ? '#F7F2EB' : '#D0E3FF',
                                    }}
                                >
                                    <div
                                        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
                                        style={{
                                            background: formData.acceptedDisclaimer ? '#F7F2EB' : 'transparent',
                                            border: `1.5px solid ${formData.acceptedDisclaimer ? '#F7F2EB' : '#FFF9F0'}`,
                                        }}
                                    >
                                        {formData.acceptedDisclaimer && <Check size={12} style={{ color: '#0A1E54' }} />}
                                    </div>
                                    I understand and acknowledge the above
                                </button>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                {/* Navigation Buttons */}
                <div className="flex items-center gap-3 mt-8">
                    {currentStep > 0 && (
                        <button onClick={() => setCurrentStep((prev) => prev - 1)} className="btn-outline flex items-center gap-2">
                            <ChevronLeft size={14} /> Back
                        </button>
                    )}
                    <button
                        onClick={handleNext}
                        disabled={!canProceed() || isSaving || userLoading || (currentStep === ONBOARDING_STEPS.length - 1 && !userId)}
                        className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-30"
                    >
                        {currentStep === ONBOARDING_STEPS.length - 1 ? (
                            <>{isSaving ? 'Saving...' : userLoading ? 'Loading...' : 'Enter NEXX'} <Sparkles size={14} /></>
                        ) : (
                            <>Continue <ChevronRight size={14} /></>
                        )}
                    </button>
                </div>
                {(saveError || userError) && (
                    <p className="text-xs mt-3 text-center" style={{ color: '#e74c3c' }}>
                        {saveError || userError}
                    </p>
                )}
            </div>
        </div>
    );
}
