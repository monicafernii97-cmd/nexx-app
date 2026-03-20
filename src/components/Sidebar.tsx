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
    CaretRight,
    CaretDown,
    SignIn,
    GridFour,
    FolderOpen,
    FileArrowUp,
} from '@phosphor-icons/react';
import { useState, useMemo, useCallback, type ComponentType, type CSSProperties } from 'react';
import { UserButton, useUser } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';

/** Child navigation item definition for sidebar sub-menus. */
interface NavChild {
    label: string;
    href: string;
    icon: ComponentType<{ size?: number; weight?: string; style?: CSSProperties }>;
}

/** Top-level navigation item with optional expandable children. */
interface NavItem {
    label: string;
    href: string;
    icon: ComponentType<{ size?: number; weight?: string; style?: CSSProperties }>;
    children?: NavChild[];
}

/** Ordered list of sidebar navigation items with DocuVault sub-routes. */
const navItems: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: SquaresFour },
    { label: 'Chat', href: '/chat', icon: ChatCircleText },
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
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm"
                        style={{
                            background: 'linear-gradient(135deg, var(--white), var(--cloud))',
                            border: '1px solid var(--border-light)',
                        }}
                    >
                        <span className="text-lg font-black font-sans" style={{ color: 'var(--sapphire)' }}>N</span>
                    </motion.div>
                    <AnimatePresence mode="popLayout">
                        {!collapsed && (
                            <motion.span
                                initial={{ opacity: 0, filter: 'blur(4px)', x: -10 }}
                                animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
                                exit={{ opacity: 0, filter: 'blur(4px)', x: -10 }}
                                transition={{ duration: 0.2 }}
                                className="text-xl font-serif font-bold tracking-widest text-sapphire"
                                style={{ color: 'var(--sapphire)' }}
                            >
                                NEXX
                            </motion.span>
                        )}
                    </AnimatePresence>
                </Link>
            </div>

            {/* Divider */}
            <div className="mx-6 primary-divider opacity-50" />

            {/* Navigation */}
            <nav className="flex-1 py-6 px-4 space-y-1.5 overflow-y-auto overflow-x-hidden no-scrollbar">
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
                                    className="no-underline flex-1 min-w-0"
                                >
                                    <motion.div
                                        whileHover={{ scale: 0.98, backgroundColor: 'rgba(255,255,255,0.4)' }}
                                        whileTap={{ scale: 0.96 }}
                                        className={`relative flex items-center gap-3.5 px-3.5 py-3 rounded-2xl transition-all duration-300 ${collapsed ? 'justify-center' : ''}`}
                                        style={{
                                            background: isActive && !hasChildren
                                                ? 'var(--white)'
                                                : isActive && hasChildren
                                                    ? 'rgba(255, 255, 255, 0.4)'
                                                    : 'transparent',
                                            boxShadow: isActive && !hasChildren ? '0 4px 12px rgba(10,22,41,0.03)' : 'none',
                                            border: isActive && !hasChildren ? '1px solid rgba(10,22,41,0.05)' : '1px solid transparent',
                                        }}
                                    >
                                        <Icon 
                                            size={20} 
                                            weight={isActive ? "fill" : "regular"}
                                            style={{ color: isActive ? 'var(--champagne)' : 'var(--sapphire-muted)' }}
                                        />
                                        <AnimatePresence mode="popLayout">
                                            {!collapsed && (
                                                <motion.span
                                                    initial={{ opacity: 0, width: 0 }}
                                                    animate={{ opacity: 1, width: 'auto' }}
                                                    exit={{ opacity: 0, width: 0 }}
                                                    className="text-[14px] font-medium whitespace-nowrap flex-1"
                                                    style={{ color: isActive ? 'var(--sapphire)' : 'var(--sapphire-muted)' }}
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
                                                            whileHover={{ x: 4, backgroundColor: 'rgba(255,255,255,0.5)' }}
                                                            className="flex items-center gap-2.5 px-3 py-2 rounded-xl transition-colors"
                                                            style={{
                                                                background: isChildActive ? 'var(--white)' : 'transparent',
                                                                boxShadow: isChildActive ? '0 2px 8px rgba(10,22,41,0.02)' : 'none',
                                                            }}
                                                        >
                                                            <ChildIcon size={16} weight={isChildActive ? "fill" : "regular"} style={{ color: isChildActive ? 'var(--champagne)' : '#94A3B8' }} />
                                                            <span className="text-[13px] font-medium" style={{ color: isChildActive ? 'var(--sapphire)' : 'var(--sapphire-muted)' }}>
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

                {isLoaded && user ? (
                    <div className={`flex items-center gap-3.5 px-3 py-3 rounded-2xl transition-colors hover:bg-white/40 ${collapsed ? 'justify-center' : ''}`}>
                        <UserButton
                            appearance={{
                                ...nexxClerkAppearance,
                                elements: {
                                    ...nexxClerkAppearance.elements,
                                    userButtonAvatarBox: { width: 36, height: 36, boxShadow: '0 2px 8px rgba(10,22,41,0.08)' },
                                },
                            }}
                        />
                        <AnimatePresence>
                            {!collapsed && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 min-w-0">
                                    <p className="text-[14px] font-semibold truncate text-sapphire leading-tight">
                                        {user.firstName || user.fullName || 'User'}
                                    </p>
                                    <p className="text-[12px] truncate text-sapphire-muted font-medium mt-0.5">
                                        Owner Account
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
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
