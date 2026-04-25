'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from 'convex/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import {
    Crown,
    Lightning,
    Shield,
    ChatCircleText,
    ArrowRight,
    Check,
} from '@phosphor-icons/react';
import { TIER_LIMITS, type SubscriptionTier } from '@/lib/tiers';
import { COMING_SOON_FEATURES } from '@/lib/coming-soon';
import { PLANS } from '@/lib/plans';

/** Subscription management page — shows current plan and upgrade options. */
export default function SubscriptionPage() {
    return (
        <Suspense fallback={
            <PageContainer>
                <div className="flex items-center justify-center h-64">
                    <div className="w-10 h-10 rounded-full border-2 border-[#60A5FA] border-t-transparent animate-spin" />
                </div>
            </PageContainer>
        }>
            <SubscriptionContent />
        </Suspense>
    );
}

/** Inner subscription content — renders current plan, tier comparison, upgrade CTAs, and cancel toast. */
function SubscriptionContent() {
    const user = useQuery(api.users.me);
    const searchParams = useSearchParams();
    const router = useRouter();
    const [loadingTier, setLoadingTier] = useState<string | null>(null);
    const [portalLoading, setPortalLoading] = useState(false);

    const isCanceled = searchParams.get('canceled') === 'true';
    const [dismissedToast, setDismissedToast] = useState(false);
    const showToast = isCanceled && !dismissedToast;

    // Auto-dismiss toasts after 5 seconds and clean up URL query params
    useEffect(() => {
        if (!isCanceled) return;
        const timer = setTimeout(() => {
            setDismissedToast(true);
            router.replace('/subscription', { scroll: false });
        }, 5000);
        return () => clearTimeout(timer);
    }, [isCanceled, router]);

    const handleUpgrade = useCallback(async (tier: string) => {
        setLoadingTier(tier);
        try {
            const res = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tier }),
            });
            const data = await res.json();
            if (!res.ok) {
                console.error('Checkout API error:', data);
                alert(data.error ?? 'Something went wrong. Please try again.');
                return;
            }
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (error) {
            console.error('Checkout failed:', error);
            alert('Network error — please check your connection and try again.');
        } finally {
            setLoadingTier(null);
        }
    }, []);

    const handleManageBilling = useCallback(async () => {
        setPortalLoading(true);
        try {
            const res = await fetch('/api/stripe/portal', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                console.error('Portal API error:', data);
                alert(data.error ?? 'Unable to open billing portal. Please try again.');
                return;
            }
            if (data.url) {
                window.location.href = data.url;
            }
        } catch (error) {
            console.error('Portal failed:', error);
            alert('Network error — please check your connection and try again.');
        } finally {
            setPortalLoading(false);
        }
    }, []);

    // Show loading spinner while user data is being fetched
    if (user === undefined) {
        return (
            <PageContainer>
                <div className="flex items-center justify-center h-64">
                    <div className="w-10 h-10 rounded-full border-2 border-[#60A5FA] border-t-transparent animate-spin" />
                </div>
            </PageContainer>
        );
    }

    const validTiers: Set<string> = new Set(PLANS.map((p) => p.tier));
    const rawTier = user?.subscriptionTier as string | undefined;
    const currentTier: SubscriptionTier = rawTier && validTiers.has(rawTier)
        ? (rawTier as SubscriptionTier)
        : 'free';
    const currentConfig = TIER_LIMITS[currentTier];

    const plans: {
        tier: SubscriptionTier;
        icon: typeof Crown;
        iconColor: string;
        description: string;
        features: string[];
        highlight: boolean;
        badge?: string;
    }[] = [
        {
            tier: 'free',
            icon: Shield,
            iconColor: 'rgba(255,255,255,0.5)',
            description: 'Start documenting incidents and explore what NEXX can do — completely free.',
            features: [
                '10 premium AI responses per day',
                'Unlimited standard AI responses',
                '3 legal document generations per month',
                '3 court rules lookups per month',
                'Basic incident reporting & analysis',
            ],
            highlight: false,
        },
        {
            tier: 'pro',
            icon: Lightning,
            iconColor: '#60A5FA',
            description: 'For parents ready to build a strong, evidence-backed case with expanded access to every tool.',
            features: [
                '75 premium AI responses per day',
                'Unlimited standard AI responses',
                'Unlimited legal document generation',
                'Unlimited incident analysis & timeline reports',
                'Full county resource finder & court rules lookup',
            ],
            highlight: false,
        },
        {
            tier: 'premium',
            icon: Lightning,
            iconColor: '#E5A84A',
            description: 'Our most popular plan — built for parents actively navigating custody, family law, or high-conflict cases.',
            badge: 'Most Popular',
            features: [
                '200 premium AI responses per day',
                'Unlimited standard AI responses',
                'Unlimited document generation & DocuVault access',
                'Advanced court compliance verification',
                'Unlimited access to local legal resources',
            ],
            highlight: true,
        },
        {
            tier: 'executive',
            icon: Crown,
            iconColor: '#E5A84A',
            description: 'No daily caps. No restrictions. Full, unrestricted access to every NEXX feature — built for your most demanding legal needs.',
            badge: 'Elite',
            features: [
                'Unlimited premium AI responses',
                'Unlimited document generation & template gallery',
                'Unlimited incident analysis & timeline reports',
                'Unlimited compliance verification & court rule lookups',
                'Dedicated family code search tailored to your location',
            ],
            highlight: false,
        },
    ];

    const tierOrder: SubscriptionTier[] = ['free', 'pro', 'premium', 'executive'];

    return (
        <PageContainer>
            <PageHeader
                icon={Crown}
                title="Subscription"
                description="Manage your plan and unlock the full power of NEXX."
            />

            {/* Current Plan Banner */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.6 }}
                className="glass-ethereal rounded-3xl p-6 md:p-8 mb-8 relative overflow-hidden"
            >
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-[-20%] right-[-10%] w-[40%] h-[60%] bg-[#1A4B9B]/15 rounded-full blur-[80px]" />
                </div>

                <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--champagne)] mb-2">
                            Current Plan
                        </p>
                        <h2 className="text-2xl font-serif font-bold text-white tracking-tight mb-1">
                            {currentConfig.label}
                        </h2>
                        <p className="text-sm text-white/50">
                            {currentConfig.priceUsd === 0
                                ? 'Free forever'
                                : `$${currentConfig.priceUsd}/month`}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-4">
                        <div className="rounded-2xl bg-[#0A1128] border border-[rgba(255,255,255,0.08)] px-5 py-3 text-center min-w-[120px]">
                            <div className="flex items-center justify-center gap-2 mb-1">
                                <ChatCircleText size={16} weight="fill" color="#60A5FA" />
                                <span className="text-[10px] font-bold tracking-wider uppercase text-white/40">Premium AI / Day</span>
                            </div>
                            <p className="text-lg font-serif font-bold text-white">
                                {currentConfig.gpt4oDailyLimit === -1 ? '∞' : currentConfig.gpt4oDailyLimit}
                            </p>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {plans.map((plan, i) => {
                    const config = TIER_LIMITS[plan.tier];
                    const isCurrent = plan.tier === currentTier;
                    const tierIdx = tierOrder.indexOf(plan.tier);
                    const currentIdx = tierOrder.indexOf(currentTier);
                    const isUpgrade = tierIdx > currentIdx;
                    const Icon = plan.icon;

                    return (
                        <motion.div
                            key={plan.tier}
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + i * 0.1, duration: 0.6 }}
                            className={`relative rounded-[2rem] p-6 flex flex-col border transition-all ${
                                isCurrent
                                    ? 'bg-gradient-to-b from-[#0F1D3D] to-[#0A1128] border-[var(--champagne)] shadow-[0_4px_30px_rgba(229,168,74,0.15)]'
                                    : plan.highlight
                                        ? 'bg-gradient-to-b from-[#0F1D3D] to-[#0A1128] border-[rgba(229,168,74,0.3)]'
                                        : 'bg-[#0A1128] border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.15)]'
                            }`}
                        >
                            {/* Badge */}
                            {(plan.badge || isCurrent) && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                    <span className={`whitespace-nowrap px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm ${
                                        isCurrent
                                            ? 'bg-gradient-to-r from-[#E5A84A] to-[#C88B2E] text-[#0A1128]'
                                            : 'bg-[#1A4B9B] text-white/80'
                                    }`}>
                                        {isCurrent ? 'Current Plan' : plan.badge}
                                    </span>
                                </div>
                            )}

                            {/* Icon + Name */}
                            <div className={`flex items-center gap-3 mb-3 ${(plan.badge || isCurrent) ? 'mt-5' : 'mt-1'}`}>
                                <Icon size={20} weight="fill" color={plan.iconColor} />
                                <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--champagne)]">
                                    {plan.tier}
                                </h3>
                            </div>

                            {/* Price */}
                            <div className="flex items-baseline gap-1 mb-1">
                                <span className="text-2xl font-serif font-bold text-white tracking-tight">
                                    {config.priceUsd === 0 ? '$0' : `$${config.priceUsd}`}
                                </span>
                                <span className="text-sm text-white/40">
                                    {config.priceUsd === 0 ? 'forever' : '/month'}
                                </span>
                            </div>

                            {/* Description */}
                            <p className="text-[13px] text-white/50 leading-relaxed mb-5">
                                {plan.description}
                            </p>

                            {/* Features */}
                            <ul className="flex-1 space-y-2.5 mb-6">
                                {plan.features.map((feature) => (
                                    <li key={feature} className="flex items-start gap-2">
                                        <Check size={14} weight="bold" className="mt-0.5 shrink-0 text-[var(--champagne)]" />
                                        <span className="text-[13px] text-white/70 leading-snug">{feature}</span>
                                    </li>
                                ))}
                            </ul>

                            {/* CTA */}
                            <button
                                disabled={isCurrent || !isUpgrade || loadingTier === plan.tier}
                                onClick={() => isUpgrade && handleUpgrade(plan.tier)}
                                className={`w-full py-3 rounded-xl text-[13px] font-bold tracking-wide uppercase transition-all flex items-center justify-center gap-2 ${
                                    isCurrent
                                        ? 'bg-[rgba(255,255,255,0.05)] text-white/30 cursor-default'
                                        : isUpgrade
                                            ? 'bg-gradient-to-r from-[#E5A84A] to-[#C88B2E] text-[#0A1128] hover:shadow-[0_4px_20px_rgba(229,168,74,0.4)] cursor-pointer'
                                            : 'bg-[rgba(255,255,255,0.03)] text-white/20 cursor-default'
                                }`}
                            >
                                {loadingTier === plan.tier ? (
                                    <div className="w-4 h-4 rounded-full border-2 border-[#0A1128] border-t-transparent animate-spin" />
                                ) : isCurrent ? 'Current Plan' : isUpgrade ? (
                                    <>Upgrade <ArrowRight size={14} weight="bold" /></>
                                ) : 'Included'}
                            </button>
                        </motion.div>
                    );
                })}

                {/* Coming Soon Integrated Card */}
                <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7, duration: 0.6 }}
                    className="md:col-span-2 lg:col-span-4 mt-2 rounded-[2rem] p-6 md:p-8 border border-[rgba(255,255,255,0.06)] bg-gradient-to-b from-[#0F1D3D]/60 to-[#0A1128]/80 relative overflow-hidden hover:border-[rgba(255,255,255,0.12)] transition-all shadow-[0_8px_40px_rgba(0,0,0,0.4)]"
                >
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute bottom-[-20%] left-[-10%] w-[35%] h-[50%] bg-[#E5A84A]/5 rounded-full blur-[80px]" />
                    </div>
                    <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center md:items-start">
                        <div className="md:w-1/3 text-center md:text-left shrink-0">
                            <div className="flex items-center justify-center md:justify-start gap-2.5 mb-3">
                                <Lightning size={16} weight="fill" className="text-[var(--champagne)]" />
                                <p className="text-[11px] font-bold tracking-[0.25em] uppercase text-[var(--champagne)]">
                                    On the Horizon
                                </p>
                            </div>
                            <h2 className="text-2xl lg:text-3xl font-serif font-bold italic text-white tracking-tight mb-3">
                                Coming Next
                            </h2>
                            <p className="text-[13px] text-white/40 leading-relaxed md:max-w-xs mx-auto md:mx-0">
                                NEXX is actively evolving. These strategic tools are currently in development for upcoming releases.
                            </p>
                        </div>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full list-none m-0 p-0" aria-label="Upcoming features">
                            {COMING_SOON_FEATURES.map((feature) => (
                                <li
                                    key={feature}
                                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05] shadow-sm hover:bg-white/[0.04] transition-colors"
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--champagne)] shadow-[0_0_8px_rgba(229,168,74,0.6)] shrink-0" />
                                    <span className="text-[12px] text-white/60 leading-tight">{feature}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </motion.div>
            </div>

            {/* Cancel Toast */}
            {showToast && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    role="status"
                    aria-live="polite"
                    className="fixed bottom-6 right-6 bg-amber-500/20 border border-amber-500/40 text-amber-300 px-6 py-3 rounded-xl text-sm font-bold backdrop-blur-xl shadow-lg z-50"
                >
                    Checkout canceled. No charges were made.
                </motion.div>
            )}

            {/* Manage Billing */}
            {user?.stripeCustomerId && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8, duration: 0.6 }}
                    className="text-center mt-8 mb-4"
                >
                    <button
                        onClick={handleManageBilling}
                        disabled={portalLoading}
                        className="text-[12px] text-[var(--champagne)] hover:underline opacity-80 hover:opacity-100 font-bold tracking-wide uppercase cursor-pointer transition-all"
                    >
                        {portalLoading ? 'Opening...' : 'Manage Billing & Invoices →'}
                    </button>
                </motion.div>
            )}

        </PageContainer>
    );
}
