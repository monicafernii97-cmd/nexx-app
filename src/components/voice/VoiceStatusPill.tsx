'use client';

import type { VoiceConnectionStatus } from '@/lib/voice';

const STATUS_COPY: Record<VoiceConnectionStatus, string> = {
  idle: 'Voice idle',
  requesting_microphone: 'Requesting mic',
  connecting: 'Connecting',
  connected: 'Connected',
  listening: 'Listening',
  speaking: 'Speaking',
  stopping: 'Stopping',
  error: 'Voice error',
  permission_denied: 'Mic blocked',
};

interface VoiceStatusPillProps {
  status: VoiceConnectionStatus;
  errorMessage?: string;
}

/** Compact status indicator shared by voice demos and future production surfaces. */
export function VoiceStatusPill({ status, errorMessage }: VoiceStatusPillProps) {
  const isProblem = status === 'error' || status === 'permission_denied';

  return (
    <span
      title={errorMessage}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-widest ${
        isProblem
          ? 'border-red-400/25 bg-red-500/10 text-red-200'
          : 'border-white/10 bg-white/[0.05] text-white/55'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${isProblem ? 'bg-red-300' : 'bg-emerald-300'}`} />
      {STATUS_COPY[status]}
    </span>
  );
}
