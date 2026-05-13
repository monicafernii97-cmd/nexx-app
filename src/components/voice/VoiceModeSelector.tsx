'use client';

import { VOICE_MODE_OPTIONS, type VoiceMode } from '@/lib/voice';

interface VoiceModeSelectorProps {
  value: VoiceMode;
  onChange: (mode: VoiceMode) => void;
  disabled?: boolean;
}

/** Segmented voice-mode selector for Chat, Draft, Incident Report, and Judge Lens. */
export function VoiceModeSelector({ value, onChange, disabled = false }: VoiceModeSelectorProps) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.04] p-1">
      {VOICE_MODE_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          disabled={disabled}
          title={option.description}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
            value === option.id
              ? 'bg-indigo-500 text-white shadow-sm'
              : 'text-white/55 hover:bg-white/[0.06] hover:text-white/80'
          } disabled:cursor-not-allowed disabled:opacity-45`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
