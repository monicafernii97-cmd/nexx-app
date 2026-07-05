import { describe, expect, it } from 'vitest';
import { looksLikeInternalStructuredPayload } from '../internalLeakGuard';

describe('looksLikeInternalStructuredPayload', () => {
  it('detects internal source metadata inside JSON payloads and fragments', () => {
    expect(looksLikeInternalStructuredPayload('{"documentAnswer":{"citations":[{"sourceId":"src_005"}]}}')).toBe(true);
    expect(looksLikeInternalStructuredPayload('{"pageStart":-3,"quotedText":"Sensitive excerpt"}')).toBe(true);
    expect(looksLikeInternalStructuredPayload('"chunkId":null')).toBe(true);
    expect(looksLikeInternalStructuredPayload('{"blockIds":true}')).toBe(true);
  });

  it('does not flag loose quoted key prose or invalid JSON-ish literals', () => {
    expect(looksLikeInternalStructuredPayload('Do not print `"pageStart":` in polished answers.')).toBe(false);
    expect(looksLikeInternalStructuredPayload('{"pageStart":-not-a-number}')).toBe(false);
    expect(looksLikeInternalStructuredPayload('{"sourceId":truthful}')).toBe(false);
    expect(looksLikeInternalStructuredPayload('{"quotedText":nullish}')).toBe(false);
  });
});
