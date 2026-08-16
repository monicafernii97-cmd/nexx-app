export type DetectedDocumentType =
  | 'pdf' | 'docx' | 'doc' | 'txt' | 'image' | 'csv' | 'html' | 'rtf' | 'eml'
  | 'pptx' | 'xlsx' | 'odt' | 'gdoc_pointer' | 'unsupported';

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
  | 'UNSAFE_ACTIVE_CONTENT'
  | 'RESOURCE_LIMIT_EXCEEDED'
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
const MAX_ZIP_ENTRIES = 10_000;
const MAX_ZIP_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 200;

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

type ZipEntry = { name: string; compressedSize: number; uncompressedSize: number; encrypted: boolean };

function listZipEntries(bytes: Uint8Array): ZipEntry[] | null {
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
  if (totalEntries > MAX_ZIP_ENTRIES) return [];
  const entries: ZipEntry[] = [];
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
    entries.push({
      name,
      compressedSize: view.getUint32(offset + 20, true),
      uncompressedSize: view.getUint32(offset + 24, true),
      encrypted: Boolean(view.getUint16(offset + 8, true) & 0x1),
    });
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

function unsafeZipEntry(entries: string[]) {
  return entries.find((entry) => {
    const lower = entry.toLowerCase();
    return /(?:^|\/)\.\.(?:\/|$)/.test(lower) ||
      /\.(?:exe|dll|com|scr|js|jse|vbs|vbe|ps1|bat|cmd|jar|msi)$/i.test(lower);
  });
}

function validateZipEnvelope(entries: ZipEntry[]): DocumentDetectionResult | null {
  if (entries.length === 0 || entries.length > MAX_ZIP_ENTRIES) {
    return { ok: false, detectedType: 'unsupported', errorCode: 'RESOURCE_LIMIT_EXCEEDED', userMessage: 'This document container has too many entries to process safely.', warnings: ['ZIP_ENTRY_LIMIT_EXCEEDED'] };
  }
  if (entries.some((entry) => entry.encrypted)) {
    return { ok: false, detectedType: 'unsupported', errorCode: 'PASSWORD_PROTECTED', userMessage: 'This document is password-protected. Please upload an unlocked copy.', warnings: ['ENCRYPTED_DOCUMENT_DETECTED'], zipEntries: entries.map((entry) => entry.name) };
  }
  const totalCompressed = entries.reduce((sum, entry) => sum + entry.compressedSize, 0);
  const totalUncompressed = entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  const ratio = totalUncompressed / Math.max(1, totalCompressed);
  if (totalUncompressed > MAX_ZIP_UNCOMPRESSED_BYTES || ratio > MAX_ZIP_COMPRESSION_RATIO) {
    return { ok: false, detectedType: 'unsupported', errorCode: 'RESOURCE_LIMIT_EXCEEDED', userMessage: 'This compressed document expands beyond safe processing limits.', warnings: ['ZIP_EXPANSION_LIMIT_EXCEEDED'], zipEntries: entries.map((entry) => entry.name) };
  }
  const unsafe = unsafeZipEntry(entries.map((entry) => entry.name));
  if (unsafe) {
    return { ok: false, detectedType: 'unsupported', errorCode: 'UNSAFE_ACTIVE_CONTENT', userMessage: 'This document contains an unsafe embedded file and was not processed.', warnings: ['UNSAFE_EMBEDDED_CONTENT'], zipEntries: entries.map((entry) => entry.name) };
  }
  return null;
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

function detectZipDocument(entries: string[]): DocumentDetectionResult {
  const normalized = new Set(entries.map((entry) => entry.toLowerCase()));
  if (normalized.has('word/document.xml')) return detectDocx(entries);
  if ([...normalized].some((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry))) {
    if (hasMacroLikeZipEntry(entries)) return { ok: false, detectedType: 'pptx', errorCode: 'MACRO_ENABLED_UNSUPPORTED', userMessage: 'This presentation contains macros or active content. Please save a clean PPTX or PDF copy.', warnings: ['MACRO_CONTENT_DETECTED'], zipEntries: entries };
    return { ok: true, detectedType: 'pptx', warnings: [], zipEntries: entries };
  }
  if ([...normalized].some((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry))) {
    if (hasMacroLikeZipEntry(entries)) return { ok: false, detectedType: 'xlsx', errorCode: 'MACRO_ENABLED_UNSUPPORTED', userMessage: 'This workbook contains macros or active content. Please save a clean XLSX or PDF copy.', warnings: ['MACRO_CONTENT_DETECTED'], zipEntries: entries };
    return { ok: true, detectedType: 'xlsx', warnings: [], zipEntries: entries };
  }
  if (normalized.has('content.xml') && normalized.has('meta-inf/manifest.xml')) {
    return { ok: true, detectedType: 'odt', warnings: [], zipEntries: entries };
  }
  return { ok: false, detectedType: 'unsupported', errorCode: 'UNSUPPORTED_FILE_TYPE', userMessage: 'This ZIP-based file is not a supported document container.', warnings: [], zipEntries: entries };
}

function imageType(bytes: Uint8Array) {
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (startsWithAscii(bytes, 'GIF87a') || startsWithAscii(bytes, 'GIF89a')) return 'gif';
  if (startsWithBytes(bytes, [0x49, 0x49, 0x2a, 0x00]) || startsWithBytes(bytes, [0x4d, 0x4d, 0x00, 0x2a])) return 'tiff';
  if (startsWithAscii(bytes, 'RIFF') && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP') return 'webp';
  return null;
}

function extensionMatchesType(extension: string, type: DetectedDocumentType) {
  if (!extension) return true;
  const allowed: Partial<Record<DetectedDocumentType, string[]>> = {
    pdf: ['pdf'], docx: ['docx'], doc: ['doc'], pptx: ['pptx'], xlsx: ['xlsx'], odt: ['odt'],
    image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'tif', 'tiff'], txt: ['txt'], csv: ['csv'],
    html: ['html', 'htm'], rtf: ['rtf'], eml: ['eml'],
  };
  return allowed[type]?.includes(extension) ?? true;
}

function mismatch(type: DetectedDocumentType, hints: DetectionHints): DocumentDetectionResult | null {
  const extension = getExtension(hints.filename);
  if (extensionMatchesType(extension, type)) return null;
  return {
    ok: false, detectedType: type, errorCode: 'TYPE_MISMATCH',
    userMessage: 'The file contents do not match the filename extension. Export the original document again and upload the new copy.',
    warnings: ['DECLARED_TYPE_DOES_NOT_MATCH_MAGIC_BYTES'],
  };
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
    // Active actions can be declared late in a PDF object graph, so inspect the
    // complete bounded upload instead of only the leading bytes.
    const preview = new TextDecoder('latin1').decode(bytes);
    if (/\/Encrypt\b/.test(preview)) {
      return { ok: false, detectedType: 'pdf', errorCode: 'PASSWORD_PROTECTED', userMessage: 'This PDF is password-protected. Please upload an unlocked copy.', warnings: ['ENCRYPTED_DOCUMENT_DETECTED'] };
    }
    if (/\/(?:JavaScript|JS|Launch)\b/.test(preview)) {
      return { ok: false, detectedType: 'pdf', errorCode: 'UNSAFE_ACTIVE_CONTENT', userMessage: 'This PDF contains active actions or scripts and was not processed. Print or save a clean PDF copy first.', warnings: ['PDF_ACTIVE_CONTENT_DETECTED'] };
    }
    return mismatch('pdf', hints) ?? { ok: true, detectedType: 'pdf', warnings: [] };
  }

  const threatPreview = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 2_000_000)));
  if (threatPreview.includes('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*') ||
      startsWithAscii(bytes, 'MZ') || startsWithBytes(bytes, [0x7f, 0x45, 0x4c, 0x46])) {
    return {
      ok: false, detectedType: 'unsupported', errorCode: 'MALWARE_SCAN_FAILED',
      userMessage: 'This upload was isolated because it matches an executable or malware signature.',
      warnings: ['STATIC_THREAT_SIGNATURE_DETECTED'],
    };
  }

  const image = imageType(bytes);
  if (image) return mismatch('image', hints) ?? { ok: true, detectedType: 'image', warnings: [`IMAGE_FORMAT_${image.toUpperCase()}`] };

  const zipEntryMetadata = listZipEntries(bytes);
  if (zipEntryMetadata) {
    const envelopeError = validateZipEnvelope(zipEntryMetadata);
    if (envelopeError) return envelopeError;
    const detected = detectZipDocument(zipEntryMetadata.map((entry) => entry.name));
    return detected.ok ? mismatch(detected.detectedType, hints) ?? detected : detected;
  }

  const oleStreams = listOleStreams(bytes);
  if (oleStreams) return detectLegacyDoc(oleStreams);

  const extension = getExtension(hints.filename);
  if ((extension === 'csv' || hints.mimeType === 'text/csv') && isProbablyText(bytes)) return { ok: true, detectedType: 'csv', warnings: [] };
  if ((extension === 'html' || extension === 'htm' || hints.mimeType === 'text/html') && isProbablyText(bytes)) return { ok: true, detectedType: 'html', warnings: [] };
  if ((extension === 'rtf' || hints.mimeType === 'application/rtf' || hints.mimeType === 'text/rtf') && startsWithAscii(bytes, '{\\rtf')) {
    const preview = new TextDecoder('latin1').decode(bytes.slice(0, Math.min(bytes.length, 1_000_000)));
    if (/\\(?:object|objdata)\b/i.test(preview)) return { ok: false, detectedType: 'rtf', errorCode: 'UNSAFE_ACTIVE_CONTENT', userMessage: 'This RTF contains an embedded object and was not processed. Save a clean PDF or DOCX copy.', warnings: ['RTF_EMBEDDED_OBJECT_DETECTED'] };
    return { ok: true, detectedType: 'rtf', warnings: [] };
  }
  if ((extension === 'eml' || hints.mimeType === 'message/rfc822') && isProbablyText(bytes)) return { ok: true, detectedType: 'eml', warnings: [] };
  if ((extension === 'txt' || hints.mimeType === 'text/plain') && isProbablyText(bytes)) {
    return { ok: true, detectedType: 'txt', warnings: [] };
  }

  return {
    ok: false,
    detectedType: 'unsupported',
    errorCode: 'UNSUPPORTED_FILE_TYPE',
    userMessage: 'This file type is not supported. Upload a PDF, Word document, image, presentation, spreadsheet, email, HTML/RTF/ODT, CSV, or plain-text file.',
    warnings: [],
  };
}
