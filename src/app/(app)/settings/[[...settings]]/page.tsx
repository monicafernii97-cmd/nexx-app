'use client';

import { UserProfile } from '@clerk/nextjs';
import { settingsClerkAppearance } from '@/lib/clerk-theme';
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
                    <div className="flex items-center gap-4 mb-2">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/5 border border-indigo-500/20 flex items-center justify-center shadow-lg shrink-0">
                            <Gear size={20} className="text-indigo-400" weight="light" />
                        </div>
                        <h1 className="text-2xl font-serif font-bold tracking-tight text-white m-0">
                            Account Settings
                        </h1>
                    </div>
                    <p className="text-[13px] text-white/40 max-w-2xl mt-1 leading-relaxed">
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
                <UserProfile appearance={settingsClerkAppearance} />
            </motion.div>
        </div>
    );
}

