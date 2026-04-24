'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import SectionBox from './SectionBox';
import PracticalPreflightSidebar from './PracticalPreflightSidebar';
import { FileText, DownloadSimple, ShareNetwork, DotsThreeOutlineVertical, CaretLeft } from '@phosphor-icons/react';
import Link from 'next/link';
import type { CourtDocumentDraftState, DocumentType } from '@/lib/court-documents/types';
import { buildCourtDocumentDraftState } from '@/lib/court-documents/buildCourtDocumentDraftState';
import { validatePreflight } from '@/lib/court-documents/validatePreflight';
import {
  updateSectionContent,
  setAIDraftContent,
  rewriteSectionToCourtReady,
  lockSection,
  unlockSection,
  addFeedbackNote,
} from '@/lib/court-documents/sectionOperations';
import { computeWordDiff } from '@/lib/court-documents/sectionDiff';

// ═══════════════════════════════════════════════════════════════
// localStorage Persistence (fallback only)
// ═══════════════════════════════════════════════════════════════

const STORAGE_PREFIX = 'nexx:draft:';

function saveDraftToStorage(state: CourtDocumentDraftState): void {
  try {
    const key = `${STORAGE_PREFIX}${state.documentId}`;
    localStorage.setItem(key, JSON.stringify(state));
  } catch (err) {
    console.warn('[ReviewHub] localStorage save failed:', err);
  }
}

function loadDraftFromStorage(documentId: string): CourtDocumentDraftState | null {
  try {
    const key = `${STORAGE_PREFIX}${documentId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CourtDocumentDraftState;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

interface ReviewHubProps {
  docId: string;
  caseId?: string;
}

/**
 * CourtDocumentReviewHub: The state owner for the court document pipeline.
 *
 * Hydration: Convex sections → localStorage fallback → fresh state
 * Save: Section-level to Convex (debounced) + localStorage (immediate)
 * Export: Sends only documentId to server
 */
export default function CourtDocumentReviewHub({ docId, caseId: _caseId }: ReviewHubProps) {
  const [state, setState] = useState<CourtDocumentDraftState | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<{ downloadUrl: string; filename: string } | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const saveTimerMapRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // ── Convex queries ──
  const convexDraft = useQuery(api.courtDocumentDrafts.get, { documentId: docId });
  const convexSections = useQuery(api.courtDocumentSections.listByDocument, { documentId: docId });
  const convexRevisions = useQuery(api.courtDocumentRevisions.listByDocument, { documentId: docId });

  // ── Stable ref for current state (used in debounced callbacks) ──
  const stateRef = useRef<CourtDocumentDraftState | null>(null);
  useEffect(() => { stateRef.current = state; }, [state]);

  // ── Convex mutations ──
  const updateSectionConvex = useMutation(api.courtDocumentSections.updateContent);
  const updateSectionStatus = useMutation(api.courtDocumentSections.updateStatus);
  const createRevision = useMutation(api.courtDocumentRevisions.create);
  const bumpVersion = useMutation(api.courtDocumentDrafts.bumpVersion);
  const touchDraft = useMutation(api.courtDocumentDrafts.touch);

  // ── Hydration: Convex → localStorage → fresh state ──
  useEffect(() => {
    // Wait for Convex queries to resolve
    if (convexDraft === undefined || convexSections === undefined || convexRevisions === undefined) return;
    // Already hydrated
    if (state) return;

    // Try Convex first
    if (convexDraft && convexSections.length > 0) {
      // Group revisions by sectionId
      const revisionMap = new Map<string, typeof convexRevisions>();
      for (const rev of convexRevisions ?? []) {
        const existing = revisionMap.get(rev.sectionId) || [];
        existing.push(rev);
        revisionMap.set(rev.sectionId, existing);
      }

      const assembled: CourtDocumentDraftState = {
        documentId: convexDraft.documentId,
        documentType: convexDraft.documentType as DocumentType,
        sections: convexSections.map(s => ({
          id: s.sectionId,
          heading: s.heading,
          order: s.order,
          content: s.content,
          status: s.status as 'empty' | 'drafted' | 'court_ready' | 'locked',
          source: s.source as 'blank_template' | 'parsed_input' | 'user_edit' | 'ai_draft' | 'ai_rewrite',
          revisions: (revisionMap.get(s.sectionId) || [])
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((r, idx) => ({
              id: `rev_${s.sectionId}_${idx}`,
              timestamp: new Date(r.createdAt).toISOString(),
              before: r.before,
              after: r.after,
              diff: r.diffJson ? JSON.parse(r.diffJson) : [],
              source: r.source as 'user_edit' | 'ai_draft' | 'ai_rewrite',
              note: r.note,
            })),
          feedbackNotes: s.feedbackNotesJson ? JSON.parse(s.feedbackNotesJson) : [],
        })),
        jurisdiction: convexDraft.jurisdictionJson
          ? JSON.parse(convexDraft.jurisdictionJson)
          : { state: '', county: '', courtName: '', district: '' },
        metadata: {
          createdAt: new Date(convexDraft.createdAt).toISOString(),
          updatedAt: new Date(convexDraft.updatedAt).toISOString(),
          createdBy: 'system',
          isDirty: false,
          version: convexDraft.version,
          source: (convexDraft.source as 'parsed_input' | 'manual_start' | 'ai_generated') || 'manual_start',
        },
        persistence: {
          storage: 'convex',
          lastSavedAt: new Date(convexDraft.updatedAt).toISOString(),
          saveStatus: 'saved',
        },
      };
      setState(assembled);
      touchDraft({ documentId: docId });
      return;
    }

    // Try localStorage fallback
    const local = loadDraftFromStorage(docId);
    if (local) {
      setState(local);
      return;
    }

    // Fresh state (shouldn't happen if DraftingHub created it)
    setState(buildCourtDocumentDraftState({ documentType: 'motion' }));
  }, [convexDraft, convexSections, convexRevisions, state, docId, touchDraft]);

  // ── Auto-save to localStorage on every state change ──
  useEffect(() => {
    if (!state) return;
    saveDraftToStorage(state);
  }, [state]);

  // ── beforeunload guard ──
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (state?.metadata.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [state?.metadata.isDirty]);

  /** Debounced Convex save for a section (per-section timer). */
  const saveSection = useCallback(
    (sectionId: string, content: string, status: string, source: string, before?: string) => {
      const existing = saveTimerMapRef.current.get(sectionId);
      if (existing) clearTimeout(existing);

      const timer = setTimeout(async () => {
        try {
          await updateSectionConvex({
            documentId: docId,
            sectionId,
            content,
            status: status as 'empty' | 'drafted' | 'court_ready' | 'locked',
            source: source as 'blank_template' | 'parsed_input' | 'user_edit' | 'ai_draft' | 'ai_rewrite',
          });

          // Create revision if content changed
          if (before !== undefined && before !== content) {
            const diff = computeWordDiff(before, content);
            await createRevision({
              documentId: docId,
              sectionId,
              before,
              after: content,
              diffJson: JSON.stringify(diff),
              source: source as 'user_edit' | 'ai_draft' | 'ai_rewrite',
            });
          }

          // Bump draft version
          if (stateRef.current) {
            const preflight = validatePreflight(stateRef.current);
            await bumpVersion({
              documentId: docId,
              completionPct: preflight.completionPct,
            });
          }

          // Mark as synced
          setState(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              metadata: { ...prev.metadata, isDirty: false },
              persistence: {
                ...prev.persistence,
                storage: 'convex' as const,
                lastSavedAt: new Date().toISOString(),
                saveStatus: 'saved' as const,
              },
            };
          });
        } catch (err) {
          console.error('[ReviewHub] Convex save failed:', err);
        } finally {
          saveTimerMapRef.current.delete(sectionId);
        }
      }, 1000);
      saveTimerMapRef.current.set(sectionId, timer);
    },
    [docId, updateSectionConvex, createRevision, bumpVersion],
  );

  // ── Section Callbacks ──
  const handleContentChange = useCallback(
    (sectionId: string, content: string) => {
      setState(prev => {
        if (!prev) return prev;
        const oldSection = prev.sections.find(s => s.id === sectionId);
        const newState = updateSectionContent(prev, sectionId, content);
        // Trigger Convex save
        saveSection(sectionId, content, 'drafted', 'user_edit', oldSection?.content);
        return newState;
      });
    },
    [saveSection],
  );

  const handleAIGenerate = useCallback(
    async (sectionId: string) => {
      if (!state) return;
      const section = state.sections.find(s => s.id === sectionId);
      if (!section) return;

      try {
        const res = await fetch('/api/court-documents/section/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sectionId,
            heading: section.heading,
            documentType: state.documentType,
            documentContext: state.sections
              .filter(s => s.content.trim())
              .map(s => `${s.heading}: ${s.content}`)
              .join('\n\n'),
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.content) {
          throw new Error(data.error || 'Generation failed');
        }

        setState(prev => {
          if (!prev) return prev;
          const newState = setAIDraftContent(prev, sectionId, data.content);
          saveSection(sectionId, data.content, 'drafted', 'ai_draft', section.content);
          return newState;
        });

        return data.content;
      } catch (err) {
        throw err;
      }
    },
    [state, saveSection],
  );

  const handleAIRewrite = useCallback(
    async (sectionId: string, note?: string) => {
      if (!state) return;
      const section = state.sections.find(s => s.id === sectionId);
      if (!section) return;

      try {
        const res = await fetch('/api/court-documents/section/rewrite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            heading: section.heading,
            documentType: state.documentType,
            content: section.content,
            note: note,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.rewrittenContent) {
          throw new Error(data.error || 'Rewrite failed');
        }

        setState(prev => {
          if (!prev) return prev;
          const newState = rewriteSectionToCourtReady(prev, sectionId, data.rewrittenContent);
          saveSection(sectionId, data.rewrittenContent, 'court_ready', 'ai_rewrite', section.content);
          return newState;
        });

        return data.rewrittenContent;
      } catch (err) {
        throw err;
      }
    },
    [state, saveSection],
  );

  /** Lock a section — optimistic update, then sync to Convex. */
  const handleLock = useCallback(
    (sectionId: string) => {
      setState(prev => prev ? lockSection(prev, sectionId) : prev);
      updateSectionStatus({ documentId: docId, sectionId, status: 'locked' });
    },
    [docId, updateSectionStatus],
  );

  /** Unlock a section — optimistic update, then sync to Convex. */
  const handleUnlock = useCallback(
    (sectionId: string) => {
      let resolvedStatus: 'empty' | 'drafted' | 'court_ready' | 'locked' = 'court_ready';
      setState(prev => {
        if (!prev) return prev;
        const newState = unlockSection(prev, sectionId);
        const section = newState.sections.find(s => s.id === sectionId);
        if (section) resolvedStatus = section.status;
        return newState;
      });
      updateSectionStatus({ documentId: docId, sectionId, status: resolvedStatus });
    },
    [docId, updateSectionStatus],
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleAddNote = useCallback(
    (sectionId: string, note: string) => {
      setState(prev => prev ? addFeedbackNote(prev, sectionId, note) : prev);
    },
    [],
  );

  // ── Export (documentId only!) ──
  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setExportError(null);
    setExportResult(null);

    try {
      const res = await fetch('/api/court-documents/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Export failed');
      }

      setExportResult({ downloadUrl: data.downloadUrl, filename: data.filename });
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  }, [docId]);

  // ── Fix Now navigation ──
  const handleFixNow = useCallback((sectionId: string) => {
    const element = document.getElementById(`section-${sectionId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.classList.add('ring-2', 'ring-amber-400/50');
      setTimeout(() => element.classList.remove('ring-2', 'ring-amber-400/50'), 2000);
    }
  }, []);

  // ── Preflight ──
  const preflight = useMemo(() => (state ? validatePreflight(state) : null), [state]);

  // ── Loading state ──
  if (!state) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Loading Draft...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-10 pb-6 border-b border-white/5">
        <div className="flex items-center gap-4">
          <Link
            href="/docuvault"
            className="w-10 h-10 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all"
          >
            <CaretLeft size={18} weight="bold" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <FileText size={22} weight="duotone" className="text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight leading-none">
                {state.documentType.charAt(0).toUpperCase() + state.documentType.slice(1)} — Review Hub
              </h1>
              <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mt-0.5">
                {state.metadata.isDirty ? '● Unsaved Changes' : '✓ Saved'}
                {state.persistence.storage === 'convex' && ' · Synced'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {exportResult && (
            <a
              href={exportResult.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold hover:bg-emerald-500/20 transition-all"
            >
              <DownloadSimple size={16} weight="bold" />
              Download PDF
            </a>
          )}
          <button className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 text-white/40 hover:text-white transition-all">
            <ShareNetwork size={18} />
          </button>
          <button className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 text-white/40 hover:text-white transition-all">
            <DotsThreeOutlineVertical size={18} />
          </button>
        </div>
      </div>

      {/* Export Error */}
      {exportError && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          Export failed: {exportError}
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Sections */}
        <div className="lg:col-span-8 space-y-6">
          {state.sections.map(section => (
            <div key={section.id} id={`section-${section.id}`} className="transition-all duration-300">
              <SectionBox
                section={section}
                onContentChange={handleContentChange}
                onGenerate={handleAIGenerate}
                onRewrite={handleAIRewrite}
                onLock={handleLock}
                onUnlock={handleUnlock}
              />
            </div>
          ))}
        </div>

        {/* Right: Preflight Sidebar */}
        <div className="lg:col-span-4 sticky top-8">
          {preflight && (
            <PracticalPreflightSidebar
              preflight={preflight}
              isExporting={isExporting}
              onExportPDF={handleExport}
              onFixNow={handleFixNow}
            />
          )}
        </div>
      </div>
    </div>
  );
}
