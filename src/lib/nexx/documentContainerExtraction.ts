import JSZip from 'jszip';
import type { CanonicalExtractedTextUnit } from './documentExtractionTypes';
import type { DetectedDocumentType } from './documentTypeDetection';

export type EmbeddedDocumentImage = { label: string; filename: string; mimeType: string; bytes: Uint8Array };
export type ContainerExtraction = { units: CanonicalExtractedTextUnit[]; images: EmbeddedDocumentImage[]; warnings: string[] };

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function xmlText(xml: string) {
  return decodeXml(xml
    .replace(/<(?:w:tab|a:tab)\b[^>]*\/>/gi, '\t')
    .replace(/<(?:w:br|a:br)\b[^>]*\/>/gi, '\n')
    .replace(/<\/(?:w:p|a:p|text:p|text:h|table:table-row)>/gi, '\n')
    .replace(/<\/(?:w:tc|table:table-cell)>/gi, '\t')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function naturalNumber(path: string) {
  return Number(path.match(/(\d+)(?=\.xml$)/)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function mimeForImage(path: string) {
  const extension = path.split('.').pop()?.toLowerCase();
  return extension === 'png' ? 'image/png'
    : extension === 'gif' ? 'image/gif'
      : extension === 'webp' ? 'image/webp'
        : extension === 'tif' || extension === 'tiff' ? 'image/tiff'
          : 'image/jpeg';
}

function unit(unitIndex: number, unitLabel: string, text: string, warnings: string[] = []): CanonicalExtractedTextUnit {
  return {
    unitIndex, unitLabel, text,
    status: text.trim() ? 'succeeded' : 'verified_blank',
    nativeTextChars: text.length, canonicalTextChars: text.length,
    ocrApplied: false, warnings,
  };
}

async function xmlUnit(zip: JSZip, path: string, label: string, index: number) {
  const xml = await zip.file(path)?.async('string');
  return unit(index, label, xml ? xmlText(xml) : '', xml ? [] : ['CONTAINER_PART_MISSING']);
}

async function embeddedImages(zip: JSZip, prefixes: string[]) {
  const paths = Object.keys(zip.files).filter((path) =>
    prefixes.some((prefix) => path.toLowerCase().startsWith(prefix)) &&
    /\.(?:png|jpe?g|gif|webp|tiff?)$/i.test(path) && !zip.files[path].dir);
  if (paths.length > 50) throw new Error('Document contains more than 50 embedded images.');
  return await Promise.all(paths.map(async (path): Promise<EmbeddedDocumentImage> => ({
    label: `Embedded image ${path}`,
    filename: path,
    mimeType: mimeForImage(path),
    bytes: await zip.files[path].async('uint8array'),
  })));
}

export async function extractZipDocumentContainer(buffer: Buffer, type: DetectedDocumentType): Promise<ContainerExtraction> {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: true, createFolders: false });
  const paths = Object.keys(zip.files).map((path) => path.replace(/\\/g, '/'));
  const units: CanonicalExtractedTextUnit[] = [];
  let images: EmbeddedDocumentImage[] = [];

  if (type === 'docx') {
    const contentPaths = [
      'word/document.xml',
      ...paths.filter((path) => /^word\/(?:header|footer)\d+\.xml$/i.test(path)).sort(),
      ...['word/footnotes.xml', 'word/endnotes.xml', 'word/comments.xml'].filter((path) => zip.file(path)),
    ];
    for (const [index, path] of contentPaths.entries()) units.push(await xmlUnit(zip, path, path.replace(/^word\//, ''), index));
    images = await embeddedImages(zip, ['word/media/']);
  } else if (type === 'pptx') {
    const slidePaths = paths.filter((path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path)).sort((a, b) => naturalNumber(a) - naturalNumber(b));
    for (const [index, path] of slidePaths.entries()) {
      const slideNumber = naturalNumber(path);
      const slide = await xmlUnit(zip, path, `Slide ${slideNumber}`, index);
      const notesPath = `ppt/notesSlides/notesSlide${slideNumber}.xml`;
      const notesXml = await zip.file(notesPath)?.async('string');
      if (notesXml) slide.text = `${slide.text}\n\n[Speaker notes]\n${xmlText(notesXml)}`.trim();
      slide.nativeTextChars = slide.text.length;
      slide.canonicalTextChars = slide.text.length;
      units.push(slide);
    }
    const chartPaths = paths.filter((path) => /^ppt\/charts\/chart\d+\.xml$/i.test(path)).sort((a, b) => naturalNumber(a) - naturalNumber(b));
    for (const path of chartPaths) units.push(await xmlUnit(zip, path, `Chart ${naturalNumber(path)}`, units.length));
    images = await embeddedImages(zip, ['ppt/media/']);
  } else if (type === 'xlsx') {
    const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
    const sharedStrings = sharedXml
      ? Array.from(sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gi), (match) => xmlText(match[1]))
      : [];
    const sheetPaths = paths.filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path)).sort((a, b) => naturalNumber(a) - naturalNumber(b));
    for (const [index, path] of sheetPaths.entries()) {
      const xml = await zip.file(path)?.async('string') ?? '';
      const rows = Array.from(xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi), (rowMatch) =>
        Array.from(rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi), (cellMatch) => {
          const attrs = cellMatch[1];
          const body = cellMatch[2];
          const ref = /\br="([^"]+)"/.exec(attrs)?.[1] ?? '?';
          const formula = /<f\b[^>]*>([\s\S]*?)<\/f>/i.exec(body)?.[1];
          const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/i.exec(body)?.[1] ?? /<t\b[^>]*>([\s\S]*?)<\/t>/i.exec(body)?.[1] ?? '';
          const value = /\bt="s"/.test(attrs) ? sharedStrings[Number(raw)] ?? raw : decodeXml(raw);
          return `${ref}: ${formula ? `=${decodeXml(formula)} => ` : ''}${value}`;
        }).join('\t')).filter(Boolean);
      units.push(unit(index, `Worksheet ${naturalNumber(path)}`, rows.join('\n')));
    }
    images = await embeddedImages(zip, ['xl/media/']);
  } else if (type === 'odt') {
    units.push(await xmlUnit(zip, 'content.xml', 'Document content', 0));
    images = await embeddedImages(zip, ['pictures/']);
  }

  return {
    units,
    images,
    warnings: [
      ...(images.length > 0 ? ['EMBEDDED_IMAGES_DETECTED'] : []),
      ...(paths.length > 0 ? [] : ['EMPTY_DOCUMENT_CONTAINER']),
    ],
  };
}

export function extractSimpleDocumentText(buffer: Buffer, type: DetectedDocumentType) {
  const raw = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (type === 'html') {
    return decodeXml(raw.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(?:p|div|li|tr|h[1-6])>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '));
  }
  if (type === 'rtf') {
    return raw.replace(/\\(?:fonttbl|colortbl|stylesheet|info|pict)\b\{[\s\S]*?\}/gi, ' ')
      .replace(/\\par[d]?\b/gi, '\n').replace(/\\tab\b/gi, '\t')
      .replace(/\\'[0-9a-f]{2}/gi, (hex) => String.fromCharCode(parseInt(hex.slice(2), 16)))
      .replace(/\\u(-?\d+)\??/g, (_, code) => String.fromCharCode((Number(code) + 65536) % 65536))
      .replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, ' ');
  }
  if (type === 'eml') {
    const split = raw.search(/\r?\n\r?\n/);
    const headers = split >= 0 ? raw.slice(0, split) : '';
    let body = split >= 0 ? raw.slice(split).trim() : raw;
    if (/content-transfer-encoding:\s*base64/i.test(headers)) {
      try { body = Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8'); } catch { /* preserve original */ }
    } else if (/content-transfer-encoding:\s*quoted-printable/i.test(headers)) {
      body = body.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
    const selectedHeaders = headers.split(/\r?\n/).filter((line) => /^(?:from|to|cc|bcc|subject|date|message-id):/i.test(line));
    return [...selectedHeaders, '', body.replace(/<[^>]+>/g, ' ')].join('\n');
  }
  return raw;
}
