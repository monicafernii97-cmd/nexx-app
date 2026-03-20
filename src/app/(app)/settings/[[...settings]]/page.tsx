'use client';

import { UserProfile } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';
import { Gear } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

/** Account settings page embedding the Clerk UserProfile component. */
export default function SettingsPage() {
    return (
        <div className="max-w-4xl mx-auto pb-20">
            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start justify-between mb-8"
            >
                <div>
                    <div className="flex items-center gap-4 mb-3">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white shadow-sm border border-[var(--cloud-light)]">
                            <Gear size={28} className="text-[var(--champagne)]" weight="duotone" />
                        </div>
                        <h1 className="text-4xl font-light tracking-tight text-[var(--sapphire-dark)]">
                            Account Settings
                        </h1>
                    </div>
                    <p className="text-base text-[var(--sapphire-base)] max-w-2xl leading-relaxed">
                        Manage your profile, security protocols, and application preferences securely with NEXX.
                    </p>
                </div>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="card-premium overflow-hidden border border-[var(--cloud-light)] bg-white/60 shadow-lg"
            >
                <UserProfile
                    appearance={{
                        ...nexxClerkAppearance,
                        elements: {
                            ...nexxClerkAppearance.elements,
                            rootBox: {
                                width: '100%',
                            },
                            cardBox: {
                                width: '100%',
                                boxShadow: 'none',
                                background: 'transparent',
                            },
                            navbar: {
                                borderRight: '1px solid var(--cloud-light)',
                                background: 'transparent',
                            },
                            navbarButton: {
                                color: 'var(--sapphire-base)',
                            },
                            navbarButtonIcon: {
                                color: 'var(--sapphire-base)',
                            },
                        },
                    }}
                />
            </motion.div>
        </div>
    );
}
