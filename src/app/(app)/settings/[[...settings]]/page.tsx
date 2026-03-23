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
                className="flex items-start justify-between mb-10"
            >
                <div>
                    <div className="flex items-center gap-4 mb-3">
                        <div className="w-12 h-12 rounded-2xl bg-[linear-gradient(135deg,#123D7E,#0A1128)] border-2 border-[#60A5FA]/50 shadow-[0_8px_24px_rgba(96,165,250,0.3)] flex items-center justify-center translate-y-[-2px]">
                            <Gear size={24} className="text-[#60A5FA] drop-shadow-[0_2px_8px_rgba(96,165,250,0.8)]" weight="fill" />
                        </div>
                        <h1 className="text-4xl font-serif font-bold tracking-tight text-white drop-shadow-sm m-0">
                            Account Settings
                        </h1>
                    </div>
                    <p className="text-[16px] font-medium text-white max-w-2xl mt-2 drop-shadow-sm">
                        Manage your NEXX profile authentication, security preferences, and subscription details.
                    </p>
                </div>
            </motion.div>

            <motion.div 
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="overflow-hidden rounded-[2rem] border border-white/20 bg-[linear-gradient(135deg,#1E3A8A_0%,rgba(255,255,255,0.15)_100%)] backdrop-blur-3xl motion-reduce:backdrop-blur-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_24px_64px_rgba(0,0,0,0.6)]"
            >
                {/* Global override for stubborn dark text inside Clerk UserProfile */}
                <style jsx global>{`
                    .cl-profilePage h1, .cl-profilePage h2, .cl-profilePage h3, .cl-profilePage h4, .cl-profilePage p, .cl-profilePage span {
                        color: white !important;
                    }
                    .cl-navbar, .cl-navbarButton {
                        color: white !important;
                    }
                `}</style>
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
                                borderRight: '1px solid rgba(255,255,255,0.1)',
                                background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.05))',
                            },
                            navbarButton: {
                                color: 'rgba(255,255,255,0.8)',
                            },
                            navbarButtonIcon: {
                                color: 'rgba(255,255,255,0.8)',
                            },
                            scrollBox: {
                                background: 'transparent',
                            },
                            pageScrollBox: {
                                background: 'transparent',
                            }
                        },
                    }}
                />
            </motion.div>
        </div>
    );
}
