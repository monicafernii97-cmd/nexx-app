'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TTSFormat, VoiceName } from '@/lib/voice';

type TTSStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

interface PlayOptions {
  voice?: VoiceName;
  format?: TTSFormat;
  speed?: number;
}

/** Fetches server-generated TTS audio and manages playback/object URL cleanup. */
export function useTTSPlayer() {
  const [status, setStatus] = useState<TTSStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.remove();
      audioRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const play = useCallback(async (text: string, options: PlayOptions = {}) => {
    cleanup();
    setError(null);
    setStatus('loading');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          text,
          voice: options.voice,
          format: options.format ?? 'mp3',
          speed: options.speed,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to generate speech.');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onplay = () => setStatus('playing');
      audio.onpause = () => setStatus('paused');
      audio.onended = () => setStatus('idle');
      audio.onerror = () => {
        setError('Audio playback failed.');
        setStatus('error');
      };

      await audio.play();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      cleanup();
      setError(err instanceof Error ? err.message : 'Failed to play audio.');
      setStatus('error');
    }
  }, [cleanup]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const resume = useCallback(async () => {
    if (!audioRef.current) return;
    await audioRef.current.play();
  }, []);

  const stop = useCallback(() => {
    cleanup();
    setStatus('idle');
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  return {
    status,
    error,
    play,
    pause,
    resume,
    stop,
    isPlaying: status === 'playing',
  };
}
