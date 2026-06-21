import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildUploadedFileMessage,
  uploadFileForConversation,
  type ChatUploadResponse,
} from '../uploadClient';

function makeFile() {
  return new File(['dummy'], 'order.pdf', { type: 'application/pdf' });
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('uploadClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns successful upload data only when readable extracted text exists', async () => {
    const payload: ChatUploadResponse = {
      ok: true,
      fileId: 'file-1',
      filename: 'order.pdf',
      extractedText: 'Readable court order text.',
      extractionMethod: 'text',
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(payload));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFileForConversation(makeFile(), 'conversation-1')).resolves.toMatchObject(payload);
    expect(fetchMock).toHaveBeenCalledWith('/api/upload', expect.objectContaining({ method: 'POST' }));
  });

  it('rejects a primary upload response with empty extracted text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      filename: 'order.pdf',
      extractedText: '   ',
    })));

    await expect(uploadFileForConversation(makeFile(), 'conversation-1'))
      .rejects.toThrow(/^The file uploaded, but NEXX could not read any text from it yet\.$/);
  });

  it('falls back after an upload transport failure and marks the result partial', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        filename: 'order.pdf',
        extractedText: 'Fallback extracted text.',
        extractionMethod: 'ocr',
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFileForConversation(makeFile(), 'conversation-1')).resolves.toMatchObject({
      partial: true,
      extractedText: 'Fallback extracted text.',
      indexingError: 'Failed to fetch',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/analyze-document?extractOnly=1',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('falls back after a 500 response and preserves indexing context', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: 'provider unavailable' }, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        filename: 'order.pdf',
        extractedText: 'Fallback text after 500.',
      }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFileForConversation(makeFile(), 'conversation-1')).resolves.toMatchObject({
      partial: true,
      extractedText: 'Fallback text after 500.',
      indexingError: 'provider unavailable',
    });
  });

  it('combines upload and fallback failures when both requests fail', async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse({ ok: false, error: 'Fallback unavailable' }, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadFileForConversation(makeFile(), 'conversation-1'))
      .rejects.toThrow(
        'NEXX could not reach the upload service or fallback extractor. Upload error: Failed to fetch. Fallback error: Fallback unavailable.',
      );
  });

  it('builds a chat message with extracted text and non-conflicting indexing notes', () => {
    const message = buildUploadedFileMessage('Analyze this order', makeFile(), {
      fileId: 'file-1',
      filename: 'order.pdf',
      extractedText: 'Court order body',
      extractionMethod: 'ocr',
      pagesOcrProcessed: 1,
      pagesTotal: 2,
      indexingError: 'Vector store timed out',
      extractionError: 'OCR confidence warning',
    });

    expect(message).toContain('Uploaded document: order.pdf');
    expect(message).toContain('File ID: file-1');
    expect(message).toContain('Extraction method: OCR (1 of 2 pages)');
    expect(message).toContain('Extracted text preview:');
    expect(message).toContain('Court order body');
    expect(message).toContain('file search may not be available');
    expect(message).toContain('Indexing note: file-search indexing did not finish');
    expect(message).not.toContain('was still uploaded and indexed');
  });
});
