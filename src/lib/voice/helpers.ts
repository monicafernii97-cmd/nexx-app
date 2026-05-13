import {
  DEFAULT_TTS_FORMAT,
  DEFAULT_TTS_VOICE,
  MAX_TRANSCRIPTION_FILE_BYTES,
  MAX_TTS_CHARS,
  SUPPORTED_TRANSCRIPTION_MIME_TYPES,
  SUPPORTED_TTS_FORMATS,
  SUPPORTED_TTS_VOICES,
  VOICE_MODE_OPTIONS,
} from './constants';
import { VOICE_MODES, type TTSFormat, type VoiceMode, type VoiceName } from './types';

const MODE_INSTRUCTIONS: Record<VoiceMode, string> = {
  chat: 'You are NEXX voice support. Be concise, calm, and practical. Do not create records or persist case actions.',
  draft: 'You are NEXX voice drafting support. Help capture clear draft language, but do not save or file anything.',
  incident_report: 'You are NEXX incident intake support. Ask neutral clarifying questions and avoid saving records.',
  judge_lens: 'You are NEXX judge-lens support. Help frame facts from a court-oriented perspective without legal conclusions.',
};

/** Return whether an arbitrary value is one of the supported voice mode ids. */
export function isVoiceMode(value: unknown): value is VoiceMode {
  return typeof value === 'string' && (VOICE_MODES as readonly string[]).includes(value);
}

/** Get the human-readable display label for a supported voice mode. */
export function getVoiceModeLabel(mode: VoiceMode): string {
  return VOICE_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? 'Chat';
}

/** Build bounded Realtime system instructions for the selected isolated voice mode. */
export function buildRealtimeInstructions(mode: VoiceMode, customInstructions?: string): string {
  const trimmed = customInstructions?.trim();
  if (!trimmed) return MODE_INSTRUCTIONS[mode];
  return `${MODE_INSTRUCTIONS[mode]}\n\nAdditional session guidance:\n${trimmed.slice(0, 2000)}`;
}

/** Return whether a browser-provided upload MIME type is supported for transcription. */
export function isSupportedTranscriptionMimeType(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  return (SUPPORTED_TRANSCRIPTION_MIME_TYPES as readonly string[]).includes(normalized);
}

/** Validate an audio upload before forwarding it to the server-side transcription route. */
export function validateTranscriptionFile(file: File): string | null {
  if (file.size <= 0) return 'Audio file is empty.';
  if (file.size > MAX_TRANSCRIPTION_FILE_BYTES) return 'Audio file is too large. Maximum size is 25MB.';
  if (!isSupportedTranscriptionMimeType(file.type)) {
    return 'Unsupported audio format. Upload MP3, MP4, MPEG, MPGA, M4A, WAV, WEBM, FLAC, AAC, or OGG audio.';
  }
  return null;
}

/** Normalize a caller-provided TTS response format to a supported OpenAI audio format. */
export function normalizeTTSFormat(format: unknown): TTSFormat {
  return typeof format === 'string' && (SUPPORTED_TTS_FORMATS as readonly string[]).includes(format)
    ? (format as TTSFormat)
    : DEFAULT_TTS_FORMAT;
}

/** Normalize a caller-provided voice name to a supported TTS voice. */
export function normalizeVoiceName(voice: unknown): VoiceName {
  return typeof voice === 'string' && (SUPPORTED_TTS_VOICES as readonly string[]).includes(voice)
    ? (voice as VoiceName)
    : DEFAULT_TTS_VOICE;
}

/** Clamp TTS playback speed to the range accepted by OpenAI speech generation. */
export function normalizeTTSSpeed(speed: unknown): number {
  if (typeof speed !== 'number' || Number.isNaN(speed)) return 1;
  return Math.min(4, Math.max(0.25, speed));
}

/** Validate and trim text before sending it to the server-side TTS route. */
export function validateTTSText(text: unknown): string {
  if (typeof text !== 'string') {
    throw new Error('Text is required.');
  }
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error('Text is required.');
  }
  if (trimmed.length > MAX_TTS_CHARS) {
    throw new Error(`Text is too long. Maximum length is ${MAX_TTS_CHARS} characters.`);
  }
  return trimmed;
}

/** Map the selected TTS response format to the response content type. */
export function contentTypeForTTSFormat(format: TTSFormat): string {
  if (format === 'mp3') return 'audio/mpeg';
  if (format === 'opus') return 'audio/ogg; codecs=opus';
  if (format === 'aac') return 'audio/aac';
  if (format === 'flac') return 'audio/flac';
  if (format === 'wav') return 'audio/wav';
  return 'audio/pcm';
}

/** Extract user or assistant transcript fragments from OpenAI Realtime data-channel events. */
export function getRealtimeEventTranscript(event: unknown): { role: 'user' | 'assistant'; text: string; isFinal: boolean } | null {
  if (!event || typeof event !== 'object') return null;
  const record = event as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : '';

  if (type === 'conversation.item.input_audio_transcription.completed') {
    const text = typeof record.transcript === 'string' ? record.transcript : '';
    return text ? { role: 'user', text, isFinal: true } : null;
  }

  if (type === 'response.audio_transcript.delta') {
    const text = typeof record.delta === 'string' ? record.delta : '';
    return text ? { role: 'assistant', text, isFinal: false } : null;
  }

  if (type === 'response.audio_transcript.done') {
    const text = typeof record.transcript === 'string' ? record.transcript : '';
    return text ? { role: 'assistant', text, isFinal: true } : null;
  }

  if (type === 'response.text.delta') {
    const text = typeof record.delta === 'string' ? record.delta : '';
    return text ? { role: 'assistant', text, isFinal: false } : null;
  }

  if (type === 'response.text.done') {
    const text = typeof record.text === 'string' ? record.text : '';
    return text ? { role: 'assistant', text, isFinal: true } : null;
  }

  return null;
}
