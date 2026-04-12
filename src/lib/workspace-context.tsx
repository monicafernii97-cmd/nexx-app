'use client';

import { createContext, useContext, useCallback, useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceContextType {
    // Active Case
    activeCase: Doc<'cases'> | null | undefined;
    activeCaseId: Id<'cases'> | null;
    cases: Doc<'cases'>[] | undefined;
    setActiveCaseId: (id: Id<'cases'>) => void;

    // Data (scoped to active case)
    pins: Doc<'casePins'>[] | undefined;
    memory: Doc<'caseMemory'>[] | undefined;
    timeline: Doc<'timelineCandidates'>[] | undefined;
    
    // Derived Counts (tolerant of partial loads — CR #12)
    counts: {
        pins: number;
        memory: number;
        timeline: number;
        confirmedTimeline: number;
        keyFacts: number;
        strategy: number;
        risks: number;
        strengths: number;
    };

    // Actions
    removePin: (pinId: Id<'casePins'>) => Promise<void>;
    removeMemory: (itemId: Id<'caseMemory'>) => Promise<void>;
    confirmTimeline: (candidateId: Id<'timelineCandidates'>) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WorkspaceProvider({ children }: { children: ReactNode }) {
    const [activeCaseId, setActiveCaseId] = useState<Id<'cases'> | null>(null);

    // Ensure a default case exists for the user
    const getOrCreateDefault = useMutation(api.cases.getOrCreateDefault);
    const cases = useQuery(api.cases.list);

    // On first load, auto-provision a default case
    useEffect(() => {
        if (cases !== undefined && cases.length === 0) {
            // No cases yet — create the default "My Case"
            getOrCreateDefault().catch(console.error);
        } else if (cases !== undefined && cases.length > 0 && !activeCaseId) {
            // Cases exist but none selected — pick the first active one
            const active = cases.find(c => c.status === 'active') ?? cases[0];
            setActiveCaseId(active._id);
        }
    }, [cases, activeCaseId, getOrCreateDefault]);

    const activeCase = cases?.find(c => c._id === activeCaseId) ?? null;

    // Queries — still user-scoped (caseId filtering done client-side for backward compat)
    const allPins = useQuery(api.casePins.listByUser);
    const allMemory = useQuery(api.caseMemory.listByUser);
    const allTimeline = useQuery(api.timelineCandidates.listByUser);

    // Filter to active case (gracefully handle items without caseId — pre-migration data)
    const pins = allPins?.filter(p => !p.caseId || p.caseId === activeCaseId);
    const memory = allMemory?.filter(m => !m.caseId || m.caseId === activeCaseId);
    const timeline = allTimeline?.filter(t => !t.caseId || t.caseId === activeCaseId);

    // Mutations
    const removePinMutation = useMutation(api.casePins.remove);
    const removeMemoryMutation = useMutation(api.caseMemory.remove);
    const confirmTimelineMutation = useMutation(api.timelineCandidates.confirm);

    // Derived values — tolerant of partial loads (CR #12)
    // Each count is computed independently so a slow sibling query
    // doesn't reset already-resolved counters to 0.
    const counts = {
        pins: pins?.length ?? 0,
        memory: memory?.length ?? 0,
        timeline: timeline?.length ?? 0,
        confirmedTimeline: timeline?.filter(t => t.status === 'confirmed').length ?? 0,
        keyFacts: memory?.filter(m => m.type === 'key_fact').length ?? 0,
        strategy: memory?.filter(m => m.type === 'strategy_point').length ?? 0,
        risks: memory?.filter(m => m.type === 'risk_concern').length ?? 0,
        strengths: memory?.filter(m => m.type === 'strength_highlight').length ?? 0,
    };

    // Stable action callbacks (useCallback → fixes React Compiler memo error)
    const removePin = useCallback(
        async (pinId: Id<'casePins'>) => { await removePinMutation({ pinId }); },
        [removePinMutation],
    );

    const removeMemory = useCallback(
        async (itemId: Id<'caseMemory'>) => { await removeMemoryMutation({ itemId }); },
        [removeMemoryMutation],
    );

    const confirmTimeline = useCallback(
        async (candidateId: Id<'timelineCandidates'>) => { await confirmTimelineMutation({ candidateId }); },
        [confirmTimelineMutation],
    );

    const value: WorkspaceContextType = {
        activeCase,
        activeCaseId,
        cases,
        setActiveCaseId,
        pins,
        memory,
        timeline,
        counts,
        removePin,
        removeMemory,
        confirmTimeline,
    };

    return (
        <WorkspaceContext.Provider value={value}>
            {children}
        </WorkspaceContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkspace() {
    const context = useContext(WorkspaceContext);
    if (context === undefined) {
        throw new Error('useWorkspace must be used within a WorkspaceProvider');
    }
    return context;
}
