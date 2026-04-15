'use client';

/**
 * Preflight Panel — Filing readiness checks and compliance score.
 *
 * Shows a categorized list of pass/warning/error checks with severity
 * indicators and overall readiness score.
 */

import { motion } from 'framer-motion';
import {
    X,
    CheckCircle,
    WarningCircle,
    XCircle,
    ShieldCheck,
} from '@phosphor-icons/react';
import type { PreflightResult, PreflightCheck } from '@/lib/export-assembly/validation/preflightValidator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PreflightPanelProps {
    result: PreflightResult;
    onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PreflightPanel({ result, onClose }: PreflightPanelProps) {
    const { checks, canProceed, errorCount, warningCount, readinessScore } = result;

    // Group by category
    const byCategory = new Map<string, PreflightCheck[]>();
    for (const check of checks) {
        const list = byCategory.get(check.category) ?? [];
        list.push(check);
        byCategory.set(check.category, list);
    }

    // Overall score from result
    const score = readinessScore;
    const passCount = checks.filter(c => c.severity === 'pass').length;

    return (
        <div className="flex flex-col h-full bg-[rgba(10,17,40,0.95)] backdrop-blur-xl">
            {/* Header */}
            <div className="shrink-0 px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ShieldCheck size={16} weight="fill" className="text-[#60A5FA]" />
                    <h2 className="text-[14px] font-bold text-white tracking-tight">
                        Preflight Check
                    </h2>
                </div>
                <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors text-white/40 hover:text-white"
                >
                    <X size={14} weight="bold" />
                </button>
            </div>

            {/* Score Ring */}
            <div className="shrink-0 px-5 py-5 border-b border-white/10">
                <div className="flex items-center gap-5">
                    <div className="relative w-[72px] h-[72px]">
                        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                            <circle
                                cx="18" cy="18" r="15.5"
                                fill="none"
                                stroke="rgba(255,255,255,0.06)"
                                strokeWidth="3"
                            />
                            <circle
                                cx="18" cy="18" r="15.5"
                                fill="none"
                                stroke={canProceed ? '#34D399' : errorCount > 0 ? '#F87171' : '#F59E0B'}
                                strokeWidth="3"
                                strokeDasharray={`${score} ${100 - score}`}
                                strokeLinecap="round"
                                className="transition-all duration-700"
                            />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[16px] font-bold text-white">
                            {score}
                        </span>
                    </div>
                    <div>
                        <p className={`text-[14px] font-bold ${
                            canProceed ? 'text-emerald-400' : errorCount > 0 ? 'text-rose-400' : 'text-amber-400'
                        }`}>
                            {canProceed ? 'Ready to Export' : errorCount > 0 ? 'Blockers Found' : 'Warnings Present'}
                        </p>
                        <p className="text-[11px] text-white/40 mt-0.5">
                            {passCount} pass · {warningCount} warnings · {errorCount} errors
                        </p>
                    </div>
                </div>
            </div>

            {/* Checks List */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5" style={{ scrollbarWidth: 'thin' }}>
                {Array.from(byCategory.entries()).map(([category, categoryChecks]) => (
                    <section key={category}>
                        <h3 className="text-[10px] font-bold tracking-[0.15em] uppercase text-white/30 mb-2">
                            {formatCategory(category)}
                        </h3>
                        <div className="space-y-1.5">
                            {categoryChecks.map(check => (
                                <motion.div
                                    key={check.id}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`flex items-start gap-2.5 p-3 rounded-xl border ${
                                        check.severity === 'error'
                                            ? 'bg-rose-500/5 border-rose-500/15'
                                            : check.severity === 'warning'
                                                ? 'bg-amber-500/5 border-amber-500/15'
                                                : 'bg-white/[0.02] border-white/5'
                                    }`}
                                >
                                    <div className="shrink-0 mt-0.5">
                                        {check.severity === 'error' ? (
                                            <XCircle size={16} weight="fill" className="text-rose-400" />
                                        ) : check.severity === 'warning' ? (
                                            <WarningCircle size={16} weight="fill" className="text-amber-400" />
                                        ) : (
                                            <CheckCircle size={16} weight="fill" className="text-emerald-400" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[12px] font-bold ${
                                            check.severity === 'error' ? 'text-rose-300' :
                                            check.severity === 'warning' ? 'text-amber-300' : 'text-white/60'
                                        }`}>
                                            {check.label}
                                        </p>
                                        {check.detail && (
                                            <p className="text-[11px] text-white/40 mt-0.5 leading-relaxed">
                                                {check.detail}
                                            </p>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCategory(category: string): string {
    return category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
