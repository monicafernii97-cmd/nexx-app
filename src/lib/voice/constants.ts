import type { TTSFormat, VoiceModeOption, VoiceName } from './types';

export const VOICE_MODE_OPTIONS: VoiceModeOption[] = [
  {
    id: 'chat',
    label: 'Chat',
    description: 'Open-ended supportive conversation.',
  },
  {
    id: 'draft',
    label: 'Draft',
    description: 'Capture language for future drafting workflows.',
  },
  {
    id: 'incident_report',
    label: 'Incident Report',
    description: 'Collect a structured incident narrative without saving it yet.',
  },
  {
    id: 'judge_lens',
    label: 'Judge Lens',
    description: 'Explore how a court might hear the facts.',
  },
];

export const DEFAULT_REALTIME_MODEL = 'gpt-realtime';
export const DEFAULT_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';
export const DEFAULT_TTS_MODEL = 'gpt-4o-mini-tts';
export const DEFAULT_TTS_VOICE: VoiceName = 'marin';
export const DEFAULT_TTS_FORMAT: TTSFormat = 'mp3';

export const MAX_TRANSCRIPTION_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_TTS_CHARS = 4096;

export const SUPPORTED_TRANSCRIPTION_MIME_TYPES = [
  'audio/aac',
  'audio/flac',
  'audio/m4a',
  'audio/mp3',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'video/mp4',
] as const;

export const SUPPORTED_TTS_FORMATS = ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'] as const;

export const SUPPORTED_TTS_VOICES = [
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'onyx',
  'nova',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
] as const;
