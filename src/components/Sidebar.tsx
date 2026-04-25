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
    GridFour,
    FolderOpen,
    FileArrowUp,
    Crown,
    PushPin,
    Notebook,
    CalendarCheck,
    FileText,
    IconWeight,
} from '@phosphor-icons/react';
import { useState, useMemo, useCallback, type ComponentType, type CSSProperties } from 'react';
import { UserButton, useUser } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';
import { navIdSelector } from '@/lib/tourUtils';

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
            animate={{ width: collapsed ? 64 : 240 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="sticky top-4 h-[calc(100dvh-2rem)] z-40 flex flex-col flex-shrink-0 hyper-glass rounded-[1.5rem] overflow-visible glow-slate"
        >
            {/* Logo */}
            <div className="flex items-center px-6 h-[64px] flex-shrink-0">
                <Link href="/dashboard" className="flex items-center gap-3 no-underline group">
                        <motion.div
                        layout="position"
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-xl relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(135deg, #FFFFFF 0%, #F1F5F9 100%)',
                            border: '1px solid rgba(255, 255, 255, 0.4)',
                        }}
                    >
                        <span 
                            className="text-[18px] font-black font-serif italic uppercase tracking-tighter" 
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
                                className="text-lg font-serif font-bold tracking-tight text-white group-hover:text-indigo-200 transition-colors"
                            >
                                NEXX
                            </motion.span>
                        )}
                    </AnimatePresence>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 px-4 space-y-1.5 overflow-y-auto overflow-x-hidden no-scrollbar sidebar-nav">
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
                                    aria-label={collapsed ? item.label : undefined}
                                    title={collapsed ? item.label : undefined}
                                >
                                    <motion.div
                                        whileTap={{ scale: 0.98 }}
                                        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 ${collapsed ? 'justify-center' : ''}`}
                                        style={{
                                            background: isActive && !hasChildren
                                                ? 'rgba(255,255,255,0.08)'
                                                : 'transparent',
                                            border: isActive && !hasChildren ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
                                        }}
                                    >
                                        <div className={`transition-colors duration-300 flex items-center justify-center ${isActive ? 'text-indigo-400' : 'text-white/20 group-hover:text-white'}`}>
                                            <Icon size={20} weight={isActive ? "fill" : "light"} />
                                        </div>
                                        <AnimatePresence mode="popLayout">
                                            {!collapsed && (
                                                <motion.span
                                                    initial={{ opacity: 0, width: 0 }}
                                                    animate={{ opacity: 1, width: 'auto' }}
                                                    exit={{ opacity: 0, width: 0 }}
                                                    className={`text-[13px] font-bold tracking-tight whitespace-nowrap flex-1 transition-colors duration-300 ${isActive ? 'text-white' : 'text-white/30 group-hover:text-white'}`}
                                                >
                                                    {item.label}
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                        
                                        {/* Active Indicator Glow */}
                                        {isActive && !hasChildren && (
                                            <motion.div 
                                                layoutId="sidebar-active-glow"
                                                className="absolute inset-0 bg-indigo-500/5 blur-xl rounded-xl -z-10"
                                            />
                                        )}
                                    </motion.div>
                                </Link>

                                {hasChildren && !collapsed && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleExpand(item.href);
                                        }}
                                        aria-label={isExpanded ? `Collapse ${item.label}` : `Expand ${item.label}`}
                                        aria-expanded={isExpanded}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all hover:bg-white/5 flex-shrink-0 ml-1 text-white/20 hover:text-white"
                                    >
                                        <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}>
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
                                        <div className="ml-8 pl-3 mt-1.5 mb-2 space-y-1 border-l border-white/5">
                                            {item.children!.map((child) => {
                                                const isChildActive = pathname === child.href || pathname?.startsWith(child.href + '/');
                                                const ChildIcon = child.icon;
                                                return (
                                                    <Link key={child.href} href={child.href} className="no-underline block">
                                                        <motion.div
                                                            whileHover={{ x: 4 }}
                                                            className="group flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-300 hover:bg-white/5"
                                                        >
                                                            <div className={`transition-colors duration-300 flex items-center justify-center ${isChildActive ? 'text-indigo-400' : 'text-white/20 group-hover:text-white'}`}>
                                                                <ChildIcon size={16} weight={isChildActive ? "fill" : "light"} />
                                                            </div>
                                                            <span className={`text-[12px] font-bold tracking-tight transition-colors duration-300 ${isChildActive ? 'text-white' : 'text-white/30 group-hover:text-white'}`}>
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
            <div className="px-4 pb-6 pt-2 mt-auto space-y-4">
                {/* Generate Report CTA */}
                <button
                    onClick={() => {
                        const pathname = window.location.pathname;
                        if (pathname.includes('/chat/overview')) {
                            window.dispatchEvent(new CustomEvent('nexx:open-report-modal'));
                        } else {
                            window.location.href = '/chat/overview?openReportModal=true';
                        }
                    }}
                    aria-label="Generate report"
                    title={collapsed ? 'Generate report' : undefined}
                    className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-xl transition-all duration-300 cursor-pointer bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 group ${collapsed ? 'justify-center' : ''}`}
                >
                    <FileText size={18} weight="bold" className="text-indigo-400 flex-shrink-0" />
                    <AnimatePresence mode="popLayout">
                        {!collapsed && (
                            <motion.span
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: 'auto' }}
                                exit={{ opacity: 0, width: 0 }}
                                className="text-[12px] font-bold uppercase tracking-[0.2em] whitespace-nowrap overflow-hidden text-indigo-400"
                            >
                                Generate
                            </motion.span>
                        )}
                    </AnimatePresence>
                </button>

                {isLoaded && user ? (
                    <div className="relative group focus-within:ring-2 focus-within:ring-indigo-500/40 rounded-xl w-full">
                        {/* Visual layer */}
                        <div className={`flex items-center gap-3 px-3 py-3 rounded-xl transition-all cursor-pointer bg-white/[0.03] border border-white/5 hover:border-white/20 shadow-2xl ${collapsed ? 'justify-center' : ''}`}>
                            <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/20 shadow-inner">
                                <img src={user.imageUrl} alt={user.fullName || 'User'} className="w-full h-full object-cover" />
                            </div>
                            <AnimatePresence>
                                {!collapsed && (
                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-w-0">
                                        <p className="text-[12px] font-bold truncate text-white leading-tight">
                                            {user.firstName || 'Owner'}
                                        </p>
                                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/20 mt-1">
                                            Premium
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        
                        {/* Functional Click Layer — focus-visible makes it perceivable to keyboard users */}
                        <div className="absolute inset-0 z-10 opacity-0 focus-within:opacity-100 cursor-pointer" aria-label="User profile menu">
                            <UserButton 
                                appearance={{
                                    ...nexxClerkAppearance,
                                    elements: {
                                        ...nexxClerkAppearance.elements,
                                        rootBox: { width: '100%', height: '100%' },
                                        userButtonTrigger: { width: '100%', height: '100%', borderRadius: '24px' },
                                        userButtonAvatarBox: { display: 'none' }
                                    }
                                }}
                            />
                        </div>
                    </div>
                ) : <div className="h-[56px]" />}
            </div>

            {/* Floating Collapse Toggle */}
            <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="absolute -right-4 top-12 w-8 h-8 rounded-full flex items-center justify-center hyper-glass border border-white/10 shadow-xl transition-all hover:scale-110 z-50 text-white/40 hover:text-white cursor-pointer"
            >
                <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ type: "spring", stiffness: 300, damping: 20 }}>
                    <CaretLeft size={14} weight="bold" />
                </motion.div>
            </button>
        </motion.aside>
    );
}
