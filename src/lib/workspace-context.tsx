'use client';

import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceContextType {
    // Data
    pins: Doc<'casePins'>[] | undefined;
    memory: Doc<'caseMemory'>[] | undefined;
    timeline: Doc<'timelineCandidates'>[] | undefined;
    
    // Derived Counts (tolerant of partial loads — CR #12)
    counts: {
        pins: number;
        memory: number;
        timeline: number;
        keyFacts: number;
        strategy: number;
        risks: number;
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
    // Queries
    const pins = useQuery(api.casePins.listByUser);
    const memory = useQuery(api.caseMemory.listByUser);
    const timeline = useQuery(api.timelineCandidates.listByUser);

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
        keyFacts: memory?.filter(m => m.type === 'key_fact').length ?? 0,
        strategy: memory?.filter(m => m.type === 'strategy_point').length ?? 0,
        risks: memory?.filter(m => m.type === 'risk_concern').length ?? 0,
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
