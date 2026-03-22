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
                    <motion.div
                        animate={{ y: [0, -6, 0] }}
                        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                        className="w-16 h-16 rounded-[1.25rem] flex items-center justify-center glass-ethereal shadow-[0_12px_40px_rgba(18,61,126,0.8)] relative overflow-hidden flex-shrink-0 group"
                    >
                        {/* Shimmer overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent opacity-50" />
                        
                        {/* Icon glow */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 blur-xl rounded-full" />
                        
                        <Icon 
                            size={32} 
                            weight="duotone" 
                            className="text-white relative z-10 drop-shadow-[0_2px_15px_rgba(255,255,255,0.7)] group-hover:scale-110 transition-transform duration-500" 
                        />
                    </motion.div>
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
