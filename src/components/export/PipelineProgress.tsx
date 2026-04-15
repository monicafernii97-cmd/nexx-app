'use client';

/**
 * Pipeline Progress — Visual step-by-step assembly progress view.
 *
 * Replaces the generic spinner with an 8-step pipeline trace:
 * Collecting → Classifying → Mapping → Review → Overrides → Drafting → Compliance → Rendering
 *
 * Shows current step, completed steps, and live progress detail.
 */

import { motion } from 'framer-motion';
import {
    Database,
    Brain,
    TreeStructure,
    UserCheck,
    Shuffle,
    PencilSimple,
    ShieldCheck,
    FilePdf,
    CheckCircle,
    CircleNotch,
    Circle,
} from '@phosphor-icons/react';
import type { PipelinePhase } from '@/lib/export-assembly/orchestrator';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PipelineProgressProps {
    /** Current pipeline phase */
    currentPhase: PipelinePhase;
    /** Overall progress 0-100 */
    progress: number;
    /** Detailed status message */
    detail: string;
}

// ---------------------------------------------------------------------------
// Steps Configuration
// ---------------------------------------------------------------------------

interface PipelineStep {
    phase: PipelinePhase;
    label: string;
    description: string;
    icon: typeof Database;
    color: string;
}

const PIPELINE_STEPS: PipelineStep[] = [
    { phase: 'collecting', label: 'Collecting Sources', description: 'Gathering workspace nodes and timeline events', icon: Database, color: '#60A5FA' },
    { phase: 'classifying', label: 'Classifying Content', description: 'Detecting facts, arguments, and evidence signals', icon: Brain, color: '#A78BFA' },
    { phase: 'mapping', label: 'Mapping Sections', description: 'Routing content to document sections', icon: TreeStructure, color: '#34D399' },
    { phase: 'ready_for_review', label: 'Ready for Review', description: 'Assembly complete — awaiting your review', icon: UserCheck, color: '#F59E0B' },
    { phase: 'applying_overrides', label: 'Applying Overrides', description: 'Merging your edits and locks', icon: Shuffle, color: '#60A5FA' },
    { phase: 'drafting', label: 'Drafting Document', description: 'AI generating prose from your approved mapping', icon: PencilSimple, color: '#A78BFA' },
    { phase: 'compliance', label: 'Checking Compliance', description: 'Validating against court formatting rules', icon: ShieldCheck, color: '#34D399' },
    { phase: 'rendering', label: 'Rendering PDF', description: 'Generating court-ready PDF', icon: FilePdf, color: '#F59E0B' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStepIndex(phase: PipelinePhase): number {
    const idx = PIPELINE_STEPS.findIndex(s => s.phase === phase);
    return idx >= 0 ? idx : -1;
}

function getStepStatus(step: PipelineStep, currentPhase: PipelinePhase): 'completed' | 'active' | 'pending' {
    const currentIdx = getStepIndex(currentPhase);
    const stepIdx = getStepIndex(step.phase);

    if (currentPhase === 'completed' || currentPhase === 'saving') return 'completed';
    if (stepIdx < currentIdx) return 'completed';
    if (stepIdx === currentIdx) return 'active';
    return 'pending';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PipelineProgress({ currentPhase, progress, detail }: PipelineProgressProps) {
    const isError = currentPhase === 'error';
    const isComplete = currentPhase === 'completed';

    return (
        <div className="w-full max-w-md mx-auto">
            {/* Overall Progress Bar */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-white/40">
                        {isComplete ? 'Complete' : isError ? 'Error' : 'Assembly Pipeline'}
                    </span>
                    <span className="text-[13px] font-bold text-white/70">{progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                        className={`h-full rounded-full ${isError ? 'bg-rose-500' : isComplete ? 'bg-emerald-500' : 'bg-[#60A5FA]'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                </div>
            </div>

            {/* Step List */}
            <div className="space-y-1">
                {PIPELINE_STEPS.map((step, i) => {
                    const status = getStepStatus(step, currentPhase);
                    const Icon = step.icon;

                    return (
                        <motion.div
                            key={step.phase}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                                status === 'active'
                                    ? 'bg-white/10 border border-white/20'
                                    : status === 'completed'
                                        ? 'bg-white/5 border border-transparent'
                                        : 'opacity-40 border border-transparent'
                            }`}
                        >
                            {/* Status Icon */}
                            <div className="shrink-0">
                                {status === 'completed' ? (
                                    <CheckCircle
                                        size={22}
                                        weight="fill"
                                        className="text-emerald-400"
                                    />
                                ) : status === 'active' ? (
                                    <CircleNotch
                                        size={22}
                                        weight="bold"
                                        className="animate-spin"
                                        style={{ color: step.color }}
                                    />
                                ) : (
                                    <Circle
                                        size={22}
                                        weight="regular"
                                        className="text-white/20"
                                    />
                                )}
                            </div>

                            {/* Step Icon */}
                            <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                    status === 'active'
                                        ? 'bg-white/15'
                                        : status === 'completed'
                                            ? 'bg-white/5'
                                            : 'bg-white/5'
                                }`}
                            >
                                <Icon
                                    size={16}
                                    weight="duotone"
                                    style={{ color: status === 'pending' ? 'rgba(255,255,255,0.3)' : step.color }}
                                />
                            </div>

                            {/* Label */}
                            <div className="flex-1 min-w-0">
                                <p className={`text-[13px] font-bold ${
                                    status === 'active' ? 'text-white' : status === 'completed' ? 'text-white/70' : 'text-white/40'
                                }`}>
                                    {step.label}
                                </p>
                                {status === 'active' && (
                                    <motion.p
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="text-[11px] text-white/50 truncate"
                                    >
                                        {detail || step.description}
                                    </motion.p>
                                )}
                            </div>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
