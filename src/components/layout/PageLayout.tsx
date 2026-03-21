'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

export interface PageHeaderProps {
    /** A Phosphor Icon Component */
    icon: React.ElementType;
    title: ReactNode;
    description: ReactNode;
    rightElement?: ReactNode;
}

export function PageHeader({ icon: Icon, title, description, rightElement }: PageHeaderProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 pt-12 px-2"
        >
            <div>
                <div className="flex items-center gap-4 mb-3">
                    <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[linear-gradient(135deg,#123D7E,#0A1128)] border border-white/20 shadow-[0_8px_30px_rgba(18,61,126,0.6)] relative overflow-hidden flex-shrink-0"
                    >
                        <div className="absolute inset-0 bg-white/5 backdrop-blur-sm" />
                        <Icon size={28} weight="duotone" className="text-white relative z-10 drop-shadow-[0_2px_10px_rgba(255,255,255,0.3)]" />
                    </div>
                    <h1 className="text-4xl font-serif text-headline text-white m-0 tracking-tight flex items-center gap-2">
                        {title}
                    </h1>
                </div>
                <p className="text-[15px] font-medium text-white/70 max-w-lg">
                    {description}
                </p>
            </div>
            {rightElement && (
                <div className="flex-shrink-0 mb-1">
                    {rightElement}
                </div>
            )}
        </motion.div>
    );
}

export function PageContainer({ children }: { children: ReactNode }) {
    return (
        <div className="max-w-[85rem] mx-auto pb-20 w-full px-6 lg:px-12 mt-4">
            {children}
        </div>
    );
}
