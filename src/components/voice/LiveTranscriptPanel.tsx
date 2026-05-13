'use client';

import type { VoiceTranscriptEntry } from '@/lib/voice';

interface LiveTranscriptPanelProps {
  entries: VoiceTranscriptEntry[];
  emptyText?: string;
}

/** Scrollable transcript display for live voice sessions. */
export function LiveTranscriptPanel({ entries, emptyText = 'Transcript will appear here.' }: LiveTranscriptPanelProps) {
  return (
    <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.035] p-3">
      {entries.length === 0 ? (
        <p className="text-sm text-white/35">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">
                {entry.role === 'user' ? 'You' : 'NEXX'} {!entry.isFinal && 'drafting'}
              </p>
              <p className="text-sm leading-relaxed text-white/75">{entry.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
