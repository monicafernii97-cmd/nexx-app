'use client';

/**
 * WorkspaceClient — Central action dispatcher for the chat workspace.
 *
 * Connects ContextualActionBar action buttons to real Convex mutations,
 * manages modal state (Save / Pin), and shows toast feedback with
 * destination links via the ToastProvider.
 *
 * Usage: Wrap the chat page content with <WorkspaceClient> to provide
 * the `onAction` handler to AssistantMessageCard → ContextualActionBar.
 */

import { useState, useCallback, type ReactNode } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { ActionType, PanelData } from '@/lib/ui-intelligence/types';
import type { PinnableType } from '@/lib/integration/types';
import { ACTION_DESTINATIONS } from '@/lib/integration/types';
import { useToast } from '@/components/feedback/ToastProvider';
import { useWorkspace } from '@/lib/workspace-context';
import { SaveToCaseModal } from '@/components/chat/SaveToCaseModal';
import { PinToWorkspaceModal } from '@/components/chat/PinToWorkspaceModal';

// ---------------------------------------------------------------------------
// Save-type mapping (action → caseMemory save type)
// ---------------------------------------------------------------------------

/** Maps action types to the caseMemory save classification. */
const ACTION_TO_SAVE_TYPE: Partial<Record<ActionType, string>> = {
    save_note: 'case_note',
    save_to_case: 'case_note',
    save_strategy: 'strategy_point',
    save_good_faith: 'good_faith_point',
    save_draft: 'draft_snippet',
    create_draft: 'draft_snippet',
    convert_to_incident: 'incident_note',
    convert_to_exhibit: 'exhibit_note',
    insert_into_template: 'draft_snippet',
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WorkspaceClientProps {
    children: (ctx: WorkspaceContext) => ReactNode;
}

/** Context provided to children for action dispatch. */
export interface WorkspaceContext {
    /** Handle an action from the ContextualActionBar. */
    onAction: (action: ActionType, panel?: PanelData) => void;
    /** Currently pinned items (undefined while loading). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pinnedItems: any[] | undefined;
}

/** Workspace client orchestrator — renders children with action context. */
export function WorkspaceClient({ children }: WorkspaceClientProps) {
    const { showToast } = useToast();
    const { activeCaseId } = useWorkspace();

    // ── Convex mutations ──
    const saveToCaseMemory = useMutation(api.caseMemory.save);
    const createPin = useMutation(api.casePins.create);
    const createTimelineCandidate = useMutation(api.timelineCandidates.create);

    // ── Convex queries ──
    const pinnedItems = useQuery(api.casePins.listByUser);

    // ── Modal state ──
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [pinModalOpen, setPinModalOpen] = useState(false);
    const [modalSeedContent, setModalSeedContent] = useState('');
    const [modalSeedTitle, setModalSeedTitle] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isPinning, setIsPinning] = useState(false);

    // ── Copy to clipboard ──
    const handleCopy = useCallback(
        async (content: string) => {
            try {
                await navigator.clipboard.writeText(content);
                showToast({
                    variant: 'success',
                    title: 'Copied to clipboard',
                });
            } catch {
                showToast({
                    variant: 'error',
                    title: 'Copy failed',
                    description: 'Could not access clipboard.',
                });
            }
        },
        [showToast]
    );

    // ── Save to case memory ──
    const handleSaveToCase = useCallback(
        async (type: string, title: string) => {
            setIsSaving(true);
            try {
                const requestId = `save-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                await saveToCaseMemory({
                    type: type as Parameters<typeof saveToCaseMemory>[0]['type'],
                    title,
                    content: modalSeedContent,
                    caseId: activeCaseId ?? undefined,
                    requestId,
                });

                const dest = ACTION_DESTINATIONS.save_to_case;
                showToast({
                    variant: 'success',
                    title: `Saved as ${title}`,
                    description: 'Added to your case memory.',
                    destination: dest
                        ? { label: `View in ${dest.label}`, href: dest.basePath }
                        : undefined,
                });
                setSaveModalOpen(false);
            } catch (err) {
                showToast({
                    variant: 'error',
                    title: 'Save failed',
                    description: err instanceof Error ? err.message : 'Unknown error',
                });
            } finally {
                setIsSaving(false);
            }
        },
        [saveToCaseMemory, showToast, modalSeedContent, activeCaseId]
    );

    // ── Pin to workspace ──
    const handlePin = useCallback(
        async (type: PinnableType, title: string, content: string) => {
            setIsPinning(true);
            try {
                const requestId = `pin-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                await createPin({
                    type,
                    title,
                    content,
                    caseId: activeCaseId ?? undefined,
                    requestId,
                });

                showToast({
                    variant: 'success',
                    title: 'Pinned to Workspace',
                    description: `"${title}" is now in your rail.`,
                });
                setPinModalOpen(false);
            } catch (err) {
                showToast({
                    variant: 'error',
                    title: 'Pin failed',
                    description: err instanceof Error ? err.message : 'Unknown error',
                });
            } finally {
                setIsPinning(false);
            }
        },
        [createPin, showToast, activeCaseId]
    );

    // ── Add to timeline ──
    const handleAddToTimeline = useCallback(
        async (title: string, description: string) => {
            try {
                const requestId = `tl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                await createTimelineCandidate({
                    title,
                    description,
                    caseId: activeCaseId ?? undefined,
                    requestId,
                });

                const dest = ACTION_DESTINATIONS.add_to_timeline;
                showToast({
                    variant: 'success',
                    title: 'Timeline Candidate Created',
                    description: 'Review and confirm in your timeline.',
                    destination: dest
                        ? { label: `View in ${dest.label}`, href: dest.basePath }
                        : undefined,
                });
            } catch (err) {
                showToast({
                    variant: 'error',
                    title: 'Timeline creation failed',
                    description: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        },
        [createTimelineCandidate, showToast, activeCaseId]
    );

    // ── Quick save (no modal — direct mutation for simple actions) ──
    const handleQuickSave = useCallback(
        async (action: ActionType, title: string, content: string) => {
            const saveType = ACTION_TO_SAVE_TYPE[action];
            if (!saveType) return;

            try {
                const requestId = `qs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                await saveToCaseMemory({
                    type: saveType as Parameters<typeof saveToCaseMemory>[0]['type'],
                    title,
                    content,
                    caseId: activeCaseId ?? undefined,
                    requestId,
                });

                const dest = ACTION_DESTINATIONS[action];
                showToast({
                    variant: 'success',
                    title: `Saved: ${title}`,
                    destination: dest
                        ? { label: `View in ${dest.label}`, href: dest.basePath }
                        : undefined,
                });
            } catch (err) {
                showToast({
                    variant: 'error',
                    title: 'Save failed',
                    description: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        },
        [saveToCaseMemory, showToast, activeCaseId]
    );

    // ── Central action dispatcher ──
    const onAction = useCallback(
        (action: ActionType, panel?: PanelData) => {
            const content = panel
                ? Array.isArray(panel.content)
                    ? panel.content.join('\n')
                    : panel.content
                : '';
            const title = panel?.title ?? 'Untitled';

            switch (action) {
                case 'copy':
                    handleCopy(content);
                    break;

                case 'save_to_case':
                case 'save_note':
                    setModalSeedTitle(title);
                    setModalSeedContent(content);
                    setSaveModalOpen(true);
                    break;

                case 'pin':
                    setModalSeedTitle(title);
                    setModalSeedContent(content);
                    setPinModalOpen(true);
                    break;

                case 'add_to_timeline':
                    handleAddToTimeline(title, content);
                    break;

                // Quick-save actions — go straight to caseMemory
                case 'save_strategy':
                case 'save_good_faith':
                case 'save_draft':
                case 'create_draft':
                case 'convert_to_incident':
                case 'convert_to_exhibit':
                case 'insert_into_template':
                    handleQuickSave(action, title, content);
                    break;

                default:
                    showToast({
                        variant: 'info',
                        title: 'Action not yet wired',
                        description: `"${action}" will be available soon.`,
                    });
            }
        },
        [handleCopy, handleAddToTimeline, handleQuickSave, showToast]
    );

    // ── Build context ──
    const ctx: WorkspaceContext = {
        onAction,
        pinnedItems,
    };

    return (
        <>
            {children(ctx)}

            {/* Save to Case Modal */}
            <SaveToCaseModal
                isOpen={saveModalOpen}
                onClose={() => setSaveModalOpen(false)}
                onSave={handleSaveToCase}
                content={modalSeedContent}
                isSaving={isSaving}
            />

            {/* Pin to Workspace Modal */}
            <PinToWorkspaceModal
                isOpen={pinModalOpen}
                onClose={() => setPinModalOpen(false)}
                onPin={handlePin}
                initialContent={modalSeedContent}
                initialTitle={modalSeedTitle}
                isPinning={isPinning}
            />
        </>
    );
}
