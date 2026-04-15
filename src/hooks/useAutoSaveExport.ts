'use client';

/**
 * useAutoSaveExport — Auto-saves export review state to Convex every 30 seconds.
 *
 * Saves when:
 * 1. The state is dirty (overrides or review items changed)
 * 2. The phase is 'reviewing' (only during active review)
 * 3. At least 30 seconds have passed since the last save
 *
 * Also saves immediately on unmount (e.g., browser close, navigation)
 * for crash recovery.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useExport } from '@/app/(app)/docuvault/context/ExportContext';

const AUTO_SAVE_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Hook that auto-saves export review state to Convex.
 *
 * @param caseId  — ID of the current case (required for scoping)
 * @param enabled — whether auto-save is active (default: true)
 */
export function useAutoSaveExport(
    caseId: Id<'cases'> | undefined,
    enabled = true,
) {
    const { state, isDirty, markSaved } = useExport();

    // Use generated API — these will resolve once `npx convex dev` regenerates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saveSessionMutation = useMutation((api as any).exportOverrides.saveSession);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saveOverridesMutation = useMutation((api as any).exportOverrides.saveOverrides);

    // Ref to track if a save is in progress
    const isSaving = useRef(false);

    const doSave = useCallback(async () => {
        if (!caseId || !isDirty || isSaving.current) return;
        if (state.phase !== 'reviewing') return;

        isSaving.current = true;
        try {
            // Save overrides
            await saveOverridesMutation({
                caseId,
                exportPath: state.exportPath ?? 'court_document',
                sectionOverrides: state.overrides.sectionOverrides.map(s => ({
                    sectionId: s.sectionId,
                    isLocked: s.isLocked,
                    itemOrder: s.itemOrder,
                })),
                itemOverrides: state.overrides.itemOverrides.map(i => ({
                    nodeId: i.nodeId,
                    editedText: i.editedText,
                    forcedSection: i.forcedSection,
                    excluded: i.excluded,
                })),
            });

            // Save session state
            await saveSessionMutation({
                caseId,
                phase: state.phase,
                exportRequestJson: state.exportRequest ? JSON.stringify(state.exportRequest) : '{}',
                assemblyResultJson: state.assemblyResult ? JSON.stringify(state.assemblyResult) : undefined,
            });

            markSaved();
        } catch (error) {
            console.error('[AutoSave] Failed to save export state:', error);
        } finally {
            isSaving.current = false;
        }
    }, [
        caseId, isDirty, state.phase, state.exportPath,
        state.overrides, state.exportRequest, state.assemblyResult,
        saveOverridesMutation, saveSessionMutation, markSaved,
    ]);

    // ── Periodic auto-save ──
    useEffect(() => {
        if (!enabled || !caseId || state.phase !== 'reviewing') return;

        const interval = setInterval(() => {
            if (isDirty) {
                doSave();
            }
        }, AUTO_SAVE_INTERVAL_MS);

        return () => clearInterval(interval);
    }, [enabled, caseId, state.phase, isDirty, doSave]);

    // ── Save on unmount / page close ──
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (isDirty && caseId && state.phase === 'reviewing') {
                // Fire-and-forget — can't await in beforeunload
                doSave();
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            // Save on component unmount
            if (isDirty && caseId && state.phase === 'reviewing') {
                doSave();
            }
        };
    }, [isDirty, caseId, state.phase, doSave]);

    return { doSave, isSaving: isSaving.current };
}
