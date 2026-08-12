'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useExport } from '@/app/(app)/docuvault/context/ExportContext';
import { checkpointFingerprint } from '@/lib/export-autosave';

const SAVE_DEBOUNCE_MS = 5_000;
const MAX_CHECKPOINT_INTERVAL_MS = 60_000;

/** Change-aware, transactional crash-recovery checkpoint for export review. */
export function useAutoSaveExport(caseId: Id<'cases'> | undefined, enabled = true) {
    const { state, isDirty, markSaved } = useExport();
    const saveCheckpoint = useMutation(api.exportOverrides.saveReviewCheckpoint);
    const isSavingRef = useRef(false);
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const lastSavedHashRef = useRef<string | null>(null);

    const assemblyResultJson = useMemo(
        () => (state.assemblyResult ? JSON.stringify(state.assemblyResult) : undefined),
        [state.assemblyResult],
    );

    const checkpoint = useMemo(() => {
        if (!caseId || state.phase !== 'reviewing') return null;
        const payload = {
            exportPath: state.exportPath ?? 'court_document',
            sectionOverrides: state.overrides.sectionOverrides.map((section) => ({
                sectionId: section.sectionId,
                isLocked: section.isLocked,
                itemOrder: section.itemOrder,
            })),
            itemOverrides: state.overrides.itemOverrides.map((item) => ({
                nodeId: item.nodeId,
                editedText: item.editedText,
                forcedSection: item.forcedSection,
                excluded: item.excluded,
            })),
            exportRequestJson: state.exportRequest ? JSON.stringify(state.exportRequest) : '{}',
            assemblyResultJson,
            clearAssemblyResult: assemblyResultJson === undefined,
            reviewItemsJson: JSON.stringify(state.reviewItems),
        };
        return { payload, hash: checkpointFingerprint(payload) };
    }, [caseId, state.phase, state.exportPath, state.overrides, state.exportRequest, assemblyResultJson, state.reviewItems]);
    const latestHashRef = useRef(checkpoint?.hash);
    useEffect(() => {
        latestHashRef.current = checkpoint?.hash;
    }, [checkpoint?.hash]);

    const doSave = useCallback(async () => {
        if (!enabled || !caseId || !checkpoint || !isDirty || isSavingRef.current) return;
        if (lastSavedHashRef.current === checkpoint.hash) {
            setSaveError(null);
            markSaved();
            return;
        }

        isSavingRef.current = true;
        setIsSaving(true);
        setSaveError(null);
        try {
            await saveCheckpoint({
                caseId,
                phase: 'reviewing',
                ...checkpoint.payload,
                checkpointHash: checkpoint.hash,
            });
            lastSavedHashRef.current = checkpoint.hash;
            if (latestHashRef.current === checkpoint.hash) markSaved();
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : String(error));
            console.error(JSON.stringify({
                level: 'error',
                message: 'export_checkpoint_failed',
                error: error instanceof Error ? error.message : String(error),
            }));
        } finally {
            isSavingRef.current = false;
            setIsSaving(false);
        }
    }, [caseId, checkpoint, enabled, isDirty, markSaved, saveCheckpoint]);

    const doSaveRef = useRef(doSave);
    useEffect(() => {
        doSaveRef.current = doSave;
    }, [doSave]);

    useEffect(() => {
        if (!enabled || !isDirty || !checkpoint) return;
        const timeout = window.setTimeout(() => { void doSave(); }, SAVE_DEBOUNCE_MS);
        return () => window.clearTimeout(timeout);
    }, [checkpoint, doSave, enabled, isDirty]);

    useEffect(() => {
        if (!enabled) return;
        const interval = window.setInterval(() => { void doSaveRef.current(); }, MAX_CHECKPOINT_INTERVAL_MS);
        return () => window.clearInterval(interval);
    }, [enabled]);

    useEffect(() => {
        const flush = () => { void doSaveRef.current(); };
        window.addEventListener('pagehide', flush);
        return () => {
            window.removeEventListener('pagehide', flush);
            void doSaveRef.current();
        };
    }, []);

    return { doSave, isSaving, saveError };
}
