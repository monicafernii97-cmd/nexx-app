import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  extractPdfTextWithMistralOcr,
  getMistralOcrConfig,
  isMistralOcrConfigured,
  shouldTryMistralOcrForPdf,
} from '../mistralOcr';

const ENV_KEYS = [
  'MISTRAL_OCR_ENABLED',
  'MISTRAL_API_KEY',
  'MISTRAL_OCR_MODEL',
  'MISTRAL_OCR_ENDPOINT',
  'MISTRAL_OCR_TIMEOUT_MS',
  'MISTRAL_OCR_MAX_FILE_MB',
  'LEGAL_HIGH_QUALITY_PROCESSING',
] as const;

describe('mistralOcr', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    for (const key of ENV_KEYS) vi.stubEnv(key, '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps OCR 4 disabled unless both flag and API key are present', () => {
    expect(isMistralOcrConfigured(getMistralOcrConfig())).toBe(false);

    vi.stubEnv('MISTRAL_OCR_ENABLED', 'true');
    expect(isMistralOcrConfigured(getMistralOcrConfig())).toBe(false);

    vi.stubEnv('MISTRAL_API_KEY', 'test-key');
    expect(isMistralOcrConfigured(getMistralOcrConfig())).toBe(true);
  });

  it('uses OCR 4 for weak/parser-failed PDFs and legal high-quality native PDFs', () => {
    vi.stubEnv('MISTRAL_OCR_ENABLED', 'true');
    vi.stubEnv('MISTRAL_API_KEY', 'test-key');
    expect(shouldTryMistralOcrForPdf({ nativeTextLength: 10 })).toBe(true);
    expect(shouldTryMistralOcrForPdf({ parserFailed: true })).toBe(true);

    expect(shouldTryMistralOcrForPdf({ nativeTextLength: 500, nativeSucceeded: true })).toBe(false);
    vi.stubEnv('LEGAL_HIGH_QUALITY_PROCESSING', 'true');
    expect(shouldTryMistralOcrForPdf({ nativeTextLength: 500, nativeSucceeded: true })).toBe(true);
  });

  it('posts PDFs through the stateless base64 OCR path with structure options', async () => {
    vi.stubEnv('MISTRAL_OCR_ENABLED', 'true');
    vi.stubEnv('MISTRAL_API_KEY', 'test-key');
    vi.stubEnv('MISTRAL_OCR_ENDPOINT', 'https://mistral.test/v1/ocr');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'x-request-id': 'req-123' }),
      json: async () => ({
        model: 'mistral-ocr-4-0',
        pages: [
          {
            index: 0,
            markdown: '# Final Order\nFather shall pay support by Friday.',
            confidence_scores: {
              average_page_confidence_score: 0.97,
              minimum_page_confidence_score: 0.94,
            },
            blocks: [{ type: 'title' }, { type: 'text' }],
            tables: [{ html: '<table><tr><td>Support</td></tr></table>' }],
          },
          {
            index: 1,
            markdown: 'Signed by the Court.',
            confidence_scores: {
              average_page_confidence_score: 0.93,
              minimum_page_confidence_score: 0.88,
            },
            blocks: [{ type: 'signature' }],
          },
        ],
        usage_info: {
          pages_processed: 2,
          doc_size_bytes: 1024,
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await extractPdfTextWithMistralOcr({
      buffer: Buffer.from('%PDF-1.7\nbody'),
      filename: 'order.pdf',
      mimeType: 'application/octet-stream',
    });

    expect(result.text).toContain('[Page 1]');
    expect(result.text).toContain('Father shall pay support by Friday.');
    expect(result.method).toBe('mistral_ocr_4');
    expect(result.ocrProvider).toBe('mistral');
    expect(result.ocrRequestMode).toBe('base64_stateless');
    expect(result.pagesOcrProcessed).toBe(2);
    expect(result.ocrAverageConfidence).toBeCloseTo(0.95);
    expect(result.ocrMinConfidence).toBe(0.88);
    expect(result.ocrBlocksDetected).toBe(3);
    expect(result.ocrTablesDetected).toBe(1);
    expect(result.estimatedOcrCostUsd).toBe(0.008);
    expect(result.ocrProviderRequestId).toBe('req-123');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mistral.test/v1/ocr');
    expect(init.headers.Authorization).toBe('Bearer test-key');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('mistral-ocr-4-0');
    expect(body.include_blocks).toBe(true);
    expect(body.table_format).toBe('html');
    expect(body.extract_header).toBe(true);
    expect(body.extract_footer).toBe(true);
    expect(body.confidence_scores_granularity).toBe('page');
    expect(body.document).toMatchObject({
      type: 'document_url',
    });
    expect(body.document.document_url).toMatch(/^data:application\/pdf;base64,/);
  });

  it('returns a safe provider failure without leaking provider response bodies', async () => {
    vi.stubEnv('MISTRAL_OCR_ENABLED', 'true');
    vi.stubEnv('MISTRAL_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers({ 'x-request-id': 'req-failed' }),
      text: async () => 'provider stack trace: secret-token',
      json: async () => ({ detail: 'secret-token' }),
    }));

    const result = await extractPdfTextWithMistralOcr({
      buffer: Buffer.from('%PDF-1.7\nbody'),
      filename: 'order.pdf',
      mimeType: 'application/pdf',
    });

    expect(result.text).toBeUndefined();
    expect(result.error).toBe('Mistral OCR 4 failed with HTTP 503.');
    expect(result.error).not.toContain('secret-token');
    expect(result.errorCode).toBe('WORKER_UNAVAILABLE');
    expect(result.ocrProviderRequestId).toBe('req-failed');
    expect(result.warnings).toContain('MISTRAL_OCR_PROVIDER_FAILED');
  });
});
