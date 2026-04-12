'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { WarningCircle, ArrowRight } from '@phosphor-icons/react';
import Link from 'next/link';

interface EmptyStateProps {
    icon: React.ElementType;
    title: string;
    description: string;
    actionLabel?: string;
    actionHref?: string;
}

/** 
 * Shared Empty State component for workspace views.
 * Matches the "Pristine Record" pattern from the dashboard.
 */
export function EmptyState({
    icon: Icon,
    title,
    description,
    actionLabel,
    actionHref,
}: EmptyStateProps) {
    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-[rgba(10,17,40,0.5)] rounded-[2.5rem] border border-[rgba(255,255,255,0.08)] backdrop-blur-md"
        >
            <div className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center bg-[linear-gradient(135deg,#1A4B9B,#123D7E)] shadow-[0_4px_20px_rgba(18,61,126,0.4)] relative">
                <div className="absolute inset-0 rounded-full bg-white/10 blur-md" />
                <Icon size={32} weight="fill" className="text-white relative z-10" />
            </div>
            
            <h3 className="text-xl font-serif text-white mb-2 tracking-tight">
                {title}
            </h3>
            
            <p className="text-[14px] text-[rgba(255,255,255,0.6)] font-medium mb-8 max-w-[240px] leading-relaxed">
                {description}
            </p>
            
            {actionLabel && actionHref && (
                <Link 
                    href={actionHref}
                    className="
                        btn-primary w-full max-w-[200px] 
                        text-xs py-4 px-6 rounded-xl 
                        uppercase font-bold tracking-[0.1em] 
                        text-white shadow-lg
                        flex items-center justify-center gap-2
                        group
                    "
                >
                    {actionLabel}
                    <ArrowRight size={14} weight="bold" className="transition-transform group-hover:translate-x-1" />
                </Link>
            )}
        </motion.div>
    );
}
