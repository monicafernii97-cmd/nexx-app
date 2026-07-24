import { describe, expect, it } from 'vitest';
import {
  plainTextAssistantResponse,
  reasoningEffortForRoute,
  usesPlainTextResponse,
} from '../responseTransport';

describe('chat response transport policy', () => {
  it('uses plain text for natural conversation and structured output for legal document work', () => {
    expect(usesPlainTextResponse('adaptive_chat')).toBe(true);
    expect(usesPlainTextResponse('party_message_draft')).toBe(true);
    expect(usesPlainTextResponse('order_interpretation')).toBe(false);
  });

  it('uses at least medium reasoning for chat and high effort for complex relational work', () => {
    expect(reasoningEffortForRoute('adaptive_chat')).toBe('medium');
    expect(reasoningEffortForRoute('pattern_analysis')).toBe('high');
    expect(reasoningEffortForRoute('document_analysis')).toBe('high');
  });

  it('wraps plain text in a safe empty artifact envelope', () => {
    const response = plainTextAssistantResponse('Direct answer.');
    expect(response.message).toBe('Direct answer.');
    expect(response.documentAnswer).toBeNull();
    expect(response.artifacts.draftReady).toBeNull();
  });
});
