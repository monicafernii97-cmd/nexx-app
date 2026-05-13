'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getRealtimeEventTranscript,
  type RealtimeSessionResponse,
  type VoiceConnectionStatus,
  type VoiceMode,
  type VoiceTranscriptEntry,
} from '@/lib/voice';

interface UseRealtimeVoiceOptions {
  mode?: VoiceMode;
  instructions?: string;
}

interface RealtimeError {
  message: string;
  code?: string;
}

interface SendRealtimeTextOptions {
  createResponse?: boolean;
}

const REALTIME_WEBRTC_URL = 'https://api.openai.com/v1/realtime/calls';

/** Browser WebRTC voice session hook using server-minted short-lived Realtime credentials. */
export function useRealtimeVoice(options: UseRealtimeVoiceOptions = {}) {
  const [status, setStatus] = useState<VoiceConnectionStatus>('idle');
  const [error, setError] = useState<RealtimeError | null>(null);
  const [transcript, setTranscript] = useState<VoiceTranscriptEntry[]>([]);
  const [session, setSession] = useState<RealtimeSessionResponse | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const assistantDraftRef = useRef('');
  const assistantDraftIdRef = useRef<string | null>(null);
  const mutedRef = useRef(false);
  const startAttemptRef = useRef(0);

  /** Append a transcript entry and return its generated id for later updates. */
  const appendTranscript = useCallback((entry: Omit<VoiceTranscriptEntry, 'id' | 'createdAt'>) => {
    const id = crypto.randomUUID();
    setTranscript((current) => [
      ...current,
      {
        ...entry,
        id,
        createdAt: Date.now(),
      },
    ]);
    return id;
  }, []);

  /** Create or update the in-progress assistant transcript row as text deltas arrive. */
  const updateAssistantDraftTranscript = useCallback((text: string, isFinal: boolean) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (!assistantDraftIdRef.current) {
      assistantDraftIdRef.current = appendTranscript({ role: 'assistant', text: trimmed, isFinal });
      return;
    }

    const draftId = assistantDraftIdRef.current;
    setTranscript((current) => current.map((entry) => (
      entry.id === draftId ? { ...entry, text: trimmed, isFinal } : entry
    )));

    if (isFinal) {
      assistantDraftIdRef.current = null;
    }
  }, [appendTranscript]);

  /** Tear down all WebRTC/audio resources without clearing the visible transcript. */
  const cleanup = useCallback(() => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;

    peerRef.current?.getSenders().forEach((sender) => {
      sender.track?.stop();
    });
    peerRef.current?.close();
    peerRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
      audioElementRef.current.remove();
      audioElementRef.current = null;
    }

    assistantDraftRef.current = '';
    assistantDraftIdRef.current = null;
    setSession(null);
  }, []);

  /** Stop the current Realtime session and invalidate pending async start work. */
  const stop = useCallback(() => {
    startAttemptRef.current += 1;
    setStatus('stopping');
    cleanup();
    setStatus('idle');
  }, [cleanup]);

  /** Interpret OpenAI Realtime data-channel events into status and transcript state. */
  const handleRealtimeEvent = useCallback((event: unknown) => {
    if (!event || typeof event !== 'object') return;
    const record = event as Record<string, unknown>;
    const type = typeof record.type === 'string' ? record.type : '';

    if (type === 'input_audio_buffer.speech_started') {
      setStatus('listening');
    } else if (type === 'response.created') {
      setStatus('speaking');
      assistantDraftRef.current = '';
      assistantDraftIdRef.current = null;
    } else if (type === 'response.done') {
      setStatus('connected');
      if (assistantDraftRef.current.trim()) {
        updateAssistantDraftTranscript(assistantDraftRef.current, true);
        assistantDraftRef.current = '';
      }
    } else if (type === 'error') {
      const message = typeof record.error === 'object' && record.error !== null
        ? String((record.error as Record<string, unknown>).message ?? 'Realtime voice error')
        : 'Realtime voice error';
      setError({ message });
      setStatus('error');
    }

    const fragment = getRealtimeEventTranscript(event);
    if (!fragment) return;

    if (fragment.role === 'assistant' && !fragment.isFinal) {
      assistantDraftRef.current += fragment.text;
      updateAssistantDraftTranscript(assistantDraftRef.current, false);
      return;
    }

    if (fragment.role === 'assistant' && fragment.isFinal) {
      assistantDraftRef.current = fragment.text;
      updateAssistantDraftTranscript(fragment.text, true);
      assistantDraftRef.current = '';
      return;
    }

    appendTranscript(fragment);
  }, [appendTranscript, updateAssistantDraftTranscript]);

  /** Enable or disable outgoing microphone tracks while preserving the session. */
  const setMicrophoneMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    mediaStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    setIsMuted(muted);
  }, []);

  /** Start a browser WebRTC session using a server-created short-lived credential. */
  const start = useCallback(async () => {
    if (status === 'connecting' || status === 'connected' || status === 'listening' || status === 'speaking') return;

    const attempt = ++startAttemptRef.current;
    const isCurrentAttempt = () => attempt === startAttemptRef.current;

    setError(null);
    setStatus('requesting_microphone');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isCurrentAttempt()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !mutedRef.current;
      });
      setStatus('connecting');

      const sessionResponse = await fetch('/api/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: options.mode ?? 'chat',
          instructions: options.instructions,
        }),
      });

      if (!isCurrentAttempt()) return;

      if (!sessionResponse.ok) {
        throw new Error('Unable to create realtime voice session.');
      }

      const nextSession = await sessionResponse.json() as RealtimeSessionResponse;
      if (!isCurrentAttempt()) return;
      setSession(nextSession);

      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      if (!isCurrentAttempt()) {
        cleanup();
        return;
      }

      const audioElement = new Audio();
      audioElement.autoplay = true;
      audioElementRef.current = audioElement;

      peer.ontrack = (event) => {
        audioElement.srcObject = event.streams[0] ?? null;
      };

      stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));

      const dataChannel = peer.createDataChannel('oai-events');
      dataChannelRef.current = dataChannel;
      dataChannel.onopen = () => {
        if (isCurrentAttempt()) setStatus('connected');
      };
      dataChannel.onmessage = (event) => {
        if (!isCurrentAttempt()) return;
        try {
          handleRealtimeEvent(JSON.parse(event.data));
        } catch {
          // Ignore non-JSON transport keepalives.
        }
      };
      dataChannel.onerror = () => {
        if (!isCurrentAttempt()) return;
        setError({ message: 'Realtime data channel failed.' });
        setStatus('error');
      };

      const offer = await peer.createOffer();
      if (!isCurrentAttempt()) return;
      await peer.setLocalDescription(offer);
      if (!isCurrentAttempt()) return;

      const answerResponse = await fetch(REALTIME_WEBRTC_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${nextSession.clientSecret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });

      if (!isCurrentAttempt()) return;

      if (!answerResponse.ok) {
        throw new Error('Realtime WebRTC handshake failed.');
      }

      const answerSdp = await answerResponse.text();
      if (!isCurrentAttempt()) return;
      await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (err) {
      if (!isCurrentAttempt()) return;
      cleanup();
      const isPermissionError = err instanceof DOMException && (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError'
      );
      setError({ message: err instanceof Error ? err.message : 'Unable to start voice session.' });
      setStatus(isPermissionError ? 'permission_denied' : 'error');
    }
  }, [cleanup, handleRealtimeEvent, options.instructions, options.mode, status]);

  /** Send typed fallback text through the open Realtime data channel. */
  const sendText = useCallback((text: string, sendOptions: SendRealtimeTextOptions = {}) => {
    const dataChannel = dataChannelRef.current;
    if (!dataChannel || dataChannel.readyState !== 'open' || !text.trim()) return false;

    dataChannel.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: text.trim() }],
      },
    }));

    if (sendOptions.createResponse ?? true) {
      dataChannel.send(JSON.stringify({ type: 'response.create' }));
    }

    appendTranscript({ role: 'user', text: text.trim(), isFinal: true });
    return true;
  }, [appendTranscript]);

  useEffect(() => () => {
    startAttemptRef.current += 1;
    cleanup();
  }, [cleanup]);

  /** Clear visible transcript rows and reset any in-progress assistant draft tracking. */
  const clearTranscript = useCallback(() => {
    assistantDraftRef.current = '';
    assistantDraftIdRef.current = null;
    setTranscript([]);
  }, []);

  return {
    status,
    error,
    transcript,
    session,
    isMuted,
    isActive: status === 'connected' || status === 'listening' || status === 'speaking',
    start,
    stop,
    mute: () => setMicrophoneMuted(true),
    unmute: () => setMicrophoneMuted(false),
    toggleMute: () => setMicrophoneMuted(!mutedRef.current),
    sendText,
    clearTranscript,
  };
}
