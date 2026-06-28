import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pdf-parse', () => {
  throw new Error('DOMMatrix is not defined');
});

const mocks = vi.hoisted(() => ({
  filesCreate: vi.fn(),
  filesDelete: vi.fn(),
  responsesCreate: vi.fn(),
  ensurePdfRuntimeReady: vi.fn(),
}));

vi.mock('../pdfRuntime', () => ({
  ensurePdfRuntimeReady: mocks.ensurePdfRuntimeReady,
  isPdfRuntimeError: (error: unknown) => error instanceof Error && error.name === 'PdfRuntimeError',
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    files = {
      create: mocks.filesCreate,
      delete: mocks.filesDelete,
    };

    responses = {
      create: mocks.responsesCreate,
    };
  },
}));

describe('extractDocumentText', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    mocks.ensurePdfRuntimeReady.mockResolvedValue(undefined);
    mocks.filesCreate.mockResolvedValue({ id: 'file-123' });
    mocks.filesDelete.mockResolvedValue({});
    mocks.responsesCreate.mockResolvedValue({
      output_text: 'Readable fallback court order text.',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('falls back to OpenAI PDF file extraction when local PDF parsing is unavailable', async () => {
    const { extractDocumentText } = await import('../documentExtraction');
    const pdf = new File([Buffer.from('%PDF-1.7\nbody')], 'order.pdf', {
      type: 'application/pdf',
    });

    const result = await extractDocumentText(pdf);

    expect(result.text).toBe('Readable fallback court order text.');
    expect(result.detectedType).toBe('pdf');
    expect(result.method).toBe('pdf_file_input');
    expect(result.warnings).toContain('PDF_LOCAL_TEXT_EXTRACTION_FAILED');
    expect(mocks.filesCreate).toHaveBeenCalledTimes(1);
    expect(mocks.responsesCreate).toHaveBeenCalledTimes(1);
    expect(mocks.filesDelete).toHaveBeenCalledWith('file-123', { timeout: 10_000 });
  });

  it('does not call a PDF runtime failure no selectable text when all fallbacks fail', async () => {
    mocks.ensurePdfRuntimeReady.mockRejectedValue(Object.assign(
      new Error('PDF runtime missing required globals: DOMMatrix'),
      { name: 'PdfRuntimeError', kind: 'runtime_missing_dommatrix' },
    ));
    mocks.responsesCreate.mockResolvedValue({ output_text: '' });

    const { extractDocumentText } = await import('../documentExtraction');
    const pdf = new File([Buffer.from('%PDF-1.7\nbody')], 'order.pdf', {
      type: 'application/pdf',
    });

    const result = await extractDocumentText(pdf);

    expect(result.text).toBeUndefined();
    expect(result.error).toContain('required PDF runtime dependency is missing');
    expect(result.error).toContain('not proof that your PDF has no selectable text');
    expect(result.error).not.toMatch(/^No selectable text was found/);
    expect(result.warnings).toContain('runtime_missing_dommatrix');
  });
});
