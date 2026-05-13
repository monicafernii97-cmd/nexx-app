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

export function isVoiceMode(value: unknown): value is VoiceMode {
  return typeof value === 'string' && (VOICE_MODES as readonly string[]).includes(value);
}

export function getVoiceModeLabel(mode: VoiceMode): string {
  return VOICE_MODE_OPTIONS.find((option) => option.id === mode)?.label ?? 'Chat';
}

export function buildRealtimeInstructions(mode: VoiceMode, customInstructions?: string): string {
  const trimmed = customInstructions?.trim();
  if (!trimmed) return MODE_INSTRUCTIONS[mode];
  return `${MODE_INSTRUCTIONS[mode]}\n\nAdditional session guidance:\n${trimmed.slice(0, 2000)}`;
}

export function isSupportedTranscriptionMimeType(mimeType: string): boolean {
  const normalized = mimeType.toLowerCase();
  return (SUPPORTED_TRANSCRIPTION_MIME_TYPES as readonly string[]).includes(normalized);
}

export function validateTranscriptionFile(file: File): string | null {
  if (file.size <= 0) return 'Audio file is empty.';
  if (file.size > MAX_TRANSCRIPTION_FILE_BYTES) return 'Audio file is too large. Maximum size is 25MB.';
  if (!isSupportedTranscriptionMimeType(file.type)) {
    return 'Unsupported audio format. Upload MP3, MP4, MPEG, MPGA, M4A, WAV, WEBM, FLAC, AAC, or OGG audio.';
  }
  return null;
}

export function normalizeTTSFormat(format: unknown): TTSFormat {
  return typeof format === 'string' && (SUPPORTED_TTS_FORMATS as readonly string[]).includes(format)
    ? (format as TTSFormat)
    : DEFAULT_TTS_FORMAT;
}

export function normalizeVoiceName(voice: unknown): VoiceName {
  return typeof voice === 'string' && (SUPPORTED_TTS_VOICES as readonly string[]).includes(voice)
    ? (voice as VoiceName)
    : DEFAULT_TTS_VOICE;
}

export function normalizeTTSSpeed(speed: unknown): number {
  if (typeof speed !== 'number' || Number.isNaN(speed)) return 1;
  return Math.min(4, Math.max(0.25, speed));
}

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

export function contentTypeForTTSFormat(format: TTSFormat): string {
  if (format === 'mp3') return 'audio/mpeg';
  if (format === 'opus') return 'audio/ogg; codecs=opus';
  if (format === 'aac') return 'audio/aac';
  if (format === 'flac') return 'audio/flac';
  if (format === 'wav') return 'audio/wav';
  return 'audio/pcm';
}

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
