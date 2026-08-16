import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getText: vi.fn(),
  getScreenshot: vi.fn(),
  responsesCreate: vi.fn(),
  ensurePdfRuntimeReady: vi.fn(),
}));

vi.mock('pdf-parse', () => ({
  PDFParse: class MockPdfParse {
    getText = mocks.getText;
    getScreenshot = mocks.getScreenshot;
  },
}));

vi.mock('../pdfRuntime', () => ({
  ensurePdfRuntimeReady: mocks.ensurePdfRuntimeReady,
  isPdfRuntimeError: () => false,
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: mocks.responsesCreate };
    files = { create: vi.fn(), delete: vi.fn() };
  },
}));

function pdfFile() {
  return new File([Buffer.from('%PDF-1.7\nbody')], 'order.pdf', { type: 'application/pdf' });
}

function nativePageText(label: string) {
  return `${label} ${'controlling legal provision '.repeat(3)}`;
}

describe('PDF page coverage extraction', () => {
  beforeEach(() => {
    vi.stubEnv('MISTRAL_OCR_ENABLED', 'false');
    vi.stubEnv('MISTRAL_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    mocks.ensurePdfRuntimeReady.mockResolvedValue(undefined);
    mocks.responsesCreate.mockResolvedValue({ output_text: 'OCR recovered provision.' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('retains every selectable PDF page as a real source page', async () => {
    mocks.getText.mockResolvedValue({
      total: 3,
      text: 'combined',
      pages: [
        { num: 1, text: nativePageText('Beginning') },
        { num: 2, text: nativePageText('Middle') },
        { num: 3, text: nativePageText('Ending') },
      ],
    });

    const { extractDocumentText } = await import('../documentExtraction');
    const result = await extractDocumentText(pdfFile());

    expect(result.method).toBe('pdf_text');
    expect(result.pages?.map((page) => page.pageNumber)).toEqual([1, 2, 3]);
    expect(result.pages?.every((page) => page.canonicalSource === 'native')).toBe(true);
    expect(result.coverage).toMatchObject({ expectedUnits: 3, succeededUnits: 3, status: 'complete' });
    expect(mocks.responsesCreate).not.toHaveBeenCalled();
  });

  it('OCRs a weak middle page and merges it back into exact page order', async () => {
    mocks.getText.mockResolvedValue({
      total: 3,
      text: 'combined',
      pages: [
        { num: 1, text: nativePageText('Beginning') },
        { num: 2, text: '' },
        { num: 3, text: nativePageText('Ending') },
      ],
    });
    mocks.getScreenshot.mockImplementation(async ({ partial }: { partial: number[] }) => ({
      total: 3,
      pages: partial.map((pageNumber) => ({
        pageNumber,
        dataUrl: `data:image/png;base64,page-${pageNumber}`,
        width: 1400,
        height: 1800,
      })),
    }));

    const { extractDocumentText } = await import('../documentExtraction');
    const result = await extractDocumentText(pdfFile());

    expect(result.method).toBe('pdf_hybrid');
    expect(mocks.getScreenshot).toHaveBeenCalledWith(expect.objectContaining({ partial: [2] }));
    expect(result.pages?.map((page) => [page.pageNumber, page.canonicalSource])).toEqual([
      [1, 'native'],
      [2, 'ocr'],
      [3, 'native'],
    ]);
    expect(result.coverage?.status).toBe('complete');
  });

  it('has no eight-page OCR ceiling and accounts for all requested pages', async () => {
    mocks.getText.mockResolvedValue({
      total: 62,
      text: '',
      pages: Array.from({ length: 62 }, (_, index) => ({ num: index + 1, text: '' })),
    });
    mocks.getScreenshot.mockImplementation(async ({ partial }: { partial: number[] }) => ({
      total: 62,
      pages: partial.map((pageNumber) => ({
        pageNumber,
        dataUrl: `data:image/png;base64,page-${pageNumber}`,
        width: 1400,
        height: 1800,
      })),
    }));

    const { extractDocumentText } = await import('../documentExtraction');
    const result = await extractDocumentText(pdfFile());

    const requestedPages = mocks.getScreenshot.mock.calls.flatMap(([request]) => request.partial);
    expect(requestedPages).toEqual(Array.from({ length: 62 }, (_, index) => index + 1));
    expect(mocks.responsesCreate).toHaveBeenCalledTimes(62);
    expect(result.pages).toHaveLength(62);
    expect(result.pages?.at(-1)?.pageNumber).toBe(62);
    expect(result.coverage).toMatchObject({ expectedUnits: 62, attemptedUnits: 62, status: 'complete' });
  });

  it('never discards short native text when OCR cannot confirm it', async () => {
    mocks.getText.mockResolvedValue({
      total: 3,
      text: 'combined',
      pages: [
        { num: 1, text: nativePageText('Beginning') },
        { num: 2, text: 'Judge Presiding' },
        { num: 3, text: nativePageText('Ending') },
      ],
    });
    mocks.getScreenshot.mockImplementation(async ({ partial }: { partial: number[] }) => ({
      total: 3,
      pages: partial.map((pageNumber) => ({
        pageNumber,
        dataUrl: `data:image/png;base64,page-${pageNumber}`,
        width: 1400,
        height: 1800,
      })),
    }));
    mocks.responsesCreate.mockResolvedValue({ output_text: '[NO_READABLE_TEXT]' });

    const { extractDocumentText } = await import('../documentExtraction');
    const result = await extractDocumentText(pdfFile());

    expect(result.pages?.[1]).toMatchObject({
      canonicalText: 'Judge Presiding',
      nativeText: 'Judge Presiding',
      canonicalSource: 'hybrid',
      status: 'low_confidence',
    });
    expect(result.pages?.[1].warnings).toContain('SHORT_NATIVE_TEXT_NOT_CONFIRMED_BY_OCR');
    expect(result.coverage?.status).toBe('partial');
  });
});
