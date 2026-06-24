export const DOCUMENT_CHUNKING_VERSION = 'document-chunking-v1';

const SYNTHETIC_PAGE_TARGET_CHARS = 12_000;
const CHUNK_TARGET_CHARS = 3_200;
const CHUNK_MIN_CHARS = 1_800;
const CHUNK_OVERLAP_CHARS = 450;

export type DocumentMemoryPageArtifact = {
  pageNumber: number;
  text: string;
  textLength: number;
  isSynthetic: boolean;
  warnings: string[];
};

export type DocumentMemoryChunkArtifact = {
  chunkIndex: number;
  text: string;
  textLength: number;
  startChar: number;
  endChar: number;
  tokenCount: number;
  sectionHeading?: string;
  pageStart?: number;
  pageEnd?: number;
  warnings: string[];
};

export type DocumentMemoryArtifacts = {
  chunkingVersion: string;
  pages: DocumentMemoryPageArtifact[];
  chunks: DocumentMemoryChunkArtifact[];
  warnings: string[];
};

function normalizeExtractedText(text: string) {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function findBreakBefore(text: string, start: number, targetEnd: number, minEnd: number) {
  const cappedEnd = Math.min(targetEnd, text.length);
  const breakPatterns = ['\n\n', '\n', '. ', '; ', ': ', ', ', ' '];

  for (const pattern of breakPatterns) {
    const index = text.lastIndexOf(pattern, cappedEnd);
    if (index >= minEnd) return index + pattern.length;
  }

  return cappedEnd;
}

function inferSectionHeading(chunkText: string) {
  const lines = chunkText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);

  for (const line of lines) {
    if (line.length < 4 || line.length > 120) continue;
    if (/^(?:article|section|paragraph|order|it is ordered|temporary orders|final order)\b/i.test(line)) {
      return line;
    }
    if (/^(?:[IVXLC]+\.\s+|[A-Z]\.\s+|\d+\.\s+)[A-Z0-9]/.test(line)) {
      return line;
    }
    if (line === line.toUpperCase() && /[A-Z]{3,}/.test(line) && !/[.!?]$/.test(line)) {
      return line;
    }
  }

  return undefined;
}

function estimateTokenCount(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function buildSyntheticPages(text: string) {
  const pages: DocumentMemoryPageArtifact[] = [];
  let start = 0;

  while (start < text.length) {
    const minEnd = Math.min(text.length, start + Math.floor(SYNTHETIC_PAGE_TARGET_CHARS * 0.65));
    const targetEnd = Math.min(text.length, start + SYNTHETIC_PAGE_TARGET_CHARS);
    const end = findBreakBefore(text, start, targetEnd, minEnd);
    const pageText = text.slice(start, end).trim();

    if (pageText) {
      pages.push({
        pageNumber: pages.length + 1,
        text: pageText,
        textLength: pageText.length,
        isSynthetic: true,
        warnings: ['PAGE_BOUNDARIES_UNAVAILABLE'],
      });
    }

    start = end;
  }

  return pages;
}

function buildChunks(text: string) {
  const chunks: DocumentMemoryChunkArtifact[] = [];
  let start = 0;

  while (start < text.length) {
    const minEnd = Math.min(text.length, start + CHUNK_MIN_CHARS);
    const targetEnd = Math.min(text.length, start + CHUNK_TARGET_CHARS);
    const end = findBreakBefore(text, start, targetEnd, minEnd);
    const rawChunkText = text.slice(start, end);
    const chunkText = rawChunkText.trim();

    if (chunkText) {
      chunks.push({
        chunkIndex: chunks.length,
        text: chunkText,
        textLength: chunkText.length,
        startChar: start,
        endChar: end,
        tokenCount: estimateTokenCount(chunkText),
        sectionHeading: inferSectionHeading(chunkText),
        warnings: ['PAGE_BOUNDARIES_UNAVAILABLE'],
      });
    }

    if (end >= text.length) break;
    start = Math.max(end - CHUNK_OVERLAP_CHARS, start + 1);
  }

  return chunks;
}

export function buildDocumentMemoryArtifacts(text: string): DocumentMemoryArtifacts {
  const normalizedText = normalizeExtractedText(text);
  if (!normalizedText) {
    return {
      chunkingVersion: DOCUMENT_CHUNKING_VERSION,
      pages: [],
      chunks: [],
      warnings: ['EMPTY_DOCUMENT_TEXT'],
    };
  }

  return {
    chunkingVersion: DOCUMENT_CHUNKING_VERSION,
    pages: buildSyntheticPages(normalizedText),
    chunks: buildChunks(normalizedText),
    warnings: ['PAGE_BOUNDARIES_UNAVAILABLE'],
  };
}
