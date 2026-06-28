import { describe, expect, it } from 'vitest';

import {
  estimateMistralOcrCostUsd,
  isSensitiveTelemetryKey,
  isSensitiveTelemetryValue,
  requiresZdrForClassification,
  sanitizeAuditMetadata,
  shouldFlagLowConfidenceOcr,
  summarizeProviderUsageEvents,
} from '../../../../convex/lib/documentTelemetry';

describe('documentTelemetry', () => {
  it('redacts document content, signed URLs, storage keys, and provider payloads', () => {
    const metadata = sanitizeAuditMetadata({
      routeMode: 'document_analysis',
      storageKey: 'private/storage/path.pdf',
      signedDownloadUrl: 'https://storage.example/signed?token=secret',
      extractedText: 'The confidential court order says...',
      prompt: 'Use this text to answer.',
      errorMessage: 'Provider returned HTTP 503.',
      pagesStored: 12,
    });

    expect(metadata).toMatchObject({
      routeMode: 'document_analysis',
      storageKey: '[redacted]',
      signedDownloadUrl: '[redacted]',
      extractedText: '[redacted]',
      prompt: '[redacted]',
      errorMessage: 'Provider returned HTTP 503.',
      pagesStored: 12,
    });
    expect(metadata?._redactedKeys).toContain('storageKey');
    expect(metadata?._redactedKeys).toContain('extractedText');
  });

  it('recognizes sensitive telemetry keys defensively', () => {
    expect(isSensitiveTelemetryKey('rawProviderResponseBody')).toBe(true);
    expect(isSensitiveTelemetryKey('chatContextText')).toBe(true);
    expect(isSensitiveTelemetryKey('ocrMarkdown')).toBe(true);
    expect(isSensitiveTelemetryKey('model')).toBe(false);
  });

  it('redacts sensitive values even under generic safe-looking keys', () => {
    const metadata = sanitizeAuditMetadata({
      failedReason: 'Provider returned signed URL https://storage.googleapis.com/private.pdf?token=secret',
      details: 'It is ORDERED that Respondent shall disclose confidential records.',
      category: 'provider_error',
    });

    expect(isSensitiveTelemetryValue('Bearer secret-token')).toBe(true);
    expect(metadata).toMatchObject({
      failedReason: '[redacted]',
      details: '[redacted]',
      category: 'provider_error',
    });
    expect(metadata?._redactedKeys).toContain('failedReason');
    expect(metadata?._redactedKeys).toContain('details');
  });

  it('calculates pinned OCR 4 page costs with stable precision', () => {
    expect(estimateMistralOcrCostUsd({ pagesProcessed: 2 })).toBe(0.008);
    expect(estimateMistralOcrCostUsd({ pagesProcessed: 2, annotatedPages: true })).toBe(0.01);
    expect(estimateMistralOcrCostUsd({ pagesProcessed: 0 })).toBe(0);
  });

  it('requires ZDR for sensitive legal classifications', () => {
    expect(requiresZdrForClassification('normal')).toBe(false);
    expect(requiresZdrForClassification('sensitive')).toBe(true);
    expect(requiresZdrForClassification('attorney_client')).toBe(true);
    expect(requiresZdrForClassification('sealed')).toBe(true);
  });

  it('flags low-confidence OCR but does not flag high-confidence native extraction', () => {
    expect(shouldFlagLowConfidenceOcr({
      extractor: 'mistral_ocr_4',
      minConfidence: 0.72,
      warnings: [],
    })).toBe(true);
    expect(shouldFlagLowConfidenceOcr({
      extractor: 'mistral_ocr_4',
      minConfidence: 0.96,
      warnings: [],
    })).toBe(false);
    expect(shouldFlagLowConfidenceOcr({
      extractor: 'native_pdf',
      minConfidence: 0.5,
      warnings: [],
    })).toBe(false);
  });

  it('summarizes provider usage without exposing payload contents', () => {
    const summary = summarizeProviderUsageEvents([
      {
        provider: 'mistral',
        endpoint: 'ocr',
        status: 'succeeded',
        pagesProcessed: 10,
        bytesProcessed: 1_000,
        estimatedCostUsd: 0.04,
      },
      {
        provider: 'openai',
        endpoint: 'chat',
        status: 'failed',
        inputTokens: 100,
        outputTokens: 10,
        estimatedCostUsd: 0.0023456,
      },
      {
        provider: '__proto__',
        endpoint: 'unknown',
        status: 'queued',
        estimatedCostUsd: 0,
      },
    ]);

    expect(summary.totals).toMatchObject({
      events: 3,
      succeeded: 1,
      failed: 1,
      started: 0,
      pagesProcessed: 10,
      bytesProcessed: 1_000,
      inputTokens: 100,
      outputTokens: 10,
      estimatedCostUsd: 0.042346,
    });
    expect(summary.byProvider.mistral.pagesProcessed).toBe(10);
    expect(summary.byProvider.__proto__.events).toBe(1);
    expect(summary.byEndpoint.chat.failed).toBe(1);
  });
});
