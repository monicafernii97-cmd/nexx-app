'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    SquaresFour,
    ChatCircleText,
    Bank,
    ClipboardText,
    WarningCircle,
    Scales,
    BookOpen,
    UserCircle,
    Gear,
    CaretLeft,
    CaretDown,
    SignIn,
    GridFour,
    FolderOpen,
    FileArrowUp,
    Crown,
    Question,
    PushPin,
    Notebook,
    CalendarCheck,
    FileText,
    IconWeight,
} from '@phosphor-icons/react';
import { useState, useMemo, useCallback, type ComponentType, type CSSProperties } from 'react';
import { UserButton, useUser } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';
import { restartTour, navIdSelector } from '@/lib/tourUtils';
import { CaseSwitcher } from '@/components/workspace/CaseSwitcher';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

/** Child navigation item definition for sidebar sub-menus. */
interface NavChild {
    label: string;
    href: string;
    icon: ComponentType<{ size?: number; weight?: IconWeight; style?: CSSProperties }>;
}

/** Top-level navigation item with optional expandable children. */
interface NavItem {
    label: string;
    href: string;
    icon: ComponentType<{ size?: number; weight?: IconWeight; style?: CSSProperties }>;
    children?: NavChild[];
}

/** Ordered list of sidebar navigation items with expandable sub-routes. */
const navItems: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: SquaresFour },
    {
        label: 'Chat',
        href: '/chat',
        icon: ChatCircleText,
        children: [
            { label: 'Overview', href: '/chat/overview', icon: SquaresFour },
            { label: 'Key Points', href: '/chat/key-points', icon: Notebook },
            { label: 'Pinned Items', href: '/chat/pinned', icon: PushPin },
            { label: 'Timeline', href: '/chat/timeline', icon: CalendarCheck },
            { label: 'Drafts', href: '/chat/drafts', icon: FileText },
        ],
    },
    {
        label: 'DocuVault',
        href: '/docuvault',
        icon: Bank,
        children: [
            { label: 'Template Gallery', href: '/docuvault/templates', icon: GridFour },
            { label: 'Saved Documents', href: '/docuvault/gallery', icon: FolderOpen },
        ],
    },
    { label: 'Incident Report', href: '/incident-report', icon: ClipboardText },
    { label: 'NEX Profile', href: '/nex-profile', icon: WarningCircle },
    { label: 'Legal Suite', href: '/court-settings', icon: Scales },
    { label: 'eFiling', href: '/efiling', icon: FileArrowUp },
    { label: 'Resources', href: '/resources', icon: BookOpen },
    { label: 'My Profile', href: '/profile', icon: UserCircle },
    { label: 'Subscription', href: '/subscription', icon: Crown },
    { label: 'Settings', href: '/settings', icon: Gear },
];

/** Floating ethereal glass sidebar component. */
export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { user, isLoaded } = useUser();
    const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({});

    /** Compute which nav groups are expanded. */
    const expandedItems = useMemo(() => {
        const autoExpanded: Record<string, boolean> = {};
        if (pathname) {
            for (const item of navItems) {
                if (item.children && (pathname === item.href || pathname.startsWith(item.href + '/'))) {
                    autoExpanded[item.href] = true;
                }
            }
        }
        return { ...autoExpanded, ...manualExpanded };
    }, [pathname, manualExpanded]);

    /** Toggle sub-menu. */
    const toggleExpand = useCallback((href: string) => {
        setManualExpanded((prev) => ({ ...prev, [href]: !expandedItems[href] }));
    }, [expandedItems]);

    return (
        <motion.aside
            layout
            initial={false}
            animate={{ width: collapsed ? 80 : 280 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="sticky top-6 h-[calc(100dvh-3rem)] z-40 flex flex-col flex-shrink-0 glass-ethereal rounded-[2rem] overflow-visible"
        >
            {/* Logo */}
            <div className="flex items-center px-6 h-[88px] flex-shrink-0">
                <Link href="/dashboard" className="flex items-center gap-4 no-underline">
                        <motion.div
                        layout="position"
                        className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(135deg, #FFFFFF 0%, #F1F5F9 100%)',
                            border: '1px solid rgba(255, 255, 255, 0.4)',
                            boxShadow: '0 4px 10px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,1)',
                        }}
                    >
                        <span 
                            className="text-[26px] font-black font-serif italic uppercase tracking-tighter" 
                            style={{
                                background: 'linear-gradient(135deg, #0A1128 0%, #1E3A8A 30%, #94A3B8 60%, #0A1128 100%)',
                                backgroundSize: '200% auto',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                                color: 'transparent',
                                animation: 'shimmer-bg 4s linear infinite',
                            }}
                        >
                            N
                        </span>
                    </motion.div>
                    <AnimatePresence mode="popLayout">
                        {!collapsed && (
                            <motion.span
                                initial={{ opacity: 0, filter: 'blur(4px)', x: -10 }}
                                animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
                                exit={{ opacity: 0, filter: 'blur(4px)', x: -10 }}
                                transition={{ duration: 0.2 }}
                                className="text-2xl font-serif font-bold tracking-wide"
                                style={{ color: 'var(--pure-white)' }}
                            >
                                NEXX
                            </motion.span>
                        )}
                    </AnimatePresence>
                </Link>
            </div>

            {/* Divider */}
            <div className="mx-6 primary-divider opacity-50" />

            {/* Case Switcher */}
            {!collapsed && (
                <div className="py-3">
                    <CaseSwitcher />
                </div>
            )}

            {/* Navigation — CSS override for overflow when driver.js tour is active (see globals.css) */}
            <nav className="flex-1 py-6 px-4 space-y-1.5 overflow-y-auto overflow-x-hidden no-scrollbar sidebar-nav">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                    const hasChildren = item.children && item.children.length > 0;
                    const isExpanded = expandedItems[item.href] ?? false;
                    const Icon = item.icon;

                    return (
                        <div key={item.href}>
                            <div className="flex items-center">
                                <Link
                                    href={item.href}
                                    id={navIdSelector(item.href).slice(1)}
                                    className="no-underline flex-1 min-w-0"
                                >
                                    <motion.div
                                        whileTap={{ scale: 0.96 }}
                                        className={`group relative flex items-center gap-3.5 px-3.5 py-3 rounded-2xl transition-all duration-300 hover:bg-white/10 ${collapsed ? 'justify-center' : ''}`}
                                        style={{
                                            background: isActive && !hasChildren
                                                ? 'linear-gradient(135deg,rgba(255,255,255,0.15),rgba(255,255,255,0.05))'
                                                : isActive && hasChildren
                                                    ? 'rgba(255, 255, 255, 0.1)'
                                                    : 'transparent',
                                            boxShadow: isActive && !hasChildren ? '0 4px 12px rgba(0,0,0,0.2)' : 'none',
                                            border: isActive && !hasChildren ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                                        }}
                                    >
                                        <div className={`transition-colors duration-300 flex items-center justify-center ${isActive ? 'text-white' : 'text-[#94A3B8] group-hover:text-white'}`}>
                                            <Icon size={20} weight={isActive ? "fill" : "regular"} style={{ color: 'currentColor' }} />
                                        </div>
                                        <AnimatePresence mode="popLayout">
                                            {!collapsed && (
                                                <motion.span
                                                    initial={{ opacity: 0, width: 0 }}
                                                    animate={{ opacity: 1, width: 'auto' }}
                                                    exit={{ opacity: 0, width: 0 }}
                                                    className={`text-[14px] font-medium whitespace-nowrap flex-1 transition-colors duration-300 ${isActive ? 'text-white' : 'text-white/70 group-hover:text-white'}`}
                                                >
                                                    {item.label}
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                        
                                        {/* Active Indicator Dot */}
                                        {isActive && !hasChildren && collapsed && (
                                            <motion.div 
                                                layoutId="sidebar-active-indicator"
                                                className="absolute right-1 w-1.5 h-1.5 rounded-full bg-[var(--champagne)] shadow-[0_0_8px_var(--champagne)]"
                                            />
                                        )}
                                    </motion.div>
                                </Link>

                                {hasChildren && !collapsed && (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleExpand(item.href);
                                        }}
                                        className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all hover:bg-white/40 flex-shrink-0 ml-1 text-sapphire-muted hover:text-sapphire"
                                    >
                                        <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ type: 'spring' }}>
                                            <CaretDown size={14} weight="bold" />
                                        </motion.div>
                                    </button>
                                )}
                            </div>

                            <AnimatePresence>
                                {hasChildren && isExpanded && !collapsed && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="ml-7 pl-3 mt-1.5 mb-2 space-y-1 border-l border-[rgba(10,22,41,0.08)]">
                                            {item.children!.map((child) => {
                                                const isChildActive = pathname === child.href || pathname?.startsWith(child.href + '/');
                                                const ChildIcon = child.icon;
                                                return (
                                                    <Link key={child.href} href={child.href} className="no-underline block">
                                                        <motion.div
                                                            whileHover={{ x: 4 }}
                                                            className="group flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-300 hover:bg-white/10"
                                                            style={{
                                                                background: isChildActive ? 'rgba(255,255,255,0.15)' : 'transparent',
                                                                border: isChildActive ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                                                            }}
                                                        >
                                                            <div className={`transition-colors duration-300 flex items-center justify-center ${isChildActive ? 'text-[var(--champagne)]' : 'text-[#94A3B8] group-hover:text-white'}`}>
                                                                <ChildIcon size={16} weight={isChildActive ? "fill" : "regular"} style={{ color: 'currentColor' }} />
                                                            </div>
                                                            <span className={`text-[13px] font-medium transition-colors duration-300 ${isChildActive ? 'text-white' : 'text-white/70 group-hover:text-white'}`}>
                                                                {child.label}
                                                            </span>
                                                        </motion.div>
                                                    </Link>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </nav>

            {/* Bottom User Section */}
            <div className="px-5 pb-6 pt-4 mt-auto">
                <div className="primary-divider mb-4 opacity-50" />

                {/* Generate Report CTA — the primary action trigger */}
                <button
                    onClick={() => {
                        // Navigate to overview first, then open the modal
                        const pathname = window.location.pathname;
                        if (pathname.includes('/chat/overview')) {
                            window.dispatchEvent(new CustomEvent('nexx:open-report-modal'));
                        } else {
                            window.location.href = '/chat/overview?openReportModal=true';
                        }
                    }}
                    title="Generate a structured report from your workspace data"
                    aria-label="Generate report"
                    className={`flex items-center gap-3 w-full px-3.5 py-3 mb-3 rounded-2xl transition-all duration-300 cursor-pointer bg-gradient-to-r from-[var(--accent-emerald)]/20 to-[var(--accent-emerald)]/10 border border-[var(--accent-emerald)]/20 hover:from-[var(--accent-emerald)]/30 hover:to-[var(--accent-emerald)]/15 hover:border-[var(--accent-emerald)]/30 ${collapsed ? 'justify-center' : ''}`}
                >
                    <FileText size={18} weight="bold" className="text-[var(--accent-emerald)] flex-shrink-0" />
                    <AnimatePresence mode="popLayout">
                        {!collapsed && (
                            <motion.span
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: 'auto' }}
                                exit={{ opacity: 0, width: 0 }}
                                className="text-[13px] font-bold whitespace-nowrap overflow-hidden text-[var(--accent-emerald)]"
                            >
                                Generate Report
                            </motion.span>
                        )}
                    </AnimatePresence>
                </button>
                <button
                    onClick={restartTour}
                    title="Replay onboarding tour"
                    aria-label="Replay onboarding tour"
                    className={`flex items-center gap-3 w-full px-3.5 py-2.5 mb-3 rounded-2xl transition-all duration-300 cursor-pointer text-[#94A3B8] hover:text-white hover:bg-white/10 border border-transparent hover:border-white/10 ${collapsed ? 'justify-center' : ''}`}
                >
                    <Question size={18} weight="bold" />
                    <AnimatePresence mode="popLayout">
                        {!collapsed && (
                            <motion.span
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: 'auto' }}
                                exit={{ opacity: 0, width: 0 }}
                                className="text-[13px] font-semibold whitespace-nowrap overflow-hidden"
                            >
                                Take a Tour
                            </motion.span>
                        )}
                    </AnimatePresence>
                </button>

                {/* Theme Toggle */}
                <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2 px-2'} mb-2`}>
                    <ThemeToggle collapsed={collapsed} />
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="text-[12px] font-medium text-sapphire-muted"
                            >
                                Theme
                            </motion.span>
                        )}
                    </AnimatePresence>
                </div>

                {isLoaded && user ? (
                    <div className="relative group w-full">
                        {/* Visual layer */}
                        <div className={`flex items-center gap-3.5 px-3 py-3 rounded-2xl transition-all cursor-pointer bg-[linear-gradient(135deg,#123D7E,#0A1128)] border border-white/20 hover:border-white/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_8px_24px_rgba(0,0,0,0.4)] hover:-translate-y-0.5 group-hover:shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_12px_32px_rgba(0,0,0,0.5)] ${collapsed ? 'justify-center' : ''}`}>
                            <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-white/30 shadow-sm relative z-0">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={user.imageUrl} alt={user.fullName || 'User'} className="w-full h-full object-cover" />
                            </div>
                            <AnimatePresence>
                                {!collapsed && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-w-0 relative z-0">
                                        <p className="text-[14px] font-bold truncate text-white leading-tight capitalize tracking-wide drop-shadow-sm">
                                            {user.firstName || user.fullName || 'User'}
                                        </p>
                                        <p className="text-[12px] truncate text-white/80 font-semibold mt-0.5 tracking-wider drop-shadow-sm">
                                            Owner Account
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        
                        {/* Functional Click Layer */}
                        <div className="absolute inset-0 z-10 opacity-0 overflow-hidden cursor-pointer" title="Account Settings">
                            <UserButton 
                                appearance={{
                                    ...nexxClerkAppearance,
                                    elements: {
                                        ...nexxClerkAppearance.elements,
                                        rootBox: { width: '100%', height: '100%' },
                                        userButtonTrigger: { width: '100%', height: '100%', borderRadius: '16px' },
                                        userButtonAvatarBox: { display: 'none' }
                                    }
                                }}
                            />
                        </div>
                    </div>
                ) : isLoaded && !user ? (
                    <Link href="/sign-in" className="no-underline block">
                        <div className={`flex items-center gap-3.5 px-3 py-3 rounded-2xl transition-colors hover:bg-white/40 ${collapsed ? 'justify-center' : ''}`}>
                            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm border border-[rgba(10,22,41,0.05)]">
                                <SignIn size={18} style={{ color: 'var(--sapphire)' }} />
                            </div>
                            <AnimatePresence>
                                {!collapsed && (
                                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-sm font-semibold text-sapphire">
                                        Sign In safely
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </div>
                    </Link>
                ) : <div className="h-[60px]" />}
            </div>

            {/* Floating Collapse Toggle */}
            <button
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="absolute -right-4 top-12 w-8 h-8 rounded-full flex items-center justify-center glass-ethereal shadow-[0_4px_12px_rgba(10,22,41,0.06)] transition-all hover:scale-110 z-50 text-sapphire hover:text-champagne cursor-pointer border border-white"
            >
                <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                    <CaretLeft size={14} weight="bold" />
                </motion.div>
            </button>
        </motion.aside>
    );
}
