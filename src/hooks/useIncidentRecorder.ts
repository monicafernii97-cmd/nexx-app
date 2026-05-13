'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranscriptionResponse } from '@/lib/voice';

type RecorderStatus = 'idle' | 'requesting_microphone' | 'recording' | 'stopping' | 'transcribing' | 'error' | 'permission_denied';
const BUSY_RECORDER_STATUSES: RecorderStatus[] = ['requesting_microphone', 'recording', 'stopping', 'transcribing'];

interface RecorderError {
  message: string;
}

/** Isolated recorder hook for longer incident-style recordings and STT upload. */
export function useIncidentRecorder() {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [error, setError] = useState<RecorderError | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResponse | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const start = useCallback(async () => {
    if (BUSY_RECORDER_STATUSES.includes(status)) return;
    setError(null);
    setAudioBlob(null);
    setTranscription(null);
    setStatus('requesting_microphone');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        cleanup();
        setStatus('idle');
      };
      recorder.onerror = () => {
        setError({ message: 'Recording failed.' });
        cleanup();
        setStatus('error');
      };

      recorder.start();
      setStatus('recording');
    } catch (err) {
      cleanup();
      const isPermissionError = err instanceof DOMException && (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError'
      );
      setError({ message: err instanceof Error ? err.message : 'Unable to access microphone.' });
      setStatus(isPermissionError ? 'permission_denied' : 'error');
    }
  }, [cleanup, status]);

  const stop = useCallback(() => {
    if (status === 'stopping' || status === 'transcribing') return;
    if (recorderRef.current?.state === 'recording') {
      setStatus('stopping');
      recorderRef.current.stop();
      return;
    }
    cleanup();
    setStatus('idle');
  }, [cleanup, status]);

  const transcribe = useCallback(async (blob = audioBlob) => {
    if (!blob) return null;
    setError(null);
    setStatus('transcribing');

    try {
      const formData = new FormData();
      formData.append('file', new File([blob], `incident-recording-${Date.now()}.webm`, { type: blob.type || 'audio/webm' }));
      formData.append('prompt', 'Family law incident report narration. Preserve names, dates, places, and sequence of events.');

      const response = await fetch('/api/audio/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Failed to transcribe recording.');
      }

      setTranscription(data as TranscriptionResponse);
      setStatus('idle');
      return data as TranscriptionResponse;
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : 'Failed to transcribe recording.' });
      setStatus('error');
      return null;
    }
  }, [audioBlob]);

  const reset = useCallback(() => {
    cleanup();
    setAudioBlob(null);
    setTranscription(null);
    setError(null);
    setStatus('idle');
  }, [cleanup]);

  useEffect(() => cleanup, [cleanup]);

  return {
    status,
    error,
    audioBlob,
    transcription,
    isRecording: status === 'recording',
    start,
    stop,
    transcribe,
    reset,
  };
}
