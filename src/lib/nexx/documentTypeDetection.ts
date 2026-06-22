export type DetectedDocumentType = 'pdf' | 'docx' | 'doc' | 'txt' | 'gdoc_pointer' | 'unsupported';

export type ExtractionErrorCode =
  | 'UNSUPPORTED_FILE_TYPE'
  | 'GDOC_POINTER_UNSUPPORTED'
  | 'TYPE_MISMATCH'
  | 'NOT_WORD_BINARY_DOC'
  | 'MACRO_ENABLED_UNSUPPORTED'
  | 'PASSWORD_PROTECTED'
  | 'CORRUPT_FILE'
  | 'FILE_TOO_LARGE'
  | 'CONVERSION_TIMEOUT'
  | 'CONVERSION_FAILED'
  | 'EXTRACTION_EMPTY'
  | 'OCR_EMPTY'
  | 'MALWARE_SCAN_FAILED'
  | 'WORKER_UNAVAILABLE'
  | 'UNKNOWN_EXTRACTION_ERROR';

export type DocumentDetectionResult = {
  ok: boolean;
  detectedType: DetectedDocumentType;
  errorCode?: ExtractionErrorCode;
  userMessage?: string;
  internalSummary?: string;
  warnings: string[];
  zipEntries?: string[];
  oleStreams?: string[];
};

type DetectionHints = {
  filename?: string;
  mimeType?: string;
};

const PDF_MAGIC = '%PDF-';
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const MIN_MEANINGFUL_TEXT_CHARS = 1;
const MAX_TXT_CONTROL_RATIO = 0.08;

function getExtension(filename = '') {
  const dot = filename.trim().toLowerCase().lastIndexOf('.');
  return dot >= 0 ? filename.trim().toLowerCase().slice(dot + 1) : '';
}

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function startsWithAscii(bytes: Uint8Array, text: string) {
  if (bytes.length < text.length) return false;
  return text.split('').every((char, index) => bytes[index] === char.charCodeAt(0));
}

function readUtf16LeString(bytes: Uint8Array, offset: number, byteLength: number) {
  const chars: number[] = [];
  const end = Math.min(bytes.length, offset + byteLength);
  for (let index = offset; index + 1 < end; index += 2) {
    const code = bytes[index] | (bytes[index + 1] << 8);
    if (code === 0) break;
    chars.push(code);
  }
  return String.fromCharCode(...chars);
}

function listZipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.length - 0xffff - 22);

  let eocdOffset = -1;
  for (let offset = bytes.length - 22; offset >= searchStart; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0) return null;

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries: string[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < totalEntries && offset + 46 <= bytes.length; index++) {
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE) break;
    const filenameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const nameStart = offset + 46;
    const nameEnd = nameStart + filenameLength;
    if (nameEnd > bytes.length) break;
    const name = new TextDecoder().decode(bytes.slice(nameStart, nameEnd)).replace(/\\/g, '/');
    entries.push(name);
    offset = nameEnd + extraLength + commentLength;
  }

  return entries;
}

function listOleStreams(bytes: Uint8Array) {
  if (!startsWithBytes(bytes, CFB_MAGIC) || bytes.length < 512) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sectorShift = view.getUint16(30, true);
  const sectorSize = 1 << sectorShift;
  const firstDirectorySector = view.getInt32(48, true);
  if (sectorSize < 512 || firstDirectorySector < 0) return null;

  const directoryOffset = (firstDirectorySector + 1) * sectorSize;
  if (directoryOffset < 0 || directoryOffset >= bytes.length) return null;

  const streamNames: string[] = [];
  const directoryEnd = Math.min(bytes.length, directoryOffset + sectorSize * 4);
  for (let offset = directoryOffset; offset + 128 <= directoryEnd; offset += 128) {
    const nameLength = view.getUint16(offset + 64, true);
    if (nameLength < 2 || nameLength > 64) continue;
    const rawName = readUtf16LeString(bytes, offset, nameLength - 2);
    if (rawName) streamNames.push(rawName);
  }

  return streamNames;
}

function looksLikeGdocPointer(bytes: Uint8Array, hints: DetectionHints) {
  const extension = getExtension(hints.filename);
  if (extension === 'gdoc') return true;

  const preview = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 4096)).trim();
  return (
    preview.startsWith('{') &&
    preview.includes('docs.google.com') &&
    (preview.includes('"url"') || preview.includes('"doc_id"') || preview.includes('"resource_id"'))
  );
}

function isProbablyText(bytes: Uint8Array) {
  if (bytes.length < MIN_MEANINGFUL_TEXT_CHARS) return false;
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (!decoded.trim()) return false;
  let controlCount = 0;
  for (const char of decoded) {
    const code = char.charCodeAt(0);
    if (code === 0xfffd) return false;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) controlCount++;
  }
  return controlCount / decoded.length <= MAX_TXT_CONTROL_RATIO;
}

function hasMacroLikeZipEntry(entries: string[]) {
  return entries.some((entry) => {
    const lower = entry.toLowerCase();
    return lower === 'word/vbaproject.bin' || lower.endsWith('/vbaproject.bin');
  });
}

function hasMacroLikeOleStream(streams: string[]) {
  return streams.some((stream) => {
    const lower = stream.toLowerCase();
    return lower.includes('vba') || lower.includes('macros') || lower === '_vba_project';
  });
}

function detectDocx(entries: string[]): DocumentDetectionResult {
  const normalized = new Set(entries.map((entry) => entry.toLowerCase()));
  const hasContentTypes = normalized.has('[content_types].xml');
  const hasDocument = normalized.has('word/document.xml');

  if (!hasContentTypes || !hasDocument) {
    return {
      ok: false,
      detectedType: 'unsupported',
      errorCode: 'UNSUPPORTED_FILE_TYPE',
      userMessage: 'This file is not a readable DOCX document.',
      warnings: [],
      zipEntries: entries,
    };
  }

  if (hasMacroLikeZipEntry(entries)) {
    return {
      ok: false,
      detectedType: 'docx',
      errorCode: 'MACRO_ENABLED_UNSUPPORTED',
      userMessage: 'This Word file contains macros or active content, which NEXX does not process for safety. Please save a clean DOCX or PDF copy.',
      warnings: ['MACRO_CONTENT_DETECTED'],
      zipEntries: entries,
    };
  }

  const warnings: string[] = [];
  if (normalized.has('word/comments.xml')) warnings.push('COMMENTS_DETECTED');
  if ([...normalized].some((entry) => entry.startsWith('word/revisions') || entry.includes('trackedchanges'))) {
    warnings.push('TRACKED_CHANGES_DETECTED');
  }

  return { ok: true, detectedType: 'docx', warnings, zipEntries: entries };
}

function detectLegacyDoc(streams: string[]): DocumentDetectionResult {
  const normalized = new Set(streams.map((stream) => stream.toLowerCase()));
  const hasWordDocument = normalized.has('worddocument');
  const hasTableStream = normalized.has('0table') || normalized.has('1table');

  if (!hasWordDocument || !hasTableStream) {
    return {
      ok: false,
      detectedType: 'unsupported',
      errorCode: 'NOT_WORD_BINARY_DOC',
      userMessage: 'This .doc file is not a readable Microsoft Word binary document. Please re-save it as DOCX or PDF.',
      warnings: [],
      oleStreams: streams,
    };
  }

  if (normalized.has('encryptedpackage') || normalized.has('encryptioninfo')) {
    return {
      ok: false,
      detectedType: 'doc',
      errorCode: 'PASSWORD_PROTECTED',
      userMessage: 'This document is password-protected. Please upload an unlocked copy.',
      warnings: ['ENCRYPTED_DOCUMENT_DETECTED'],
      oleStreams: streams,
    };
  }

  if (hasMacroLikeOleStream(streams)) {
    return {
      ok: false,
      detectedType: 'doc',
      errorCode: 'MACRO_ENABLED_UNSUPPORTED',
      userMessage: 'This Word file contains macros or active content, which NEXX does not process for safety. Please save a clean DOCX or PDF copy.',
      warnings: ['MACRO_CONTENT_DETECTED'],
      oleStreams: streams,
    };
  }

  return {
    ok: true,
    detectedType: 'doc',
    warnings: ['LEGACY_DOC_REVIEW_RECOMMENDED'],
    oleStreams: streams,
  };
}

export function detectDocumentType(input: ArrayBuffer | Uint8Array | Buffer, hints: DetectionHints = {}): DocumentDetectionResult {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length === 0) {
    return {
      ok: false,
      detectedType: 'unsupported',
      errorCode: 'EXTRACTION_EMPTY',
      userMessage: 'The selected file is empty.',
      warnings: [],
    };
  }

  if (looksLikeGdocPointer(bytes, hints)) {
    return {
      ok: false,
      detectedType: 'gdoc_pointer',
      errorCode: 'GDOC_POINTER_UNSUPPORTED',
      userMessage: 'This looks like a Google Docs shortcut, not the document itself. Please export it as PDF, DOCX, or TXT and upload that file.',
      warnings: [],
    };
  }

  if (startsWithAscii(bytes, PDF_MAGIC)) {
    return { ok: true, detectedType: 'pdf', warnings: [] };
  }

  const zipEntries = listZipEntries(bytes);
  if (zipEntries) return detectDocx(zipEntries);

  const oleStreams = listOleStreams(bytes);
  if (oleStreams) return detectLegacyDoc(oleStreams);

  const extension = getExtension(hints.filename);
  if ((extension === 'txt' || hints.mimeType === 'text/plain') && isProbablyText(bytes)) {
    return { ok: true, detectedType: 'txt', warnings: [] };
  }

  return {
    ok: false,
    detectedType: 'unsupported',
    errorCode: 'UNSUPPORTED_FILE_TYPE',
    userMessage: 'This file type is not supported. Please upload PDF, DOCX, TXT, or a readable legacy DOC file.',
    warnings: [],
  };
}
