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

            {/*
             * Force ALL text inside Clerk white via CSS custom properties.
             * Clerk internally uses --cl-internal-text and color on many sub-elements
             * that individual `appearance.elements` overrides miss.
             */}
            <motion.div 
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="overflow-hidden rounded-[2rem] border border-white/20 bg-[linear-gradient(135deg,#1E3A8A_0%,rgba(255,255,255,0.15)_100%)] backdrop-blur-3xl motion-reduce:backdrop-blur-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_24px_64px_rgba(0,0,0,0.6)] clerk-dark-override"
                style={{
                    // Force Clerk CSS custom properties white at the root container level
                    '--cl-chassis-foreground': '255 255 255',
                    '--cl-foreground': '255 255 255',
                    color: '#FFFFFF',
                } as React.CSSProperties}
            >
                <style>{`
                    .clerk-dark-override [data-localization-key],
                    .clerk-dark-override p,
                    .clerk-dark-override span,
                    .clerk-dark-override h1,
                    .clerk-dark-override h2,
                    .clerk-dark-override h3,
                    .clerk-dark-override label,
                    .clerk-dark-override button:not([data-color]) {
                        color: #FFFFFF !important;
                    }
                    .clerk-dark-override a {
                        color: #60A5FA !important;
                    }
                `}</style>
                <UserProfile
                    appearance={{
                        ...nexxClerkAppearance,
                        variables: {
                            ...nexxClerkAppearance.variables,
                            colorText: '#FFFFFF',
                            colorTextSecondary: 'rgba(255,255,255,0.75)',
                        },
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
                            card: {
                                ...nexxClerkAppearance.elements?.card,
                                background: 'transparent',
                            },
                            navbar: {
                                borderRight: '1px solid rgba(255,255,255,0.1)',
                                background: 'linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.05))',
                            },
                            navbarButton: { color: '#FFFFFF', fontWeight: '600' },
                            navbarButtonIcon: { color: '#FFFFFF' },
                            scrollBox: { background: 'transparent' },
                            pageScrollBox: { background: 'transparent' },
                            page: { color: '#FFFFFF' },
                            // Page headers
                            pageHeader: { color: '#FFFFFF' },
                            pageHeaderTitle: { color: '#FFFFFF', fontFamily: 'Playfair Display, Georgia, serif', fontWeight: '700' },
                            pageHeaderSubtitle: { color: 'rgba(255,255,255,0.75)' },
                            // Profile sections and content
                            profileSection: { color: '#FFFFFF' },
                            profileSectionTitle: { color: '#FFFFFF' },
                            profileSectionTitleText: { color: '#FFFFFF', fontWeight: '800', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' },
                            profileSectionSubtitle: { color: 'rgba(255,255,255,0.75)' },
                            profileSectionContent: { color: '#FFFFFF' },
                            profileSectionPrimaryButton: { color: '#60A5FA', fontWeight: '700' },
                            // User info
                            userPreview: { color: '#FFFFFF' },
                            userPreviewMainIdentifier: { color: '#FFFFFF', fontWeight: '700' },
                            userPreviewSecondaryIdentifier: { color: 'rgba(255,255,255,0.75)' },
                            userPreviewTextContainer: { color: '#FFFFFF' },
                            // Form elements
                            formFieldLabel: { color: '#FFFFFF' },
                            formFieldInput: { color: '#FFFFFF', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)' },
                            formFieldSuccessText: { color: '#10B981' },
                            formFieldErrorText: { color: '#F43F5E' },
                            // Accordions and interactive
                            accordionTriggerButton: { color: '#FFFFFF' },
                            accordionContent: { color: '#FFFFFF' },
                            // Badges
                            badge: { background: 'rgba(255,255,255,0.1)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.2)' },
                            tagPillContainer: { color: '#FFFFFF', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' },
                            // Menus / actions
                            menuButton: { color: '#FFFFFF' },
                            menuItem: { color: '#FFFFFF' },
                            menuList: { background: 'rgba(10,17,40,0.95)', border: '1px solid rgba(255,255,255,0.15)' },
                            // Footer / links
                            footerActionLink: { color: '#60A5FA', fontWeight: '600' },
                            footerActionText: { color: 'rgba(255,255,255,0.6)' },
                            // Table/list elements
                            tableHead: { color: 'rgba(255,255,255,0.6)' },
                            // Breadcrumbs
                            breadcrumbsItem: { color: '#FFFFFF', fontWeight: '600' },
                            breadcrumbsItemDivider: { color: 'rgba(255,255,255,0.4)' },
                            // Dividers
                            dividerLine: { background: 'rgba(255,255,255,0.1)' },
                            dividerText: { color: 'rgba(255,255,255,0.6)' },
                            // Buttons
                            formButtonPrimary: {
                                background: 'linear-gradient(135deg, #60A5FA, #2563EB)',
                                color: '#FFFFFF',
                                fontWeight: '700',
                            },
                            formButtonReset: { color: '#60A5FA' },
                            // Alert/notification text
                            alertText: { color: '#FFFFFF' },
                        },
                    }}
                />
            </motion.div>
        </div>
    );
}
