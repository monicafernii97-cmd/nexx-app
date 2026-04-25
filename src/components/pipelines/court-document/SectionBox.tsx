'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Lock, 
  LockOpen, 
  Lightning, 
  PencilSimple, 
  CheckCircle,
  ClockCounterClockwise,
  ArrowCounterClockwise,
  CircleNotch
} from '@phosphor-icons/react';
import DiffViewer from './DiffViewer';
import type { CourtDocumentSection } from '@/lib/court-documents/types';

interface SectionBoxProps {
  section: CourtDocumentSection;
  onContentChange: (sectionId: string, newContent: string) => void;
  onGenerate: (sectionId: string) => Promise<void>;
  onRewrite: (sectionId: string, note: string) => Promise<void>;
  onLock: (sectionId: string) => void;
  onUnlock: (sectionId: string) => void;
}

/**
 * SectionBox: The individual drafting block in the Review Hub.
 *
 * NO internal state for content. All state comes from props.
 * Only local UI state (isEditing, note input, loading indicators).
 */
export default function SectionBox({
  section,
  onContentChange,
  onGenerate,
  onRewrite,
  onLock,
  onUnlock,
}: SectionBoxProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [note, setNote] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const { id, heading, content, status, revisions } = section;
  const isRequired = true; // All sections from deriveRequiredSections are contextually required
  const latestRevision = revisions.length > 0 ? revisions[revisions.length - 1] : null;
  const showDiff = status === 'court_ready' && latestRevision?.source === 'ai_rewrite' && latestRevision.diff.length > 0;

  const handleEdit = useCallback(() => {
    setIsEditing(!isEditing);
    setAiError(null);
  }, [isEditing]);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setAiError(null);
    try {
      await onGenerate(id);
    } catch {
      setAiError('Failed to generate content. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  }, [id, onGenerate]);

  const handleRewrite = useCallback(async () => {
    setIsRewriting(true);
    setAiError(null);
    try {
      await onRewrite(id, note);
      setNote('');
    } catch {
      setAiError('Failed to rewrite content. Please try again.');
    } finally {
      setIsRewriting(false);
    }
  }, [id, note, onRewrite]);

  const handleLockToggle = useCallback(() => {
    if (status === 'locked') {
      onUnlock(id);
    } else {
      onLock(id);
    }
  }, [id, status, onLock, onUnlock]);

  const isLoading = isGenerating || isRewriting;

  return (
    <div className={`section-box status-${status}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <h4 className="font-bold text-white text-base tracking-tight">{heading}</h4>
          {isRequired && status === 'empty' && (
            <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px] font-bold uppercase tracking-wider border border-red-500/20">
              Required
            </span>
          )}
          {status === 'court_ready' && (
            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px] font-bold uppercase tracking-wider border border-indigo-500/20 flex items-center gap-1">
              <CheckCircle size={10} weight="fill" /> Court Ready
            </span>
          )}
          {status === 'locked' && (
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20 flex items-center gap-1">
              <Lock size={10} weight="fill" /> Locked
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={handleEdit}
            disabled={status === 'locked' || isLoading}
            className="p-2 rounded-lg hover:bg-white/5 text-white/60 transition-colors disabled:opacity-30"
            title="Edit Section"
          >
            <PencilSimple size={18} />
          </button>
          <button 
            onClick={handleLockToggle}
            disabled={status === 'empty' || isLoading}
            className={`p-2 rounded-lg transition-colors ${status === 'locked' ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-white/5 text-white/60'} disabled:opacity-30`}
            title={status === 'locked' ? 'Unlock Section' : 'Lock Section'}
          >
            {status === 'locked' ? <Lock size={18} weight="fill" /> : <LockOpen size={18} />}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="relative min-h-[100px] mb-4">
        <AnimatePresence mode="wait">
          {isEditing && status !== 'locked' ? (
            <motion.textarea
              key="editor"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              value={content}
              onChange={(e) => onContentChange(id, e.target.value)}
              className="w-full bg-[#0F172A] border border-[#334155] rounded-xl p-4 text-white text-sm focus:border-indigo-500 outline-none min-h-[150px] font-mono leading-relaxed"
              placeholder={section.feedbackNotes?.length
                ? 'Edit this section or use the AI rewriter below...'
                : 'Type or paste your content here...'}
            />
          ) : (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sm leading-relaxed text-white/80"
            >
              {isLoading ? (
                <div className="flex items-center gap-3 text-indigo-400 py-4">
                  <CircleNotch size={20} className="animate-spin" />
                  <span className="text-sm font-bold">
                    {isGenerating ? 'Generating content...' : 'Rewriting to court-ready...'}
                  </span>
                </div>
              ) : status === 'empty' ? (
                <span className="text-white/20 italic">
                  {section.feedbackNotes?.length
                    ? 'AI will generate this section based on your instructions...'
                    : 'Click "Generate" or "Edit" to add content to this section.'}
                </span>
              ) : showDiff && latestRevision ? (
                <DiffViewer segments={latestRevision.diff} />
              ) : (
                <div className="whitespace-pre-wrap">{content}</div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AI Error */}
      {aiError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400 font-medium">
          {aiError}
        </div>
      )}

      {/* Action Footer (Hidden when locked) */}
      {status !== 'locked' && (
        <div className="flex flex-col gap-4 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <input 
                type="text" 
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Instructions for AI (e.g. 'Make this sound more formal'...)"
                className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-4 text-xs text-white placeholder:text-white/20 outline-none focus:border-indigo-500/50"
                disabled={isLoading}
              />
            </div>
            <button 
              onClick={status === 'empty' && !content.trim() ? handleGenerate : handleRewrite}
              disabled={isLoading || (status !== 'empty' && !content.trim())}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <CircleNotch size={14} className="animate-spin" />
              ) : (
                <Lightning size={14} weight="fill" />
              )}
              {status === 'empty' && !content.trim() ? 'Generate' : 'Rewrite to Court Ready'}
            </button>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {revisions.length > 0 && (
                <button className="flex items-center gap-1.5 text-[10px] font-bold text-white/30 hover:text-white/60 uppercase tracking-widest transition-colors">
                  <ClockCounterClockwise size={14} /> {revisions.length} revision{revisions.length !== 1 ? 's' : ''}
                </button>
              )}
              {revisions.length > 1 && (
                <button className="flex items-center gap-1.5 text-[10px] font-bold text-white/30 hover:text-white/60 uppercase tracking-widest transition-colors">
                  <ArrowCounterClockwise size={14} /> Revert
                </button>
              )}
            </div>
            
            {status === 'drafted' && content.trim() && (
              <button 
                onClick={() => onRewrite(id, '')}
                disabled={isLoading}
                className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400/60 hover:text-indigo-400 uppercase tracking-widest transition-colors disabled:opacity-30"
              >
                <CheckCircle size={14} weight="fill" /> Mark as Court Ready
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
