'use client';

import { useEffect, useRef } from 'react';
import type { VoiceTranscriptEntry } from '@/lib/voice';

interface LiveTranscriptPanelProps {
  entries: VoiceTranscriptEntry[];
  emptyText?: string;
}

/** Scrollable transcript display for live voice sessions. */
export function LiveTranscriptPanel({ entries, emptyText = 'Transcript will appear here.' }: LiveTranscriptPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUpRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || entries.length === 0 || isUserScrolledUpRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [entries.length]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    isUserScrolledUpRef.current = distanceFromBottom > 24;
  };

  return (
    <div
      ref={containerRef}
      role="log"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions text"
      aria-label="Voice transcript"
      onScroll={handleScroll}
      className="max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.035] p-3"
    >
      {entries.length === 0 ? (
        <p className="text-sm text-white/35">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">
                {entry.role === 'user' ? 'You' : 'NEXX'}{!entry.isFinal && ' (drafting)'}
              </p>
              <p className="text-sm leading-relaxed text-white/75">{entry.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
