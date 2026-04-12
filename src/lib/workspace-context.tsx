'use client';

import { createContext, useContext, ReactNode, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Doc, Id } from '@convex/_generated/dataModel';
import type { PinnableType } from '@/lib/integration/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorkspaceContextType {
    // Data
    pins: Doc<'casePins'>[] | undefined;
    memory: Doc<'caseMemory'>[] | undefined;
    timeline: Doc<'timelineCandidates'>[] | undefined;
    
    // Derived Counts
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

    // Derived values
    const counts = useMemo(() => {
        if (!pins || !memory || !timeline) {
            return { pins: 0, memory: 0, timeline: 0, keyFacts: 0, strategy: 0, risks: 0 };
        }

        return {
            pins: pins.length,
            memory: memory.length,
            timeline: timeline.length,
            keyFacts: memory.filter(m => m.type === 'key_fact').length,
            strategy: memory.filter(m => m.type === 'strategy_point').length,
            risks: memory.filter(m => m.type === 'risk_concern').length,
        };
    }, [pins, memory, timeline]);

    // Helpers
    const removePin = async (pinId: Id<'casePins'>) => {
        await removePinMutation({ pinId });
    };

    const removeMemory = async (itemId: Id<'caseMemory'>) => {
        await removeMemoryMutation({ itemId });
    };

    const confirmTimeline = async (candidateId: Id<'timelineCandidates'>) => {
        await confirmTimelineMutation({ candidateId });
    };

    const value = useMemo(() => ({
        pins,
        memory,
        timeline,
        counts,
        removePin,
        removeMemory,
        confirmTimeline,
    }), [pins, memory, timeline, counts, removePinMutation, removeMemoryMutation, confirmTimelineMutation]);

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
