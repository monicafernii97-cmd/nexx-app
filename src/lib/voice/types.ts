export const VOICE_MODES = ['chat', 'draft', 'incident_report', 'judge_lens'] as const;

export type VoiceMode = (typeof VOICE_MODES)[number];

export interface VoiceModeOption {
  id: VoiceMode;
  label: string;
  description: string;
}

export type VoiceConnectionStatus =
  | 'idle'
  | 'requesting_microphone'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'speaking'
  | 'stopping'
  | 'error'
  | 'permission_denied';

export interface VoiceTranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
  createdAt: number;
}

export interface RealtimeSessionRequest {
  mode?: VoiceMode;
  instructions?: string;
}

export interface RealtimeSessionResponse {
  clientSecret: string;
  expiresAt: number;
  model: string;
  mode: VoiceMode;
}

export interface TranscriptionResponse {
  text: string;
  filename: string;
  mimeType: string;
  durationSeconds?: number;
}

export interface TTSRequest {
  text: string;
  voice?: VoiceName;
  format?: TTSFormat;
  speed?: number;
}

export type VoiceName =
  | 'alloy'
  | 'ash'
  | 'ballad'
  | 'coral'
  | 'echo'
  | 'fable'
  | 'onyx'
  | 'nova'
  | 'sage'
  | 'shimmer'
  | 'verse'
  | 'marin'
  | 'cedar';

export type TTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
