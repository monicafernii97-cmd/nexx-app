import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const responsesCreate = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: responsesCreate };
  },
}));

async function docxWithTableAndImage() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<Types/>');
  zip.file('word/document.xml', [
    '<w:document><w:body>',
    '<w:p><w:r><w:t>ORDERED parenting terms</w:t></w:r></w:p>',
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Holiday</w:t></w:r></w:p></w:tc>',
    '<w:tc><w:p><w:r><w:t>Father’s Day</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    '</w:body></w:document>',
  ].join(''));
  zip.file('word/media/scan1.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]));
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new File([Uint8Array.from(bytes).buffer as ArrayBuffer], 'order.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

describe('DOCX embedded content extraction', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    responsesCreate.mockResolvedValue({ output_text: 'Embedded scan: exchange begins Friday at 6:00 p.m.' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('preserves tables and OCRs every embedded image into canonical source units', async () => {
    const file = await docxWithTableAndImage();

    const { extractDocumentText } = await import('../documentExtraction');
    const result = await extractDocumentText(file);

    expect(result.method).toBe('docx_structured');
    expect(result.text).toContain('Holiday');
    expect(result.text).toContain('Father’s Day');
    expect(result.text).toContain('Embedded scan: exchange begins Friday at 6:00 p.m.');
    expect(responsesCreate).toHaveBeenCalledTimes(1);
    expect(result.sourceUnits?.filter((unit) => unit.ocrApplied)).toHaveLength(1);
    expect(result.coverage?.status).toBe('complete');
  });

  it('fails coverage closed instead of sending embedded images when privacy policy blocks OpenAI OCR', async () => {
    const file = await docxWithTableAndImage();
    const { extractDocumentText } = await import('../documentExtraction');
    const result = await extractDocumentText(file, { allowOpenAiOcr: false });

    expect(result.text).toContain('ORDERED parenting terms');
    expect(result.text).not.toContain('Embedded scan');
    expect(responsesCreate).not.toHaveBeenCalled();
    expect(result.sourceUnits?.at(-1)).toMatchObject({ status: 'omitted', ocrApplied: false });
    expect(result.sourceUnits?.at(-1)?.warnings).toContain('IMAGE_OCR_BLOCKED_BY_PRIVACY_POLICY');
    expect(result.coverage?.status).toBe('partial');
  });
});
