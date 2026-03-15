'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    MessageCircle,
    Landmark,
    ClipboardList,
    Siren,
    Scale,
    Gavel,
    BookOpen,
    UserCircle,
    Settings,
    ChevronLeft,
    ChevronRight,
    LogIn,
} from 'lucide-react';
import { useState } from 'react';
import { UserButton, useUser } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';

const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Chat', href: '/chat', icon: MessageCircle },
    { label: 'DocuVault', href: '/docuvault', icon: Landmark },
    { label: 'Incident Report', href: '/incident-report', icon: ClipboardList },
    { label: 'NEX Profile', href: '/nex-profile', icon: Siren },
    { label: 'Legal Suite', href: '/court-settings', icon: Scale },
    { label: 'Resources', href: '/resources', icon: BookOpen },
    { label: 'My Profile', href: '/profile', icon: UserCircle },
    { label: 'Settings', href: '/settings', icon: Settings },
];

/** Collapsible navigation sidebar with branded logo, nav items, user info, and auth state. */
export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { user, isLoaded } = useUser();

    return (
        <motion.aside
            animate={{ width: collapsed ? 72 : 260 }}
            transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
            className="fixed left-0 top-0 h-screen z-50 flex flex-col"
            style={{
                background: 'linear-gradient(180deg, #123D7E 0%, #0A1E54 100%)',
                borderRight: '1px solid rgba(208, 227, 255, 0.12)',
            }}
        >
            {/* Logo */}
            <div className="flex items-center px-5 h-[72px] flex-shrink-0">
                <Link href="/dashboard" className="flex items-center gap-3 no-underline">
                    <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                            background: 'linear-gradient(135deg, #FFF9F0, #D0E3FF)',
                            boxShadow: '0 2px 12px rgba(208, 227, 255, 0.3)',
                        }}
                    >
                        <span className="text-sm font-black" style={{ color: '#0A1E54' }}>N</span>
                    </div>
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.span
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="text-lg font-serif font-bold tracking-widest"
                                style={{ color: '#F7F2EB' }}
                            >
                                NEXX
                            </motion.span>
                        )}
                    </AnimatePresence>
                </Link>
            </div>

            {/* Divider */}
            <div className="mx-4 primary-divider" />

            {/* Navigation */}
            <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                    const Icon = item.icon;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="no-underline"
                        >
                            <motion.div
                                whileHover={{ x: 2 }}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${collapsed ? 'justify-center' : ''
                                    }`}
                                style={{
                                    background: isActive
                                        ? 'rgba(255, 249, 240, 0.15)'
                                        : 'transparent',
                                    color: isActive ? '#F7F2EB' : '#D0E3FF',
                                    borderLeft: isActive ? '3px solid #FFF9F0' : '3px solid transparent',
                                }}
                            >
                                <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
                                <AnimatePresence>
                                    {!collapsed && (
                                        <motion.span
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="text-sm font-medium whitespace-nowrap"
                                        >
                                            {item.label}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        </Link>
                    );
                })}
            </nav>

            {/* User Section */}
            <div className="px-3 pb-4 space-y-2">
                <div className="primary-divider mb-3" />

                {isLoaded && user ? (
                    /* ─── Authenticated: Clerk UserButton + user info ─── */
                    <div
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-[rgba(208, 227, 255,0.06)] ${collapsed ? 'justify-center' : ''
                            }`}
                    >
                        <UserButton
                            appearance={{
                                ...nexxClerkAppearance,
                                elements: {
                                    ...nexxClerkAppearance.elements,
                                    userButtonAvatarBox: {
                                        width: 32,
                                        height: 32,
                                    },
                                },
                            }}
                        />

                        <AnimatePresence>
                            {!collapsed && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="flex-1 min-w-0"
                                >
                                    <p className="text-sm font-medium truncate" style={{ color: '#F7F2EB' }}>
                                        {user.firstName || user.fullName || 'User'}
                                    </p>
                                    <p className="text-xs truncate" style={{ color: '#FFF9F0' }}>
                                        {user.primaryEmailAddress?.emailAddress || 'Manage Account'}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ) : isLoaded && !user ? (
                    /* ─── Not authenticated: Sign In link ─── */
                    <Link href="/sign-in" className="no-underline">
                        <div
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors hover:bg-[rgba(208, 227, 255,0.06)] ${collapsed ? 'justify-center' : ''
                                }`}
                        >
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(208, 227, 255, 0.1)', border: '1px solid rgba(208, 227, 255, 0.25)' }}
                            >
                                <LogIn size={16} style={{ color: '#F7F2EB' }} />
                            </div>
                            <AnimatePresence>
                                {!collapsed && (
                                    <motion.span
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="text-sm font-medium"
                                        style={{ color: '#F7F2EB' }}
                                    >
                                        Sign In
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </div>
                    </Link>
                ) : null}
            </div>

            {/* Collapse Toggle */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer
          transition-all duration-200 hover:scale-110"
                style={{
                    background: 'linear-gradient(135deg, #7096D1, #123D7E)',
                    border: '1px solid rgba(208, 227, 255, 0.2)',
                    color: '#D0E3FF',
                }}
            >
                {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
            </button>
        </motion.aside>
    );
}
