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
            className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8 pt-4 px-1"
        >
            <div className="flex items-center gap-4">
                {Icon && (
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/5 border border-indigo-500/20 flex items-center justify-center shadow-lg shrink-0">
                        <Icon size={20} weight="light" className="text-indigo-400" />
                    </div>
                )}
                <div>
                    <h1 className="text-2xl font-serif text-headline text-white m-0 tracking-tight flex items-center gap-2">
                        {title}
                    </h1>
                    {description && (
                        <p className="text-[13px] text-white/40 mt-0.5 max-w-xl leading-relaxed">
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

/** Full-width page wrapper with consistent padding for all application routes. */
export function PageContainer({ children }: { children: ReactNode }) {
    return (
        <div className="max-w-[85rem] mx-auto h-[calc(100dvh-76px)] w-full px-4 lg:px-8 mt-2 flex flex-col overflow-hidden">
            {children}
        </div>
    );
}
