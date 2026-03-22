'use client';

import { motion } from 'framer-motion';
import { useQuery } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { PageContainer, PageHeader } from '@/components/layout/PageLayout';
import {
    Crown,
    Lightning,
    Sparkle,
    Shield,
    ChatCircleText,
    FileText,
    ArrowRight,
    Check,
} from '@phosphor-icons/react';
import { TIER_LIMITS, type SubscriptionTier } from '@/lib/tiers';

/** Subscription management page — shows current plan and upgrade options. */
export default function SubscriptionPage() {
    const user = useQuery(api.users.me);

    const currentTier: SubscriptionTier = (user?.subscriptionTier as SubscriptionTier) || 'free';
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
                '5 legal guidance messages per day',
                '50 NEXX Chat messages per day',
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
                '50 legal guidance messages per day',
                'Unlimited NEXX Chat',
                'Unlimited legal document generation',
                'Unlimited incident analysis & timeline reports',
                'Full county resource finder & court rules lookup',
            ],
            highlight: false,
        },
        {
            tier: 'premium',
            icon: Sparkle,
            iconColor: '#E5A84A',
            description: 'Our most popular plan — built for parents actively navigating custody, family law, or high-conflict cases.',
            badge: 'Most Popular',
            features: [
                '100 legal guidance messages per day',
                'Unlimited NEXX Chat',
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
                'Unlimited legal guidance messages',
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
                        <h2 className="text-3xl font-serif font-bold text-white tracking-tight mb-1">
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
                                <span className="text-[10px] font-bold tracking-wider uppercase text-white/40">Legal Guidance / Day</span>
                            </div>
                            <p className="text-xl font-serif font-bold text-white">
                                {currentConfig.gpt4oDailyLimit === -1 ? '∞' : currentConfig.gpt4oDailyLimit}
                            </p>
                        </div>
                        <div className="rounded-2xl bg-[#0A1128] border border-[rgba(255,255,255,0.08)] px-5 py-3 text-center min-w-[120px]">
                            <div className="flex items-center justify-center gap-2 mb-1">
                                <FileText size={16} weight="fill" color="#60A5FA" />
                                <span className="text-[10px] font-bold tracking-wider uppercase text-white/40">NEXX Chat / Day</span>
                            </div>
                            <p className="text-xl font-serif font-bold text-white">
                                {currentConfig.gpt4oMiniDailyLimit === -1 ? '∞' : currentConfig.gpt4oMiniDailyLimit}
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
                                    <span className={`px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest shadow-sm ${
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
                                <span className="text-3xl font-serif font-bold text-white tracking-tight">
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
                                disabled={isCurrent || !isUpgrade}
                                className={`w-full py-3 rounded-xl text-[13px] font-bold tracking-wide uppercase transition-all flex items-center justify-center gap-2 ${
                                    isCurrent
                                        ? 'bg-[rgba(255,255,255,0.05)] text-white/30 cursor-default'
                                        : isUpgrade
                                            ? 'bg-gradient-to-r from-[#E5A84A] to-[#C88B2E] text-[#0A1128] hover:shadow-[0_4px_20px_rgba(229,168,74,0.4)] cursor-pointer'
                                            : 'bg-[rgba(255,255,255,0.03)] text-white/20 cursor-default'
                                }`}
                            >
                                {isCurrent ? 'Current Plan' : isUpgrade ? (
                                    <>Upgrade <ArrowRight size={14} weight="bold" /></>
                                ) : 'Included'}
                            </button>
                        </motion.div>
                    );
                })}
            </div>

            {/* Info notice */}
            <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.6 }}
                className="text-center text-[11px] text-white/30 mt-8"
            >
                Ready to upgrade? Reach out to{' '}
                <a href="mailto:support@nexxapp.com" className="text-[var(--champagne)] hover:underline">support@nexxapp.com</a>
                {' '}and we&apos;ll get you set up.
            </motion.p>

            {/* Coming Soon */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9, duration: 0.6 }}
                className="glass-ethereal rounded-3xl p-6 md:p-8 mt-8 relative overflow-hidden"
            >
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute bottom-[-20%] left-[-10%] w-[35%] h-[50%] bg-[#E5A84A]/8 rounded-full blur-[80px]" />
                </div>
                <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-4">
                        <Sparkle size={20} weight="fill" className="text-[var(--champagne)]" />
                        <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-[var(--champagne)]">
                            Coming Soon
                        </h3>
                    </div>
                    <p className="text-[13px] text-white/50 leading-relaxed mb-5">
                        NEXX is evolving. These features are in development and will be available in upcoming releases.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {[
                            'Voice-first AI conversations',
                            'Court order upload & analysis',
                            'Affidavit builder',
                            'eFiling integration',
                            'Attorney collaboration portal',
                            'Therapist collaboration portal',
                            'eSignature & notarization',
                            'Court date countdown & prep coach',
                            'Custody exchange logger',
                            'Children\'s wellbeing tracker',
                            'Financial abuse tracker',
                            'Co-parent communication filter',
                        ].map((feature) => (
                            <div
                                key={feature}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]"
                            >
                                <Sparkle size={12} weight="fill" className="text-[var(--champagne)]/50 shrink-0" />
                                <span className="text-[12px] text-white/40">{feature}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.div>
        </PageContainer>
    );
}
