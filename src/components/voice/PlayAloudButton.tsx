'use client';

import { Pause, Play, SpeakerHigh, Stop, SpinnerGap } from '@phosphor-icons/react';
import { useTTSPlayer } from '@/hooks/useTTSPlayer';
import type { VoiceName } from '@/lib/voice';

interface PlayAloudButtonProps {
  text: string;
  voice?: VoiceName;
  disabled?: boolean;
}

/** Isolated text-to-speech playback button backed by the server TTS route. */
export function PlayAloudButton({ text, voice, disabled = false }: PlayAloudButtonProps) {
  const tts = useTTSPlayer();
  const isLoading = tts.status === 'loading';
  const canPlay = text.trim().length > 0 && !disabled;

  if (tts.status === 'playing') {
    return (
      <button
        type="button"
        onClick={tts.pause}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white/75 hover:bg-white/[0.08]"
      >
        <Pause size={14} /> Pause
      </button>
    );
  }

  if (tts.status === 'paused') {
    return (
      <span className="inline-flex gap-2">
        <button
          type="button"
          onClick={tts.resume}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white/75 hover:bg-white/[0.08]"
        >
          <Play size={14} /> Resume
        </button>
        <button
          type="button"
          onClick={tts.stop}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] px-3 text-white/55 hover:text-white"
          aria-label="Stop playback"
        >
          <Stop size={14} />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => tts.play(text, { voice })}
      disabled={!canPlay || isLoading}
      title={tts.error ?? undefined}
      className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-white/75 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-45"
    >
      {isLoading ? <SpinnerGap size={14} className="animate-spin" /> : <SpeakerHigh size={14} />}
      Play aloud
    </button>
  );
}
