'use client';

import { createContext, useContext, useCallback, useState, useEffect, useRef, type ReactNode } from 'react';
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
    const [activeCaseId, setActiveCaseIdLocal] = useState<Id<'cases'> | null>(null);
    const provisioningRef = useRef(false);
    const [provisionRetry, setProvisionRetry] = useState(0);
    const pendingSetActiveRef = useRef<Promise<void>>(Promise.resolve());

    // Ensure a default case exists for the user
    const getOrCreateDefault = useMutation(api.cases.getOrCreateDefault);
    const setActiveMutation = useMutation(api.cases.setActive);
    const cases = useQuery(api.cases.list);

    // On first load, auto-provision a default case.
    // On transient failure, increment provisionRetry to re-trigger (max 3 attempts).
    useEffect(() => {
        let retryTimeout: ReturnType<typeof setTimeout> | null = null;
        let cancelled = false;
        if (cases !== undefined && cases.length === 0 && !provisioningRef.current && provisionRetry < 3) {
            provisioningRef.current = true;
            getOrCreateDefault()
                .catch(() => {
                    if (cancelled) return;
                    // Schedule a retry after a short delay
                    retryTimeout = setTimeout(() => {
                        if (!cancelled) setProvisionRetry(r => r + 1);
                    }, 1500);
                })
                .finally(() => { provisioningRef.current = false; });
        }
        return () => {
            cancelled = true;
            if (retryTimeout) clearTimeout(retryTimeout);
        };
    }, [cases, getOrCreateDefault, provisionRetry]);

    // Derive active case at render time (avoids react-hooks/set-state-in-effect)
    const resolvedActiveCaseId =
        activeCaseId ??
        cases?.find(c => c.status === 'active')?._id ??
        cases?.[0]?._id ??
        null;

    const activeCase = cases?.find(c => c._id === resolvedActiveCaseId) ?? null;

    // The default (original) case gets legacy (no caseId) records.
    // cases.list returns newest-first, so we need the oldest case — not [0].
    const defaultCaseId =
        cases && cases.length > 0
            ? cases.reduce((oldest, c) => (c.createdAt < oldest.createdAt ? c : oldest))._id
            : null;
    const isDefaultCase =
        defaultCaseId !== null && resolvedActiveCaseId === defaultCaseId;

    // Queries — still user-scoped (caseId filtering done client-side for backward compat)
    const allPins = useQuery(api.casePins.listByUser);
    const allMemory = useQuery(api.caseMemory.listByUser);
    const allTimeline = useQuery(api.timelineCandidates.listByUser);

    // Filter to active case — legacy items (no caseId) only appear in the default case.
    // Return undefined until cases is loaded (or empty) so consumers see loading state.
    const pins =
        cases === undefined || cases.length === 0
            ? undefined
            : allPins?.filter(p => (p.caseId ? p.caseId === resolvedActiveCaseId : isDefaultCase));
    const memory =
        cases === undefined || cases.length === 0
            ? undefined
            : allMemory?.filter(m => (m.caseId ? m.caseId === resolvedActiveCaseId : isDefaultCase));
    const timeline =
        cases === undefined || cases.length === 0
            ? undefined
            : allTimeline?.filter(t => (t.caseId ? t.caseId === resolvedActiveCaseId : isDefaultCase));

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

    // Persist case switch to DB so it survives page reloads (CR #49)
    const setActiveCaseId = useCallback(
        (id: Id<'cases'>) => {
            const previousId = resolvedActiveCaseId;
            setActiveCaseIdLocal(id);
            // Serialize writes so rapid switches can't persist a stale selection
            pendingSetActiveRef.current = pendingSetActiveRef.current
                .then(async () => { await setActiveMutation({ caseId: id }); })
                .catch((err) => {
                    console.error(err);
                    setActiveCaseIdLocal(current => (current === id ? previousId : current));
                });
        },
        [resolvedActiveCaseId, setActiveMutation],
    );

    const value: WorkspaceContextType = {
        activeCase,
        activeCaseId: resolvedActiveCaseId,
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
