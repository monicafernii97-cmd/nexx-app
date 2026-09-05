import { describe, expect, it } from 'vitest';
import {
  ProviderStreamLifecycleError,
  classifyProviderStreamTerminal,
  streamTerminalError,
} from '../provider/streamLifecycle';

describe('provider stream lifecycle', () => {
  it('classifies an iterator that ends after deltas without a terminal event as retryable interruption', () => {
    const terminal = classifyProviderStreamTerminal({
      responseId: 'resp_live_incident',
      text: '{"message":"partial',
      elapsedMs: 120_000,
      lastEventType: 'response.output_text.delta',
    });

    expect(terminal).toEqual({
      kind: 'interrupted',
      responseId: 'resp_live_incident',
      lastEventType: 'response.output_text.delta',
      text: '{"message":"partial',
      elapsedMs: 120_000,
    });
    const error = streamTerminalError(terminal);
    expect(error).toBeInstanceOf(ProviderStreamLifecycleError);
    expect(error).toMatchObject({ code: 'provider_stream_interrupted', retryable: true });
  });

  it('retains a response id captured before completion', () => {
    expect(classifyProviderStreamTerminal({
      responseId: 'resp_123',
      text: 'done',
      elapsedMs: 500,
      lastEventType: 'response.completed',
      terminalEvent: 'completed',
    })).toEqual({ kind: 'completed', responseId: 'resp_123', text: 'done' });
  });

  it('classifies an absolute deadline separately from an unexplained interruption', () => {
    const terminal = classifyProviderStreamTerminal({
      text: '',
      elapsedMs: 65_001,
      deadlineExceeded: true,
    });
    expect(streamTerminalError(terminal)).toMatchObject({
      code: 'provider_stream_timeout',
      retryable: true,
    });
  });

  it('keeps provider-declared incomplete reasons available for continuation policy', () => {
    const terminal = classifyProviderStreamTerminal({
      responseId: 'resp_incomplete',
      text: 'partial',
      elapsedMs: 4_000,
      terminalEvent: 'incomplete',
      incompleteReason: 'max_output_tokens',
    });
    expect(streamTerminalError(terminal)).toMatchObject({
      code: 'provider_output_incomplete',
      retryable: true,
      incompleteReason: 'max_output_tokens',
    });
  });
});
