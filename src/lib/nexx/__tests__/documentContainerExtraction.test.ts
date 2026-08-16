import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { extractSimpleDocumentText, extractZipDocumentContainer } from '../documentContainerExtraction';

async function zipBuffer(entries: Record<string, string | Uint8Array>) {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  return await zip.generateAsync({ type: 'nodebuffer' });
}

describe('structured document container extraction', () => {
  it('preserves DOCX body, table cells, headers, footnotes, and embedded-image inventory', async () => {
    const buffer = await zipBuffer({
      '[Content_Types].xml': '<Types/>',
      'word/document.xml': '<w:document><w:p><w:r><w:t>ORDERED relief</w:t></w:r></w:p><w:tr><w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc></w:tr></w:document>',
      'word/header1.xml': '<w:hdr><w:p><w:r><w:t>Case 123</w:t></w:r></w:p></w:hdr>',
      'word/footnotes.xml': '<w:footnotes><w:p><w:r><w:t>Important footnote</w:t></w:r></w:p></w:footnotes>',
      'word/media/scan.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    });
    const result = await extractZipDocumentContainer(buffer, 'docx');
    expect(result.units.map((unit) => unit.text).join('\n')).toContain('ORDERED relief');
    expect(result.units.map((unit) => unit.text).join('\n')).toContain('Cell A');
    expect(result.units.map((unit) => unit.text).join('\n')).toContain('Important footnote');
    expect(result.images).toHaveLength(1);
  });

  it('extracts PPTX slides and speaker notes as separate labeled source units', async () => {
    const buffer = await zipBuffer({
      '[Content_Types].xml': '<Types/>',
      'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>Hearing date</a:t></a:r></a:p></p:sld>',
      'ppt/notesSlides/notesSlide1.xml': '<p:notes><a:p><a:r><a:t>Bring exhibit A</a:t></a:r></a:p></p:notes>',
    });
    const result = await extractZipDocumentContainer(buffer, 'pptx');
    expect(result.units[0].unitLabel).toBe('Slide 1');
    expect(result.units[0].text).toContain('Bring exhibit A');
  });

  it('preserves XLSX cell references, formulas, cached values, and shared strings', async () => {
    const buffer = await zipBuffer({
      '[Content_Types].xml': '<Types/>',
      'xl/sharedStrings.xml': '<sst><si><t>Support</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><row><c r="A1" t="s"><v>0</v></c><c r="B1"><f>SUM(B2:B3)</f><v>250</v></c></row></worksheet>',
    });
    const result = await extractZipDocumentContainer(buffer, 'xlsx');
    expect(result.units[0].text).toContain('A1: Support');
    expect(result.units[0].text).toContain('B1: =SUM(B2:B3) => 250');
  });

  it('removes executable HTML content and decodes email bodies without executing them', () => {
    expect(extractSimpleDocumentText(Buffer.from('<script>steal()</script><p>Visible order</p>'), 'html')).not.toContain('steal');
    expect(extractSimpleDocumentText(Buffer.from('Subject: Order\nContent-Transfer-Encoding: quoted-printable\n\nPay=20by=20Friday'), 'eml')).toContain('Pay by Friday');
  });
});
