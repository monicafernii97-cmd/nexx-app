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
    const lastSavedHashRef = useRef<string | null>(null);

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
            assemblyResultJson: state.assemblyResult ? JSON.stringify(state.assemblyResult) : undefined,
            reviewItemsJson: JSON.stringify(state.reviewItems),
        };
        return { payload, hash: checkpointFingerprint(payload) };
    }, [caseId, state.phase, state.exportPath, state.overrides, state.exportRequest, state.assemblyResult, state.reviewItems]);
    const latestHashRef = useRef(checkpoint?.hash);
    useEffect(() => {
        latestHashRef.current = checkpoint?.hash;
    }, [checkpoint?.hash]);

    const doSave = useCallback(async () => {
        if (!enabled || !caseId || !checkpoint || !isDirty || isSavingRef.current) return;
        if (lastSavedHashRef.current === checkpoint.hash) {
            markSaved();
            return;
        }

        isSavingRef.current = true;
        setIsSaving(true);
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

    useEffect(() => {
        if (!enabled || !isDirty || !checkpoint) return;
        const timeout = window.setTimeout(() => { void doSave(); }, SAVE_DEBOUNCE_MS);
        return () => window.clearTimeout(timeout);
    }, [checkpoint, doSave, enabled, isDirty]);

    useEffect(() => {
        if (!enabled || !checkpoint) return;
        const interval = window.setInterval(() => { void doSave(); }, MAX_CHECKPOINT_INTERVAL_MS);
        return () => window.clearInterval(interval);
    }, [checkpoint, doSave, enabled]);

    useEffect(() => {
        const flush = () => { void doSave(); };
        window.addEventListener('pagehide', flush);
        return () => {
            window.removeEventListener('pagehide', flush);
            void doSave();
        };
    }, [doSave]);

    return { doSave, isSaving };
}
