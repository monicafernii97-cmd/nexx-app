'use client';

import { UserProfile } from '@clerk/nextjs';
import { settingsClerkAppearance } from '@/lib/clerk-theme';
import { Gear } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageLayout';

/** Account settings page embedding the Clerk UserProfile component. */
export default function SettingsPage() {
    return (
        <div className="max-w-4xl mx-auto pb-20">
            <PageHeader
                icon={Gear}
                title="Account Settings"
                description="Manage your NEXX profile authentication, security preferences, and subscription details."
            />

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
