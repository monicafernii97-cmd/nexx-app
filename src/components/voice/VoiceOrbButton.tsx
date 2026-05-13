'use client';

import { Microphone, MicrophoneSlash, SpinnerGap } from '@phosphor-icons/react';
import type { VoiceConnectionStatus } from '@/lib/voice';

interface VoiceOrbButtonProps {
  status: VoiceConnectionStatus;
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

/** Round voice control button for isolated Realtime voice demos. */
export function VoiceOrbButton({ status, onClick, disabled = false, label = 'Voice' }: VoiceOrbButtonProps) {
  const isActive = status === 'connected' || status === 'listening' || status === 'speaking';
  const isBusy = status === 'requesting_microphone' || status === 'connecting' || status === 'stopping';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isBusy}
      aria-pressed={isActive}
      aria-label={isActive ? `Stop ${label}` : `Start ${label}`}
      className={`relative inline-flex h-14 w-14 items-center justify-center rounded-full border transition-all duration-200 ${
        isActive
          ? 'border-indigo-300/60 bg-indigo-500 text-white shadow-[0_0_36px_rgba(99,102,241,0.35)]'
          : 'border-white/10 bg-white/[0.06] text-white/70 hover:border-white/20 hover:bg-white/[0.1]'
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {isActive && <span className="absolute inset-0 rounded-full bg-indigo-400/30 animate-ping" />}
      {isBusy ? (
        <SpinnerGap size={22} className="relative animate-spin" />
      ) : isActive ? (
        <MicrophoneSlash size={22} weight="fill" className="relative" />
      ) : (
        <Microphone size={22} className="relative" />
      )}
    </button>
  );
}
