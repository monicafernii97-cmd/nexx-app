'use client';

import React from 'react';
import { 
  CheckCircle, 
  WarningCircle, 
  XCircle,
  FilePdf,
  ArrowRight,
  CircleNotch
} from '@phosphor-icons/react';
import type { PreflightResult } from '@/lib/court-documents/types';

interface PracticalPreflightSidebarProps {
  /** Computed preflight result from validatePreflight() */
  preflight: PreflightResult;
  /** Navigate to a specific section for fixing */
  onFixNow?: (sectionId: string) => void;
  /** Trigger PDF export */
  onExportPDF?: () => void;
  /** Whether export is currently in progress */
  isExporting?: boolean;
}

/**
 * PracticalPreflightSidebar: The 'Gatekeeper' for the Review Hub.
 *
 * Receives PreflightResult as prop. No internal state.
 * Shows actionable checklist with section-level "Fix Now" navigation.
 */
export default function PracticalPreflightSidebar({
  preflight,
  onFixNow,
  onExportPDF,
  isExporting = false,
}: PracticalPreflightSidebarProps) {
  const { items, completionPct, canExport, blockers, warnings } = preflight;

  return (
    <div className="sticky top-8 w-full glass-station p-6 flex flex-col h-fit max-h-[calc(100vh-100px)] overflow-y-auto no-scrollbar border-white/5 shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-white uppercase tracking-widest text-xs">Practical Preflight</h3>
        <span className={`text-xs font-mono font-bold ${canExport ? 'text-emerald-400' : 'text-indigo-400'}`}>
          {completionPct}%
        </span>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-white/5 rounded-full mb-4 overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${canExport ? 'bg-emerald-500' : 'bg-indigo-500'}`}
          style={{ width: `${completionPct}%` }} 
        />
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 mb-6 text-[10px] uppercase tracking-widest font-bold">
        {blockers > 0 && (
          <span className="text-rose-400">{blockers} blocker{blockers !== 1 ? 's' : ''}</span>
        )}
        {warnings > 0 && (
          <span className="text-amber-400">{warnings} warning{warnings !== 1 ? 's' : ''}</span>
        )}
        {blockers === 0 && warnings === 0 && (
          <span className="text-emerald-400">All clear</span>
        )}
      </div>

      {/* Checklist */}
      <div className="flex-1 space-y-3 mb-8">
        {items.map((item) => (
          <div key={item.id} className="preflight-check-item flex flex-col gap-1 p-3 rounded-xl bg-white/5 border border-white/5">
            <div className="flex items-center gap-3">
              {item.status === 'complete' && <CheckCircle size={18} weight="fill" className="text-emerald-400 shrink-0" />}
              {item.status === 'warning' && <WarningCircle size={18} weight="fill" className="text-amber-400 shrink-0" />}
              {item.status === 'missing' && <XCircle size={18} weight="fill" className="text-rose-400 shrink-0" />}
              
              <span className={`text-xs font-bold ${item.status === 'complete' ? 'text-white' : 'text-white/60'}`}>
                {item.label}
              </span>
            </div>
            
            {item.description && (
              <p className="pl-7 text-[10px] text-white/40 leading-relaxed italic">
                {item.description}
              </p>
            )}
            
            {item.status !== 'complete' && item.sectionId && onFixNow && (
              <button 
                onClick={() => onFixNow(item.sectionId!)}
                className="pl-7 flex items-center gap-1 text-[9px] font-bold text-indigo-400 uppercase tracking-widest hover:text-indigo-300 transition-colors mt-1"
              >
                Fix Now <ArrowRight size={10} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Export Button (Gated) */}
      <button 
        onClick={onExportPDF}
        disabled={!canExport || isExporting}
        className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 font-bold uppercase tracking-widest text-xs transition-all shadow-lg ${
          canExport && !isExporting
          ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 cursor-pointer' 
          : 'bg-white/5 text-white/20 border border-white/5 cursor-not-allowed grayscale'
        }`}
      >
        {isExporting ? (
          <>
            <CircleNotch size={20} className="animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <FilePdf size={20} weight="bold" />
            Generate Final PDF
          </>
        )}
      </button>
      
      {!canExport && (
        <p className="text-center text-[10px] text-white/20 mt-3 italic">
          {blockers > 0
            ? `${blockers} required section${blockers !== 1 ? 's' : ''} must be filled`
            : 'Locked until all requirements are met'}
        </p>
      )}
    </div>
  );
}
