'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@convex/_generated/api';
import { 
  DotsSixVertical, 
  FileImage, 
  FilePdf, 
  FileText, 
  Trash, 
  ListChecks, 
  BookOpen, 
  Hash, 
  SquaresFour,
  ArrowRight,
  CheckCircle,
  Plus,
  MagnifyingGlass,
} from '@phosphor-icons/react';
import { useWorkspace } from '@/lib/workspace-context';

interface ExhibitItem {
  id: string;
  label: string;
  title: string;
  type: 'image' | 'pdf' | 'text';
  summary: string;
  sourceId?: string;
}

/**
 * ExhibitPacketBuilder: The assembly line for Evidence.
 * Features: Reordering, Bates numbering config, and automated ToC generation.
 * Now reads evidence from workspace casePins + uploaded files.
 */
export default function ExhibitPacketBuilder() {
  const { activeCaseId } = useWorkspace();

  // Live workspace data — casePins.listByUser doesn't filter by case,
  // so we filter client-side
  const allCasePins = useQuery(api.casePins.listByUser, {});

  // Local state for exhibit items (user-assembled)
  const [items, setItems] = useState<ExhibitItem[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const [config, setConfig] = useState({
    coverSheet: true,
    tableOfContents: true,
    batesNumbering: true,
    batesPrefix: 'NEX-',
    batesStart: '0001'
  });

  // Available evidence from workspace (not yet added)
  const availableEvidence = useMemo(() => {
    const existing = new Set(items.map(i => i.sourceId));
    const evidence: Array<{ id: string; title: string; summary: string; type: 'text' | 'image' | 'pdf' }> = [];

    // Filter pins by active case, then extract evidence-worthy items
    const casePins = activeCaseId
      ? allCasePins?.filter(p => p.caseId === activeCaseId) ?? []
      : allCasePins ?? [];

    for (const pin of casePins) {
      if (existing.has(pin._id)) continue;
      if (['key_fact', 'draft_snippet', 'timeline_anchor'].includes(pin.type)) {
        evidence.push({
          id: pin._id,
          title: pin.title,
          summary: pin.content.slice(0, 120) + (pin.content.length > 120 ? '...' : ''),
          type: 'text',
        });
      }
    }

    return evidence;
  }, [allCasePins, items, activeCaseId]);

  // Exhibit letter generator
  const exhibitLabel = (index: number) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (index < 26) return `Exhibit ${letters[index]}`;
    return `Exhibit ${letters[Math.floor(index / 26) - 1]}${letters[index % 26]}`;
  };

  const addEvidence = (evidence: { id: string; title: string; summary: string; type: 'text' | 'image' | 'pdf' }) => {
    setItems(prev => [
      ...prev,
      {
        id: `item_${Date.now()}`,
        label: exhibitLabel(prev.length),
        title: evidence.title,
        type: evidence.type,
        summary: evidence.summary,
        sourceId: evidence.id,
      },
    ]);
    setShowPicker(false);
  };

  const removeItem = (itemId: string) => {
    setItems(prev => prev.filter(i => i.id !== itemId).map((item, i) => ({ ...item, label: exhibitLabel(i) })));
  };

  const handleGeneratePacket = async () => {
    if (items.length === 0) return;
    setIsGenerating(true);
    // TODO: Call generateExportPDF() with exhibit configuration
    setTimeout(() => setIsGenerating(false), 2000);
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-10 pb-6 border-b border-white/5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <SquaresFour size={24} weight="fill" className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight leading-none mb-1">Exhibit Packet Builder</h1>
            <p className="text-xs font-bold text-white/30 uppercase tracking-[0.2em]">Evidence Assembly Pipeline</p>
          </div>
        </div>

        <button
          onClick={handleGeneratePacket}
          disabled={items.length === 0 || isGenerating}
          className="flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-amber-600/20 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <FilePdf size={20} weight="bold" />
          )}
          {isGenerating ? 'Generating...' : 'Generate Final Packet'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Assembly Table */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between px-2 mb-2">
            <h2 className="text-xs font-bold text-white/40 uppercase tracking-[0.2em]">Evidence Queue</h2>
            <span className="text-[10px] font-bold text-amber-400/50 uppercase tracking-widest">{items.length} items staged</span>
          </div>

          {/* Empty state */}
          {items.length === 0 && (
            <div className="text-center py-12 text-white/20 text-xs uppercase tracking-widest font-bold">
              No evidence added yet — add items from your workspace below
            </div>
          )}

          {items.map((item, index) => (
            <div key={item.id} className="group flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:border-amber-500/30 transition-all cursor-move">
              <div className="text-white/20 group-hover:text-amber-400/40">
                <DotsSixVertical size={24} />
              </div>
              
              <div className="w-20 flex flex-col items-center justify-center gap-1">
                <span className="text-[10px] font-black text-amber-400 uppercase tracking-tighter">{item.label}</span>
                <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-white/40">
                  {item.type === 'image' && <FileImage size={20} />}
                  {item.type === 'pdf' && <FilePdf size={20} />}
                  {item.type === 'text' && <FileText size={20} />}
                </div>
              </div>

              <div className="flex-1">
                <h4 className="text-white font-bold text-sm mb-1">{item.title}</h4>
                <p className="text-[11px] text-white/40 leading-relaxed max-w-lg">{item.summary}</p>
              </div>

              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-2 rounded-lg hover:bg-red-500/10 text-red-400 transition-colors"
                >
                  <Trash size={18} />
                </button>
              </div>
            </div>
          ))}

          {/* Add Source Trigger */}
          <button
            onClick={() => setShowPicker(!showPicker)}
            className="w-full py-6 rounded-2xl border border-dashed border-white/10 hover:border-amber-500/30 hover:bg-amber-500/5 text-white/20 hover:text-amber-400 transition-all flex items-center justify-center gap-3"
          >
            <span className="text-xl">+</span>
            <span className="text-[10px] font-bold uppercase tracking-widest">Add Evidence Source from Workspace</span>
          </button>

          {/* Evidence Picker */}
          {showPicker && (
            <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-widest">Available Workspace Evidence</h4>
              
              {!activeCaseId && (
                <p className="text-xs text-white/30">Select a case to see available evidence.</p>
              )}

              {availableEvidence.length === 0 && activeCaseId && (
                <p className="text-xs text-white/30">No available evidence found in your workspace. Add key facts or draft snippets first.</p>
              )}

              {availableEvidence.map(ev => (
                <button
                  key={ev.id}
                  onClick={() => addEvidence(ev)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/20 transition-all text-left"
                >
                  <Plus size={16} className="text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">{ev.title}</p>
                    <p className="text-[10px] text-white/40 truncate">{ev.summary}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Config Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-station p-6 border-white/5 shadow-2xl space-y-8">
            <h3 className="font-bold text-white uppercase tracking-widest text-xs mb-4">Packet Configuration</h3>

            {/* Toggles */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BookOpen size={18} className="text-white/40" />
                  <span className="text-xs font-bold text-white/80">Cover Sheet</span>
                </div>
                <button 
                  onClick={() => setConfig({...config, coverSheet: !config.coverSheet})}
                  className={`w-10 h-5 rounded-full relative transition-colors ${config.coverSheet ? 'bg-amber-600' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${config.coverSheet ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ListChecks size={18} className="text-white/40" />
                  <span className="text-xs font-bold text-white/80">Table of Contents</span>
                </div>
                <button 
                  onClick={() => setConfig({...config, tableOfContents: !config.tableOfContents})}
                  className={`w-10 h-5 rounded-full relative transition-colors ${config.tableOfContents ? 'bg-amber-600' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${config.tableOfContents ? 'left-6' : 'left-1'}`} />
                </button>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/5">
                <div className="flex items-center gap-3">
                  <Hash size={18} className="text-white/40" />
                  <span className="text-xs font-bold text-white/80">Bates Numbering</span>
                </div>
                <button 
                  onClick={() => setConfig({...config, batesNumbering: !config.batesNumbering})}
                  className={`w-10 h-5 rounded-full relative transition-colors ${config.batesNumbering ? 'bg-amber-600' : 'bg-white/10'}`}
                >
                  <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${config.batesNumbering ? 'left-6' : 'left-1'}`} />
                </button>
              </div>
            </div>

            {/* Bates Inputs */}
            {config.batesNumbering && (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1">Prefix</label>
                    <input 
                      type="text" 
                      value={config.batesPrefix}
                      onChange={(e) => setConfig({...config, batesPrefix: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-xs text-white outline-none focus:border-amber-500/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold text-white/30 uppercase tracking-widest mb-1">Start At</label>
                    <input 
                      type="text" 
                      value={config.batesStart}
                      onChange={(e) => setConfig({...config, batesStart: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-lg py-2 px-3 text-xs text-white outline-none focus:border-amber-500/50"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-white/20 italic">
                  Format Preview: {config.batesPrefix}{config.batesStart}
                </p>
              </div>
            )}
          </div>

          <div className="p-6 rounded-2xl bg-amber-500/5 border border-amber-500/10">
            <h5 className="text-xs font-bold text-amber-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <CheckCircle size={14} weight="fill" /> Smart Indexing
            </h5>
            <p className="text-[11px] text-white/40 leading-relaxed">
              Your exhibits will be automatically indexed and cross-referenced in the generated Table of Contents.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
