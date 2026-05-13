import { describe, expect, it } from 'vitest';
import {
  buildRealtimeInstructions,
  contentTypeForTTSFormat,
  getRealtimeEventTranscript,
  isSupportedTranscriptionMimeType,
  isVoiceMode,
  normalizeTTSFormat,
  normalizeTTSSpeed,
  normalizeVoiceName,
  validateTTSText,
} from '../helpers';

describe('voice helpers', () => {
  it('validates voice modes', () => {
    expect(isVoiceMode('chat')).toBe(true);
    expect(isVoiceMode('incident_report')).toBe(true);
    expect(isVoiceMode('unknown')).toBe(false);
  });

  it('builds mode instructions with optional custom guidance', () => {
    const instructions = buildRealtimeInstructions('judge_lens', 'Focus on evidentiary clarity.');
    expect(instructions).toContain('judge-lens');
    expect(instructions).toContain('Focus on evidentiary clarity.');
  });

  it('normalizes TTS options safely', () => {
    expect(normalizeTTSFormat('wav')).toBe('wav');
    expect(normalizeTTSFormat('bad')).toBe('mp3');
    expect(normalizeVoiceName('cedar')).toBe('cedar');
    expect(normalizeVoiceName('bad')).toBe('marin');
    expect(normalizeTTSSpeed(9)).toBe(4);
    expect(normalizeTTSSpeed(0.1)).toBe(0.25);
  });

  it('validates TTS text bounds', () => {
    expect(validateTTSText(' Read this. ')).toBe('Read this.');
    expect(() => validateTTSText('')).toThrow('Text is required.');
  });

  it('maps TTS content types', () => {
    expect(contentTypeForTTSFormat('mp3')).toBe('audio/mpeg');
    expect(contentTypeForTTSFormat('wav')).toBe('audio/wav');
  });

  it('recognizes supported transcription MIME types', () => {
    expect(isSupportedTranscriptionMimeType('audio/webm')).toBe(true);
    expect(isSupportedTranscriptionMimeType('application/pdf')).toBe(false);
  });

  it('extracts transcript fragments from realtime events', () => {
    expect(getRealtimeEventTranscript({
      type: 'conversation.item.input_audio_transcription.completed',
      transcript: 'Hello',
    })).toEqual({ role: 'user', text: 'Hello', isFinal: true });

    expect(getRealtimeEventTranscript({
      type: 'response.audio_transcript.delta',
      delta: 'Hi',
    })).toEqual({ role: 'assistant', text: 'Hi', isFinal: false });
  });
});
