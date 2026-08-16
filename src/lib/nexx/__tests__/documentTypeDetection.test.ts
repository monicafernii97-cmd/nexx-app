import { describe, expect, it } from 'vitest';
import { detectDocumentType } from '../documentTypeDetection';

function makeZip(entries: string[]) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    localParts.push(local);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centralParts.push(central);
    offset += local.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(centralDirectoryOffset, 16);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

function writeUtf16Name(entry: Buffer, name: string) {
  const encoded = Buffer.from(`${name}\0`, 'utf16le');
  encoded.copy(entry, 0);
  entry.writeUInt16LE(encoded.length, 64);
}

function makeCfbWithStreams(streams: string[]) {
  const sectorSize = 512;
  const header = Buffer.alloc(sectorSize);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(9, 30);
  header.writeInt32LE(0, 48);

  const directory = Buffer.alloc(sectorSize);
  streams.slice(0, 4).forEach((stream, index) => {
    writeUtf16Name(directory.subarray(index * 128, index * 128 + 128), stream);
  });

  return Buffer.concat([header, directory]);
}

describe('detectDocumentType', () => {
  it('accepts real PDFs by magic number', () => {
    const result = detectDocumentType(Buffer.from('%PDF-1.7\nbody'), { filename: 'order.pdf' });
    expect(result).toMatchObject({ ok: true, detectedType: 'pdf' });
  });

  it('rejects PDFs with active JavaScript actions', () => {
    const result = detectDocumentType(Buffer.from('%PDF-1.7\n/OpenAction << /S /JavaScript >>'), { filename: 'active.pdf' });
    expect(result).toMatchObject({ ok: false, detectedType: 'pdf', errorCode: 'UNSAFE_ACTIVE_CONTENT' });
  });

  it('isolates executable and standard antivirus test signatures before parsing', () => {
    expect(detectDocumentType(Buffer.from('MZ executable'), { filename: 'renamed.pdf' })).toMatchObject({ ok: false, errorCode: 'MALWARE_SCAN_FAILED' });
    expect(detectDocumentType(Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'), { filename: 'note.txt' })).toMatchObject({ ok: false, errorCode: 'MALWARE_SCAN_FAILED' });
  });

  it('detects document images by magic bytes rather than extension', () => {
    const result = detectDocumentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), { filename: 'scan.png', mimeType: 'application/octet-stream' });
    expect(result).toMatchObject({ ok: true, detectedType: 'image' });
  });

  it('detects PPTX, XLSX, and ODT containers by internal parts', () => {
    expect(detectDocumentType(makeZip(['[Content_Types].xml', 'ppt/slides/slide1.xml']))).toMatchObject({ ok: true, detectedType: 'pptx' });
    expect(detectDocumentType(makeZip(['[Content_Types].xml', 'xl/worksheets/sheet1.xml']))).toMatchObject({ ok: true, detectedType: 'xlsx' });
    expect(detectDocumentType(makeZip(['META-INF/manifest.xml', 'content.xml']))).toMatchObject({ ok: true, detectedType: 'odt' });
  });

  it('rejects unsafe executable payloads inside document containers', () => {
    const result = detectDocumentType(makeZip(['[Content_Types].xml', 'word/document.xml', 'word/media/payload.exe']));
    expect(result).toMatchObject({ ok: false, errorCode: 'UNSAFE_ACTIVE_CONTENT' });
  });

  it('accepts safe text-family formats and rejects embedded RTF objects', () => {
    expect(detectDocumentType(Buffer.from('a,b\n1,2'), { filename: 'data.csv', mimeType: 'text/csv' })).toMatchObject({ ok: true, detectedType: 'csv' });
    expect(detectDocumentType(Buffer.from('<html><body>Order</body></html>'), { filename: 'order.html', mimeType: 'text/html' })).toMatchObject({ ok: true, detectedType: 'html' });
    expect(detectDocumentType(Buffer.from('{\\rtf1 plain text}'), { filename: 'order.rtf' })).toMatchObject({ ok: true, detectedType: 'rtf' });
    expect(detectDocumentType(Buffer.from('{\\rtf1 \\object unsafe}'), { filename: 'unsafe.rtf' })).toMatchObject({ ok: false, errorCode: 'UNSAFE_ACTIVE_CONTENT' });
  });

  it('accepts macro-free DOCX packages', () => {
    const result = detectDocumentType(makeZip(['[Content_Types].xml', 'word/document.xml']), {
      filename: 'order.docx',
    });
    expect(result).toMatchObject({ ok: true, detectedType: 'docx' });
  });

  it('rejects macro-bearing DOCX packages', () => {
    const result = detectDocumentType(makeZip(['[Content_Types].xml', 'word/document.xml', 'word/vbaProject.bin']), {
      filename: 'order.docx',
    });
    expect(result).toMatchObject({
      ok: false,
      detectedType: 'docx',
      errorCode: 'MACRO_ENABLED_UNSUPPORTED',
    });
  });

  it('detects Google Docs shortcut pointers', () => {
    const result = detectDocumentType(Buffer.from('{"url":"https://docs.google.com/document/d/example"}'), {
      filename: 'order.gdoc',
    });
    expect(result).toMatchObject({
      ok: false,
      detectedType: 'gdoc_pointer',
      errorCode: 'GDOC_POINTER_UNSUPPORTED',
    });
  });

  it('accepts UTF-8 text files', () => {
    const result = detectDocumentType(Buffer.from('Court order paragraph with readable text.'), {
      filename: 'document.txt',
      mimeType: 'text/plain',
    });
    expect(result).toMatchObject({ ok: true, detectedType: 'txt' });
  });

  it('warns when DOCX comments are present', () => {
    const result = detectDocumentType(makeZip(['[Content_Types].xml', 'word/document.xml', 'word/comments.xml']), {
      filename: 'order.docx',
    });
    expect(result).toMatchObject({ ok: true, detectedType: 'docx' });
    expect(result.warnings).toContain('COMMENTS_DETECTED');
  });

  it('warns when DOCX revision parts are present', () => {
    const result = detectDocumentType(makeZip(['[Content_Types].xml', 'word/document.xml', 'word/revisions/revision1.xml']), {
      filename: 'order.docx',
    });
    expect(result).toMatchObject({ ok: true, detectedType: 'docx' });
    expect(result.warnings).toContain('TRACKED_CHANGES_DETECTED');
  });

  it('accepts true legacy Word binary documents only when Word streams exist', () => {
    const result = detectDocumentType(makeCfbWithStreams(['Root Entry', 'WordDocument', '1Table']), {
      filename: 'order.doc',
      mimeType: 'application/msword',
    });
    expect(result).toMatchObject({ ok: true, detectedType: 'doc' });
  });

  it('rejects encrypted legacy Word documents', () => {
    const result = detectDocumentType(makeCfbWithStreams(['Root Entry', 'WordDocument', '1Table', 'EncryptionInfo']), {
      filename: 'locked.doc',
      mimeType: 'application/msword',
    });
    expect(result).toMatchObject({
      ok: false,
      detectedType: 'doc',
      errorCode: 'PASSWORD_PROTECTED',
    });
  });

  it('rejects non-Word OLE files renamed to .doc', () => {
    const result = detectDocumentType(makeCfbWithStreams(['Root Entry', 'Workbook']), {
      filename: 'renamed.doc',
      mimeType: 'application/msword',
    });
    expect(result).toMatchObject({
      ok: false,
      detectedType: 'unsupported',
      errorCode: 'NOT_WORD_BINARY_DOC',
    });
  });
});
