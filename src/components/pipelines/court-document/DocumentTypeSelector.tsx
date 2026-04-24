'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, ArrowRight } from '@phosphor-icons/react';
import { deriveRequiredSections } from '@/lib/court-documents/deriveRequiredSections';
import type { DocumentType } from '@/lib/court-documents/types';

const DOCUMENT_TYPES = [
  { id: 'motion', label: 'Motion', desc: 'Request for court action (e.g., summary judgment, discovery)' },
  { id: 'petition', label: 'Petition', desc: 'Initial filing to commence a legal proceeding' },
  { id: 'response', label: 'Response', desc: 'Reply to an opposing party\'s motion or petition' },
  { id: 'affidavit', label: 'Affidavit', desc: 'Sworn statement of facts under oath' },
  { id: 'declaration', label: 'Declaration', desc: 'Statement of facts under penalty of perjury' },
  { id: 'notice', label: 'Notice', desc: 'Formal notification to court or opposing party' },
  { id: 'order', label: 'Order', desc: 'Proposed order for judicial signature' },
  { id: 'complaint', label: 'Complaint', desc: 'Initial pleading stating the plaintiff\'s case' },
  { id: 'answer', label: 'Answer', desc: 'Response to a complaint, admitting or denying allegations' },
  { id: 'request', label: 'Request', desc: 'Formal request for discovery, admissions, or production' },
] as const;

interface DocumentTypeSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (documentType: string) => Promise<void> | void;
}

/**
 * DocumentTypeSelector: Modal for choosing document type before entering Review Hub.
 * Shows required sections preview for each type.
 */
export default function DocumentTypeSelector({ isOpen, onClose, onSelect }: DocumentTypeSelectorProps) {
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selectedSections = selectedType ? deriveRequiredSections(selectedType as DocumentType) : [];

  const handleConfirm = async () => {
    if (!selectedType || isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      await onSelect(selectedType);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create draft. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  // ── Focus management ──
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Save previous focus and auto-focus dialog on open
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      // Small delay to let framer-motion render
      const timer = setTimeout(() => dialogRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Escape key handler (respects isCreating)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isCreating) {
      onClose();
    }
    // Trap focus inside dialog
    if (e.key === 'Tab' && dialogRef.current) {
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [isCreating, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => { if (!isCreating) onClose(); }}
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="document-type-dialog-title"
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl bg-[#0F172A] border border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 pb-4 border-b border-white/5">
              <div>
                <h2 id="document-type-dialog-title" className="text-lg font-bold text-white tracking-tight">Select Document Type</h2>
                <p className="text-xs text-white/40 mt-1">Choose the type of court document to draft</p>
              </div>
              <button
                onClick={() => { if (!isCreating) onClose(); }}
                disabled={isCreating}
                aria-label="Close document type dialog"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 border border-white/10 text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Document Type Grid */}
            <div className="p-6 grid grid-cols-2 gap-3">
              {DOCUMENT_TYPES.map(type => {
                const isSelected = selectedType === type.id;
                const sectionCount = deriveRequiredSections(type.id).filter(s => s.required).length;

                return (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    aria-pressed={isSelected}
                    className={`p-4 rounded-2xl text-left transition-all border ${
                      isSelected
                        ? 'bg-indigo-500/10 border-indigo-500/30 shadow-lg shadow-indigo-500/10'
                        : 'bg-white/5 border-white/5 hover:border-white/15 hover:bg-white/8'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <FileText
                        size={20}
                        weight={isSelected ? 'fill' : 'regular'}
                        className={isSelected ? 'text-indigo-400' : 'text-white/40'}
                      />
                      <span className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-white/80'}`}>
                        {type.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-white/40 leading-relaxed line-clamp-2">{type.desc}</p>
                    <p className="text-[10px] text-white/20 mt-2 uppercase tracking-widest font-bold">
                      {sectionCount} required sections
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Section Preview */}
            <AnimatePresence>
              {selectedType && selectedSections.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-6 pb-4">
                    <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                      <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-3">
                        Document Structure Preview
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedSections.map(s => (
                          <span
                            key={s.id}
                            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              s.required
                                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                                : 'bg-white/5 text-white/30 border border-white/5'
                            }`}
                          >
                            {s.heading}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Confirm Button */}
            <div className="p-6 pt-2 border-t border-white/5 space-y-3">
              {createError && (
                <div role="alert" className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                  {createError}
                </div>
              )}
              <button
                onClick={handleConfirm}
                disabled={!selectedType || isCreating}
                className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl font-bold uppercase tracking-widest text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
              >
                {isCreating ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <ArrowRight size={18} weight="bold" />
                    Open in Review Hub
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
