'use client';

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import { 
  ChatCircleText, 
  Files, 
  PencilLine, 
  ArrowRight, 
  ClockCounterClockwise,
  FileText,
  Plus,
} from '@phosphor-icons/react';
import { useWorkspace } from '@/lib/workspace-context';
import DocumentTypeSelector from './DocumentTypeSelector';
import { deriveRequiredSections } from '@/lib/court-documents/deriveRequiredSections';
import type { DocumentType } from '@/lib/court-documents/types';

interface DraftingHubProps {
  onManualIntake: () => void;
}

/**
 * DraftingHub: The primary entry point for the Court Document Pipeline.
 * Features 3 clear paths for starting a document and a live Drafting Queue.
 */
export default function DraftingHub({ onManualIntake }: DraftingHubProps) {
  const router = useRouter();
  const { activeCaseId } = useWorkspace();
  const [showTypeSelector, setShowTypeSelector] = useState(false);

  // Live drafting queue from Convex
  const drafts = useQuery(api.courtDocumentDrafts.listByUser, {});
  const createDraft = useMutation(api.courtDocumentDrafts.create);
  const createSections = useMutation(api.courtDocumentSections.createMany);

  const handleCreateDraft = useCallback(async (documentType: string) => {
    const documentId = `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const sections = deriveRequiredSections(documentType as DocumentType);

    try {
      // Create draft shell
      await createDraft({
        documentId,
        documentType,
        title: `New ${documentType.charAt(0).toUpperCase() + documentType.slice(1)}`,
        caseId: activeCaseId ?? undefined,
        sectionCount: sections.length,
        source: 'manual_start',
      });

      // Create all sections
      await createSections({
        documentId,
        caseId: activeCaseId ?? undefined,
        sections: sections.map((s, i) => ({
          sectionId: s.id,
          heading: s.heading,
          order: i,
          content: '',
          status: 'empty' as const,
          source: 'blank_template' as const,
          required: s.required,
        })),
      });
    } catch (err) {
      console.error('[DraftingHub] Draft creation failed:', err);
      throw err;
    }

    // Navigate to Review Hub
    router.push(`/docuvault/review/${documentId}`);
  }, [createDraft, createSections, activeCaseId, router]);

  const entryPoints = [
    {
      title: 'Chat to Draft',
      desc: 'Let NEXX extract legal sections from your case chat.',
      icon: ChatCircleText,
      href: '/chat',
      accent: '#6366F1',
      tag: 'AI Assisted'
    },
    {
      title: 'Template Gallery',
      desc: 'Browse 50+ pre-formatted legal templates for your jurisdiction.',
      icon: Files,
      href: '/docuvault/templates',
      accent: '#10B981',
      tag: 'Standardized'
    },
    {
      title: 'Manual Intake',
      desc: 'Paste text or upload a draft to perfect it for court.',
      icon: PencilLine,
      onClick: onManualIntake,
      accent: '#F59E0B',
      tag: 'Direct Control'
    }
  ];

  // Status label mapping
  const statusLabel = (status: string) => {
    switch (status) {
      case 'drafting': return 'In Progress';
      case 'preflight': return 'Reviewing';
      case 'ready_to_export': return 'Ready';
      case 'exported': return 'Exported';
      default: return status;
    }
  };

  // Time ago helper — use stable render-time reference
  const [renderNow] = useState(() => Date.now());
  const timeAgo = useCallback((timestamp: number) => {
    const diff = renderNow - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }, [renderNow]);

  return (
    <div className="space-y-12">
      {/* 1. Header Section */}
      <div className="text-center max-w-2xl mx-auto space-y-4">
        <h2 className="text-xs font-bold text-indigo-400 uppercase tracking-[0.3em]">Court Document Pipeline</h2>
        <h1 className="text-4xl font-bold text-white tracking-tight">Drafting Hub</h1>
        <p className="text-white/40 text-sm leading-relaxed">
          Select your starting point. NEXX will handle the structural integrity, formatting, and legal normalization.
        </p>
      </div>

      {/* 2. Entry Point Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {entryPoints.map((point, i) => {
          const Icon = point.icon;
          const Content = (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="pipeline-card group h-full flex flex-col p-8 items-start text-left cursor-pointer"
            >
              <div className="flex items-center justify-between w-full mb-8">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-indigo-500/30 transition-all">
                  <Icon size={28} weight="fill" style={{ color: point.accent }} />
                </div>
                <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{point.tag}</span>
              </div>
              
              <h3 className="text-xl font-bold text-white mb-2 group-hover:text-indigo-400 transition-colors">
                {point.title}
              </h3>
              <p className="text-sm text-white/40 leading-relaxed mb-8 flex-1">
                {point.desc}
              </p>
              
              <div className="flex items-center gap-2 text-[10px] font-black text-white/20 group-hover:text-white transition-all uppercase tracking-widest">
                Get Started <ArrowRight size={14} />
              </div>
            </motion.div>
          );

          if (point.href) {
            return <Link key={point.title} href={point.href} className="no-underline">{Content}</Link>;
          }
          return <div key={point.title} onClick={point.onClick}>{Content}</div>;
        })}
      </div>

      {/* 3. Drafting Queue Section */}
      <div className="space-y-6 pt-8">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-2">
            <ClockCounterClockwise size={18} className="text-white/40" />
            <h3 className="text-xs font-bold text-white uppercase tracking-widest">Drafting Queue</h3>
          </div>
          <Link href="/docuvault/gallery" className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 uppercase tracking-widest transition-colors">
            View All Saved Documents
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {/* Live drafts from Convex */}
          {drafts === undefined && (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-white/20 border-t-indigo-400 rounded-full animate-spin" />
            </div>
          )}

          {drafts && drafts.length === 0 && (
            <div className="text-center py-8 text-white/20 text-xs uppercase tracking-widest font-bold">
              No drafts yet — start one below
            </div>
          )}

          {drafts?.map((draft) => (
            <div key={draft.documentId} className="flex items-center gap-6 p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-white/10 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/20 group-hover:text-indigo-400 transition-colors">
                <FileText size={24} />
              </div>
              
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-white truncate">{draft.title || 'Untitled Draft'}</h4>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[10px] font-bold text-indigo-400/60 uppercase tracking-widest">{statusLabel(draft.status)}</span>
                  <span className="text-[10px] text-white/20">•</span>
                  <span className="text-[10px] text-white/20 uppercase tracking-widest">{timeAgo(draft.updatedAt)}</span>
                </div>
              </div>

              {draft.completionPct !== undefined && (
                <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden hidden md:block">
                  <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${draft.completionPct}%` }} />
                </div>
              )}

              <Link
                href={`/docuvault/review/${draft.documentId}`}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-[10px] font-bold text-white uppercase tracking-widest hover:bg-white/10 transition-all no-underline"
              >
                Resume Drafting
              </Link>
            </div>
          ))}

          <button
            onClick={() => setShowTypeSelector(true)}
            className="w-full py-4 rounded-2xl border border-dashed border-white/10 hover:border-indigo-500/30 hover:bg-indigo-500/5 text-white/20 hover:text-indigo-400 transition-all flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            <span className="text-[10px] font-bold uppercase tracking-widest">Start New Manual Draft</span>
          </button>
        </div>
      </div>

      {/* Document Type Selector Modal */}
      <DocumentTypeSelector
        isOpen={showTypeSelector}
        onClose={() => setShowTypeSelector(false)}
        onSelect={handleCreateDraft}
      />
    </div>
  );
}
