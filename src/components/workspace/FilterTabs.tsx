'use client';

import { motion } from 'framer-motion';

interface FilterTab {
    id: string;
    label: string;
    count?: number;
}

interface FilterTabsProps {
    tabs: FilterTab[];
    activeTabId: string;
    onTabChange: (id: string) => void;
    activeColor?: string;
}

/**
 * Shared horizontal filter pill row.
 * Includes count badges and an animated active underline.
 */
export function FilterTabs({
    tabs,
    activeTabId,
    onTabChange,
    activeColor = 'var(--accent-icy)',
}: FilterTabsProps) {
    return (
        <div className="flex items-center gap-1 p-1 bg-white/5 rounded-2xl border border-white/10 w-fit overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
                const isActive = activeTabId === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange(tab.id)}
                        className={`
                            relative flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300
                            ${isActive ? 'text-white' : 'text-white/40 hover:text-white/60'}
                        `}
                    >
                        <span className="text-[11px] font-bold uppercase tracking-[0.1em] relative z-10">
                            {tab.label}
                        </span>
                        
                        {tab.count !== undefined && (
                            <span className={`
                                text-[9px] font-bold px-1.5 py-0.5 rounded-full relative z-10 transition-colors
                                ${isActive ? 'bg-white/20 text-white' : 'bg-white/5 text-white/40'}
                            `}>
                                {tab.count}
                            </span>
                        )}

                        {isActive && (
                            <motion.div
                                layoutId="active-filter-pill"
                                className="absolute inset-0 bg-white/10 border border-white/10 rounded-xl shadow-lg"
                                style={{ borderColor: `${activeColor}40` }}
                                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
