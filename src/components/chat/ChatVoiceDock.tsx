'use client';

import { useMemo, useState } from 'react';
import { ArrowBendDownLeft, ChatCircleText, Microphone, MicrophoneSlash, PaperPlaneRight, PushPin, Stop, TextT } from '@phosphor-icons/react';
import { LiveTranscriptPanel, VoiceModeSelector, VoiceOrbButton, VoiceStatusPill } from '@/components/voice';
import { useRealtimeVoice } from '@/hooks/useRealtimeVoice';
import type { VoiceMode, VoiceTranscriptEntry } from '@/lib/voice';
import type { ActionType, PanelData } from '@/lib/ui-intelligence/types';

interface ChatVoiceDockProps {
  disabled?: boolean;
  isLight?: boolean;
  onInsertComposer: (text: string) => void;
  onSubmitUserMessage: (text: string) => void;
  onAssistantAction?: (action: ActionType, panel: PanelData) => void;
}

const MODE_TO_INSTRUCTIONS: Record<VoiceMode, string> = {
  chat: 'Use this live voice session as a companion to the NEXX chat workspace. Keep answers concise and invite the user to send important transcript text into chat when useful.',
  draft: 'Help the user speak through draft language. Keep phrasing clean, neutral, and easy to move into the composer.',
  incident_report: 'Help the user narrate facts neutrally for later chat follow-up. Do not create or save an incident report.',
  judge_lens: 'Help the user think through how a court could hear the facts. Avoid legal conclusions and keep framing practical.',
};

/** Return the newest finalized transcript text for a single speaker role. */
function latestFinalText(entries: VoiceTranscriptEntry[], role: VoiceTranscriptEntry['role']) {
  return [...entries].reverse().find((entry) => entry.role === role && entry.isFinal && entry.text.trim())?.text.trim() ?? '';
}

/** Build a plain text transcript suitable for inserting into the chat composer. */
function transcriptText(entries: VoiceTranscriptEntry[]) {
  return entries
    .filter((entry) => entry.isFinal && entry.text.trim())
    .map((entry) => `${entry.role === 'user' ? 'User' : 'NEXX'}: ${entry.text.trim()}`)
    .join('\n\n');
}

/** Compact live voice dock for the premium chat workspace. */
export function ChatVoiceDock({
  disabled = false,
  onInsertComposer,
  onSubmitUserMessage,
  onAssistantAction,
}: ChatVoiceDockProps) {
  const [mode, setMode] = useState<VoiceMode>('chat');
  const [isExpanded, setIsExpanded] = useState(false);
  const [fallbackText, setFallbackText] = useState('');
  const voice = useRealtimeVoice({ mode, instructions: MODE_TO_INSTRUCTIONS[mode] });

  const lastUserText = useMemo(() => latestFinalText(voice.transcript, 'user'), [voice.transcript]);
  const lastAssistantText = useMemo(() => latestFinalText(voice.transcript, 'assistant'), [voice.transcript]);
  const fullTranscript = useMemo(() => transcriptText(voice.transcript), [voice.transcript]);
  const hasMicFallback = voice.status === 'permission_denied' || voice.status === 'error';

  /** Connect or disconnect the Realtime voice session from the dock orb. */
  const handleOrbClick = () => {
    if (voice.isActive || voice.status === 'connecting' || voice.status === 'requesting_microphone') {
      voice.stop();
      return;
    }

    setIsExpanded(true);
    void voice.start();
  };

  /** Send typed fallback text through voice when connected, or into chat when offline. */
  const submitFallbackText = () => {
    const text = fallbackText.trim();
    if (!text) return;

    if (voice.isActive) {
      const sent = voice.sendText(text);
      if (sent) {
        setFallbackText('');
        return;
      }
    }

    onSubmitUserMessage(text);
    setFallbackText('');
  };

  /** Reuse existing workspace actions to save or pin the latest assistant voice reply. */
  const saveAssistantText = (action: ActionType) => {
    if (!lastAssistantText || !onAssistantAction) return;
    onAssistantAction(action, {
      type: 'overview',
      title: 'Voice assistant response',
      content: lastAssistantText,
    });
  };

  return (
    <section
      aria-label="Live voice assistant"
      className="rounded-2xl border border-white/10 bg-[#111827]/92 p-3 text-white shadow-[0_18px_55px_rgba(0,0,0,0.20)] backdrop-blur-xl"
    >
      <div className="flex items-center gap-3">
        <VoiceOrbButton status={voice.status} onClick={handleOrbClick} disabled={disabled} label="live voice" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">
              Live Voice
            </p>
            <VoiceStatusPill status={voice.status} errorMessage={voice.error?.message} />
          </div>
          <p className="mt-1 truncate text-xs text-white/45">
            {voice.isActive ? 'Realtime audio is connected.' : 'Speak with NEXX, then send useful transcript into chat.'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={voice.toggleMute}
            disabled={disabled || !voice.isActive}
            className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
              voice.isMuted
                ? 'border-red-300/40 bg-red-500/15 text-red-200'
                : 'border-white/10 bg-white/[0.04] text-white/55 hover:text-white'
            } disabled:cursor-not-allowed disabled:opacity-40`}
            aria-label={voice.isMuted ? 'Unmute microphone' : 'Mute microphone'}
            title={voice.isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {voice.isMuted ? <MicrophoneSlash size={16} weight="fill" /> : <Microphone size={16} />}
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold uppercase tracking-widest text-white/55 transition hover:text-white"
          >
            <ChatCircleText size={14} />
            {isExpanded ? 'Hide' : 'Open'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 space-y-3">
          <VoiceModeSelector value={mode} onChange={setMode} disabled={disabled || voice.isActive} />

          <LiveTranscriptPanel
            entries={voice.transcript}
            emptyText={voice.isActive ? 'Listening for transcript...' : 'Connect voice to begin.'}
          />

          {hasMicFallback && (
            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
              <p className="mb-2 text-xs font-semibold text-white/60">
                Microphone is unavailable. Type instead.
              </p>
              <div className="flex gap-2">
                <input
                  value={fallbackText}
                  onChange={(event) => setFallbackText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') submitFallbackText();
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30"
                  placeholder="Type a fallback message..."
                />
                <button
                  type="button"
                  onClick={submitFallbackText}
                  disabled={!fallbackText.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500 text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send fallback text"
                >
                  <PaperPlaneRight size={16} weight="fill" />
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onInsertComposer(lastUserText)}
              disabled={!lastUserText}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold uppercase tracking-widest text-white/60 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              <TextT size={14} />
              Insert Last
            </button>
            <button
              type="button"
              onClick={() => onSubmitUserMessage(lastUserText)}
              disabled={!lastUserText || disabled}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-indigo-300/30 bg-indigo-500/15 px-3 text-[10px] font-bold uppercase tracking-widest text-indigo-100 transition hover:bg-indigo-500/25 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ArrowBendDownLeft size={14} />
              Send Last
            </button>
            <button
              type="button"
              onClick={() => onInsertComposer(fullTranscript)}
              disabled={!fullTranscript}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold uppercase tracking-widest text-white/60 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              <TextT size={14} />
              Insert All
            </button>
            <button
              type="button"
              onClick={voice.clearTranscript}
              disabled={voice.transcript.length === 0}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold uppercase tracking-widest text-white/45 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Stop size={14} />
              Clear
            </button>
            {onAssistantAction && (
              <>
                <button
                  type="button"
                  onClick={() => saveAssistantText('save_to_case')}
                  disabled={!lastAssistantText}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold uppercase tracking-widest text-white/55 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <TextT size={14} />
                  Save Reply
                </button>
                <button
                  type="button"
                  onClick={() => saveAssistantText('pin')}
                  disabled={!lastAssistantText}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-[10px] font-bold uppercase tracking-widest text-white/55 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <PushPin size={14} />
                  Pin Reply
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
