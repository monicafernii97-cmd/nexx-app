'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

export interface PageHeaderProps {
    /** A Phosphor Icon Component */
    icon: React.ElementType;
    title: ReactNode;
    description?: ReactNode;
    rightElement?: ReactNode;
}

/** Renders the page-level header with an icon, title, optional description and right-aligned element. */
export function PageHeader({ icon: Icon, title, description, rightElement }: PageHeaderProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 lg:mb-10 pt-2"
        >
            <div className="flex items-start gap-4 lg:gap-5">
                {Icon && (
                    <div className="w-12 h-12 rounded-2xl hyper-glass flex items-center justify-center shadow-[0_8px_24px_rgba(0,0,0,0.2)] shrink-0 mt-0.5">
                        <Icon size={24} weight="regular" className="text-indigo-400" />
                    </div>
                )}
                <div className="space-y-1.5">
                    <h1 className="text-2xl lg:text-3xl font-serif text-white tracking-tight leading-tight">
                        {title}
                    </h1>
                    {description && (
                        <p className="text-[13px] font-medium text-white/40 max-w-2xl leading-relaxed tracking-wide">
                            {description}
                        </p>
                    )}
                </div>
            </div>
            {rightElement && (
                <div className="flex-shrink-0">
                    {rightElement}
                </div>
            )}
        </motion.div>
    );
}

/**
 * Full-width page wrapper with consistent padding for all application routes.
 *
 * By default, the container allows vertical scrolling for content-heavy pages.
 * Pass `lockHeight` to enforce a no-scroll layout — but only on desktop (lg+).
 * On mobile, all pages are always scrollable since viewport space is limited.
 */
export function PageContainer({
    children,
    lockHeight = false,
    noHorizontalPadding = false,
}: {
    children: ReactNode;
    lockHeight?: boolean;
    noHorizontalPadding?: boolean;
}) {
    return (
        <div className={`max-w-[72rem] mx-auto w-full py-8 lg:py-12 flex flex-col ${
            noHorizontalPadding ? '' : 'px-6 lg:px-16'
        } ${
            lockHeight
                ? 'min-h-[calc(100dvh-60px)] lg:h-[calc(100dvh-76px)] lg:overflow-hidden'
                : 'min-h-[calc(100dvh-60px)]'
        }`}>
            {children}
        </div>
    );
}
