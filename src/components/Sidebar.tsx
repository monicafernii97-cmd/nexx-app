'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
    SquaresFour,
    ChatCircle,
    Vault,
    ClipboardText,
    ShieldWarning,
    Scales,
    FileArrowUp,
    BookOpen,
    UserCircle,
    GearSix,
    CaretLeft,
    CaretRight,
    CaretDown,
    SignIn,
    GridFour,
    FolderOpen,
} from '@phosphor-icons/react';
import { useState, useMemo, useCallback, type ComponentType } from 'react';
import { UserButton, useUser } from '@clerk/nextjs';
import { nexxClerkAppearance } from '@/lib/clerk-theme';

/** Child navigation item definition for sidebar sub-menus. */
interface NavChild {
    label: string;
    href: string;
    icon: ComponentType<{ size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone' }>;
}

/** Top-level navigation item with optional expandable children. */
interface NavItem {
    label: string;
    href: string;
    icon: ComponentType<{ size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone' }>;
    children?: NavChild[];
}

/** Ordered list of sidebar navigation items with DocuVault sub-routes. */
const navItems: NavItem[] = [
    { label: 'Dashboard', href: '/dashboard', icon: SquaresFour },
    { label: 'Chat', href: '/chat', icon: ChatCircle },
    {
        label: 'DocuVault',
        href: '/docuvault',
        icon: Vault,
        children: [
            { label: 'Template Gallery', href: '/docuvault/templates', icon: GridFour },
            { label: 'Saved Documents', href: '/docuvault/gallery', icon: FolderOpen },
        ],
    },
    { label: 'Incident Report', href: '/incident-report', icon: ClipboardText },
    { label: 'NEX Profile', href: '/nex-profile', icon: ShieldWarning },
    { label: 'Legal Suite', href: '/court-settings', icon: Scales },
    { label: 'eFiling', href: '/efiling', icon: FileArrowUp },
    { label: 'Resources', href: '/resources', icon: BookOpen },
    { label: 'My Profile', href: '/profile', icon: UserCircle },
    { label: 'Settings', href: '/settings', icon: GearSix },
];

/** Collapsible navigation sidebar with branded logo, nav items, user info, and auth state. */
export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { user, isLoaded } = useUser();
    const [manualExpanded, setManualExpanded] = useState<Record<string, boolean>>({});

    /** Compute which nav groups are expanded — auto-expand active parent routes, merge manual overrides. */
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

    /** Toggle the expanded/collapsed state of a parent nav item's children. */
    const toggleExpand = useCallback((href: string) => {
        setManualExpanded((prev) => ({ ...prev, [href]: !expandedItems[href] }));
    }, [expandedItems]);

    return (
        <motion.aside
            animate={{ width: collapsed ? 72 : 260 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 h-screen z-50 flex flex-col"
            style={{
                background: 'var(--zinc-900)',
                borderRight: '1px solid rgba(63, 63, 70, 0.4)',
            }}
        >
            {/* Logo */}
            <div className="flex items-center px-5 h-[72px] flex-shrink-0">
                <Link href="/dashboard" className="flex items-center gap-3 no-underline">
                    <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{
                            background: 'var(--emerald-600)',
                            boxShadow: '0 4px 12px rgba(5, 150, 105, 0.25)',
                        }}
                    >
                        <span className="text-sm font-bold text-white tracking-tight">N</span>
                    </div>
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.span
                                initial={{ opacity: 0, x: -8 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -8 }}
                                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                className="text-lg font-bold tracking-tight"
                                style={{ color: 'var(--zinc-100)' }}
                            >
                                NEXX
                            </motion.span>
                        )}
                    </AnimatePresence>
                </Link>
            </div>

            {/* Divider */}
            <div className="mx-5 divider" />

            {/* Navigation */}
            <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
                {navItems.map((item) => {
                    const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
                    const hasChildren = item.children && item.children.length > 0;
                    const isExpanded = expandedItems[item.href] ?? false;
                    const Icon = item.icon;

                    return (
                        <div key={item.href}>
                            {/* Parent nav item */}
                            <div className="flex items-center">
                                <Link
                                    href={item.href}
                                    aria-current={pathname === item.href ? 'page' : undefined}
                                    className="no-underline flex-1 min-w-0"
                                >
                                    <motion.div
                                        whileHover={{ x: 2 }}
                                        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${collapsed ? 'justify-center' : ''
                                            }`}
                                        style={{
                                            background: isActive
                                                ? 'rgba(16, 185, 129, 0.1)'
                                                : 'transparent',
                                            color: isActive ? 'var(--emerald-400)' : 'var(--zinc-400)',
                                        }}
                                    >
                                        <Icon size={20} weight={isActive ? 'fill' : 'regular'} />
                                        <AnimatePresence>
                                            {!collapsed && (
                                                <motion.span
                                                    initial={{ opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={{ opacity: 0 }}
                                                    className="text-sm font-medium whitespace-nowrap flex-1"
                                                    style={{
                                                        color: isActive ? 'var(--zinc-100)' : 'var(--zinc-400)',
                                                    }}
                                                >
                                                    {item.label}
                                                </motion.span>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                </Link>

                                {/* Expand/collapse chevron for items with children */}
                                {hasChildren && !collapsed && (
                                    <button
                                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${item.label} submenu`}
                                        aria-expanded={isExpanded}
                                        aria-controls={`submenu-${item.href.replace(/\W/g, '-')}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleExpand(item.href);
                                        }}
                                        className="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer transition-all duration-200 flex-shrink-0 mr-1"
                                        style={{
                                            background: 'transparent',
                                            color: 'var(--zinc-500)',
                                            border: 'none',
                                        }}
                                    >
                                        <motion.div
                                            animate={{ rotate: isExpanded ? 180 : 0 }}
                                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                                        >
                                            <CaretDown size={14} />
                                        </motion.div>
                                    </button>
                                )}
                            </div>

                            {/* Child nav items */}
                            <AnimatePresence>
                                {hasChildren && isExpanded && !collapsed && (
                                    <motion.div
                                        id={`submenu-${item.href.replace(/\W/g, '-')}`}
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="ml-5 pl-4 mt-1 mb-1 space-y-0.5" style={{ borderLeft: '1px solid rgba(63, 63, 70, 0.3)' }}>
                                            {item.children!.map((child) => {
                                                const isChildActive =
                                                    pathname === child.href ||
                                                    pathname?.startsWith(child.href + '/');
                                                const ChildIcon = child.icon;
                                                return (
                                                    <Link
                                                        key={child.href}
                                                        href={child.href}
                                                        aria-current={isChildActive ? 'page' : undefined}
                                                        className="no-underline"
                                                    >
                                                        <motion.div
                                                            whileHover={{ x: 2 }}
                                                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                                            className="flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200"
                                                            style={{
                                                                background: isChildActive
                                                                    ? 'rgba(16, 185, 129, 0.08)'
                                                                    : 'transparent',
                                                                color: isChildActive ? 'var(--zinc-100)' : 'var(--zinc-500)',
                                                            }}
                                                        >
                                                            <ChildIcon size={15} weight={isChildActive ? 'fill' : 'regular'} />
                                                            <span className="text-xs font-medium whitespace-nowrap">
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

            {/* User Section */}
            <div className="px-3 pb-4 space-y-2">
                <div className="mx-2 divider mb-3" />

                {isLoaded && user ? (
                    /* ─── Authenticated: Clerk UserButton + user info ─── */
                    <div
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors hover:bg-[rgba(63,63,70,0.3)] ${collapsed ? 'justify-center' : ''
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
                                    <p className="text-sm font-medium truncate" style={{ color: 'var(--zinc-200)' }}>
                                        {user.firstName || user.fullName || 'User'}
                                    </p>
                                    <p className="text-xs truncate" style={{ color: 'var(--zinc-500)' }}>
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
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-colors hover:bg-[rgba(63,63,70,0.3)] ${collapsed ? 'justify-center' : ''
                                }`}
                        >
                            <div
                                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                                style={{ background: 'rgba(63, 63, 70, 0.4)', border: '1px solid rgba(63, 63, 70, 0.6)' }}
                            >
                                <SignIn size={16} style={{ color: 'var(--zinc-300)' }} />
                            </div>
                            <AnimatePresence>
                                {!collapsed && (
                                    <motion.span
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="text-sm font-medium"
                                        style={{ color: 'var(--zinc-300)' }}
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
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center cursor-pointer
          transition-all duration-200 hover:scale-110"
                style={{
                    background: 'var(--zinc-800)',
                    border: '1px solid rgba(63, 63, 70, 0.6)',
                    color: 'var(--zinc-400)',
                }}
            >
                {collapsed ? <CaretRight size={12} /> : <CaretLeft size={12} />}
            </button>
        </motion.aside>
    );
}
