import { describe, expect, it } from 'vitest';
import { looksLikeInternalStructuredPayload, sanitizeVisibleAssistantContent } from '../internalLeakGuard';

describe('looksLikeInternalStructuredPayload', () => {
  it('detects internal source metadata inside JSON payloads and fragments', () => {
    expect(looksLikeInternalStructuredPayload('{"documentAnswer":{"citations":[{"sourceId":"src_005"}]}}')).toBe(true);
    expect(looksLikeInternalStructuredPayload('{"pageStart":-3,"quotedText":"Sensitive excerpt"}')).toBe(true);
    expect(looksLikeInternalStructuredPayload('"chunkId":null')).toBe(true);
    expect(looksLikeInternalStructuredPayload('{"blockIds":true}')).toBe(true);
    expect(looksLikeInternalStructuredPayload('Signed Final Order.pdf (src_001): "quoted text"')).toBe(true);
    expect(looksLikeInternalStructuredPayload('sourceId: src_005')).toBe(true);
  });

  it('does not flag loose quoted key prose or safe citation text', () => {
    expect(looksLikeInternalStructuredPayload('Do not print `"pageStart":` in polished answers.')).toBe(false);
    expect(looksLikeInternalStructuredPayload('The order says possession begins Friday. [p. 5]')).toBe(false);
    expect(looksLikeInternalStructuredPayload('filename: Final Order.pdf')).toBe(false);
    expect(looksLikeInternalStructuredPayload('quotedText: is an internal field name we should avoid.')).toBe(false);
  });

  it('treats malformed JSON fragments with internal keys as unsafe', () => {
    expect(looksLikeInternalStructuredPayload('{"pageStart":-not-a-number}')).toBe(true);
    expect(looksLikeInternalStructuredPayload('{"sourceId":truthful}')).toBe(true);
    expect(looksLikeInternalStructuredPayload('{"quotedText":nullish}')).toBe(true);
    expect(looksLikeInternalStructuredPayload('quotedText: copied excerpt,\nchunkId: abc123')).toBe(true);
  });

  it('strips legacy source markdown while preserving the answer body', () => {
    const sanitized = sanitizeVisibleAssistantContent([
      "The verified order text says Father's Day possession begins Friday. [p. 5]",
      '',
      'Sources',
      '',
      'Signed Final Order.pdf, p. 5 (src_009): "Father\'s Day..."',
      '',
      'Warnings',
      'src_009: PAGE_BOUNDARIES_UNAVAILABLE',
    ].join('\n'));

    expect(sanitized).toBe('The verified order text says Father\'s Day possession begins Friday. [p. 5]');
  });

  it('strips legacy source markdown with colon headings', () => {
    const sanitized = sanitizeVisibleAssistantContent([
      'The order requires notice within 14 days. [p. 2]',
      '',
      'Sources:',
      '',
      'Signed Final Order.pdf, p. 2 (src_002): "notice language"',
    ].join('\n'));

    expect(sanitized).toBe('The order requires notice within 14 days. [p. 2]');
  });

  it('preserves clean source sections without internal metadata', () => {
    const sanitized = sanitizeVisibleAssistantContent([
      'The order requires notice within 14 days. [p. 2]',
      '',
      'Sources',
      '',
      'Signed Final Order.pdf, p. 2: "notice language"',
    ].join('\n'));

    expect(sanitized).toContain('Sources');
    expect(sanitized).toContain('Signed Final Order.pdf, p. 2');
    expect(sanitized).not.toMatch(/\b(chunk|retrieval|verifier|confidence|OCR|extraction|source packet|memoryGenerationId)\b/i);
    expect(sanitized).not.toContain('src_');
  });

  it('drops legacy source-id bullet lines even without a source heading', () => {
    const sanitized = sanitizeVisibleAssistantContent([
      'The order says Father\'s Day possession begins Friday. [p. 5]',
      'Signed Final Order.pdf, p. 5 (src_009): "Father\'s Day begins Friday."',
    ].join('\n'));

    expect(sanitized).toBe('The order says Father\'s Day possession begins Friday. [p. 5]');
  });

  it('preserves prose around bare legacy source ids without showing the id', () => {
    const sanitized = sanitizeVisibleAssistantContent('The old source marker src_009 should not be shown.');

    expect(sanitized).toBe('The old source marker source reference should not be shown.');
  });

  it('withholds raw structured payloads instead of sanitizing them into visible text', () => {
    expect(sanitizeVisibleAssistantContent('{"documentAnswer":{"citations":[{"sourceId":"src_005"}]}}')).toBeNull();
  });
});
