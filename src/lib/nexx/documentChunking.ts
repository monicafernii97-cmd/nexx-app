export const DOCUMENT_CHUNKING_VERSION = 'document-chunking-v2-legal-artifacts';

const SYNTHETIC_PAGE_TARGET_CHARS = 12_000;
const CHUNK_TARGET_CHARS = 3_200;
const CHUNK_MIN_CHARS = 1_800;
const CHUNK_OVERLAP_MAX_CHARS = 650;

export type DocumentMemoryBlockType =
  | 'title'
  | 'text'
  | 'list'
  | 'table'
  | 'image'
  | 'caption'
  | 'header'
  | 'footer'
  | 'signature'
  | 'equation'
  | 'aside_text'
  | 'references'
  | 'other';

export type DocumentRetrievalMetadata = {
  containsTable: boolean;
  containsSignature: boolean;
  containsDate: boolean;
  containsDeadline: boolean;
  containsMoney: boolean;
  containsPartyName: boolean;
  containsOrderLanguage: boolean;
};

export type DocumentMemoryPageArtifact = {
  pageNumber: number;
  text: string;
  textLength: number;
  startChar: number;
  endChar: number;
  isSynthetic: boolean;
  warnings: string[];
};

export type DocumentMemoryBlockArtifact = {
  blockIndex: number;
  pageNumber: number;
  type: DocumentMemoryBlockType;
  text: string;
  normalizedText: string;
  startChar: number;
  endChar: number;
  isSubstantive: boolean;
  sectionHeading?: string;
  paragraphNumber?: string;
  tableIndex?: number;
  retrievalMetadata: DocumentRetrievalMetadata;
  warnings: string[];
};

export type DocumentMemoryTableArtifact = {
  tableIndex: number;
  pageNumber: number;
  blockIndex?: number;
  markdown?: string;
  plainText: string;
  rowCount?: number;
  columnCount?: number;
  warnings: string[];
};

export type DocumentMemoryChunkArtifact = {
  chunkIndex: number;
  text: string;
  textLength: number;
  startChar: number;
  endChar: number;
  tokenCount: number;
  blockIndexes: number[];
  tableIndexes: number[];
  sectionHeading?: string;
  pageStart?: number;
  pageEnd?: number;
  paragraphRange?: string;
  citationLabel?: string;
  retrievalMetadata: DocumentRetrievalMetadata;
  warnings: string[];
};

export type DocumentMemoryArtifacts = {
  chunkingVersion: string;
  pages: DocumentMemoryPageArtifact[];
  blocks: DocumentMemoryBlockArtifact[];
  tables: DocumentMemoryTableArtifact[];
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

function trimmedSlice(text: string, start: number, end: number) {
  const raw = text.slice(start, end);
  const leadingLength = raw.match(/^\s*/)?.[0].length ?? 0;
  const trailingLength = raw.match(/\s*$/)?.[0].length ?? 0;
  return {
    text: raw.trim(),
    startChar: start + leadingLength,
    endChar: end - trailingLength,
  };
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

function normalizeBlockText(text: string) {
  return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function retrievalMetadataForText(text: string): DocumentRetrievalMetadata {
  return {
    containsTable: looksLikeTable(text),
    containsSignature: /\b(signature|signed|signed\s+this|judge presiding|district judge|notary|approved\s+as\s+to\s+form)\b/i.test(text),
    containsDate: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text),
    containsDeadline: /\b(?:deadline|due|no later than|on or before|shall file|shall serve|must file|must serve|business days|calendar days|within\s+\d+\s+(?:business\s+|calendar\s+)?days?|\d+\s+(?:business\s+|calendar\s+)?days?)\b/i.test(text),
    containsMoney: /\$\s?\d|\b(?:dollars|fees|payment|arrears|support|sanctions|costs)\b/i.test(text),
    containsPartyName: /\b(?:petitioner|respondent|father|mother|parent|plaintiff|defendant|movant|child(?:ren)?)\b/i.test(text),
    containsOrderLanguage: /\b(?:ordered|it is ordered|shall|must|restrained|enjoined|granted|denied|injunction|possession|conservatorship)\b/i.test(text),
  };
}

function mergeRetrievalMetadata(items: DocumentRetrievalMetadata[]): DocumentRetrievalMetadata {
  return {
    containsTable: items.some((item) => item.containsTable),
    containsSignature: items.some((item) => item.containsSignature),
    containsDate: items.some((item) => item.containsDate),
    containsDeadline: items.some((item) => item.containsDeadline),
    containsMoney: items.some((item) => item.containsMoney),
    containsPartyName: items.some((item) => item.containsPartyName),
    containsOrderLanguage: items.some((item) => item.containsOrderLanguage),
  };
}

function looksLikeTable(text: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return false;
  const pipeRows = lines.filter((line) => /\|/.test(line));
  const tabRows = lines.filter((line) => /\t/.test(line));
  if (pipeRows.length >= 2) return true;
  if (tabRows.length >= 2) return true;
  return lines.some((line) => /\s{3,}\S+\s{3,}\S+/.test(line));
}

function looksLikeTitle(text: string) {
  const firstLine = text.split('\n').map((line) => line.trim()).find(Boolean) ?? '';
  if (firstLine.length < 4 || firstLine.length > 140) return false;
  if (/^(?:article|section|paragraph|order|temporary orders|final order|injunction|possession|conservatorship)\b/i.test(firstLine)) {
    return true;
  }
  if (/^(?:[IVXLC]+\.\s+|[A-Z]\.\s+|\d+\.\s+)[A-Z0-9]/.test(firstLine)) {
    return true;
  }
  return firstLine === firstLine.toUpperCase() && /[A-Z]{3,}/.test(firstLine) && !/[.!?]$/.test(firstLine);
}

function looksLikeList(text: string) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return false;
  const listLines = lines.filter((line) => /^(?:[-*•]|\(?\d{1,3}\)?[.)]|\(?[a-zA-Z]\)?[.)]|[IVXLC]+[.)])\s+/.test(line));
  return listLines.length >= Math.min(2, lines.length);
}

function looksLikeSignature(text: string) {
  return /\b(signature|signed\s+this|judge presiding|district judge|notary|approved as to form)\b/i.test(text) ||
    /_{5,}\s*(?:\n|.){0,80}\b(?:judge|signature|petitioner|respondent|attorney)\b/i.test(text);
}

function inferBlockType(text: string): DocumentMemoryBlockType {
  if (looksLikeTable(text)) return 'table';
  if (looksLikeSignature(text)) return 'signature';
  if (looksLikeTitle(text)) return 'title';
  if (looksLikeList(text)) return 'list';
  return 'text';
}

function inferParagraphNumber(text: string) {
  const firstLine = text.trim().split('\n')[0] ?? '';
  const match = firstLine.match(/^(?:paragraph|section)?\s*\(?([0-9]{1,3}|[A-Z]|[IVXLC]+)\)?[.)]\s+/i);
  return match?.[1];
}

function tableStats(markdown: string) {
  const rows = markdown.split('\n').map((line) => line.trim()).filter(Boolean);
  const tableRows = rows.filter((row) => /\||\t/.test(row));
  const sample = tableRows[0] ?? rows[0] ?? '';
  const columnCount = sample.includes('|')
    ? sample.split('|').map((cell) => cell.trim()).filter(Boolean).length
    : sample.split(/\t|\s{3,}/).map((cell) => cell.trim()).filter(Boolean).length;
  return {
    rowCount: tableRows.length || rows.length || undefined,
    columnCount: columnCount || undefined,
  };
}

function buildSyntheticPages(text: string) {
  const pages: DocumentMemoryPageArtifact[] = [];
  let start = 0;

  while (start < text.length) {
    const minEnd = Math.min(text.length, start + Math.floor(SYNTHETIC_PAGE_TARGET_CHARS * 0.65));
    const targetEnd = Math.min(text.length, start + SYNTHETIC_PAGE_TARGET_CHARS);
    const end = findBreakBefore(text, start, targetEnd, minEnd);
    const page = trimmedSlice(text, start, end);
    const pageText = page.text;

    if (pageText) {
      pages.push({
        pageNumber: pages.length + 1,
        text: pageText,
        textLength: pageText.length,
        startChar: page.startChar,
        endChar: page.endChar,
        isSynthetic: true,
        warnings: ['PAGE_BOUNDARIES_UNAVAILABLE'],
      });
    }

    start = end;
  }

  return pages;
}

function splitPageIntoBlockArtifacts(page: DocumentMemoryPageArtifact, initialBlockIndex: number, initialTableIndex: number) {
  const blocks: DocumentMemoryBlockArtifact[] = [];
  const tables: DocumentMemoryTableArtifact[] = [];
  const paragraphs = page.text.split(/\n{2,}/);
  let searchOffset = 0;
  let currentSectionHeading: string | undefined;
  let blockIndex = initialBlockIndex;
  let tableIndex = initialTableIndex;

  for (const paragraph of paragraphs) {
    const normalizedText = normalizeBlockText(paragraph);
    if (!normalizedText) continue;

    const localStart = page.text.indexOf(paragraph, searchOffset);
    const safeLocalStart = localStart >= 0 ? localStart : searchOffset;
    const localEnd = safeLocalStart + paragraph.length;
    searchOffset = localEnd;

    const blockType = inferBlockType(normalizedText);
    const metadata = retrievalMetadataForText(normalizedText);
    const heading = blockType === 'title' ? normalizedText.split('\n')[0]?.trim() : currentSectionHeading;
    if (blockType === 'title' && heading) currentSectionHeading = heading;

    let assignedTableIndex: number | undefined;
    if (blockType === 'table') {
      assignedTableIndex = tableIndex;
      const stats = tableStats(normalizedText);
      tables.push({
        tableIndex,
        pageNumber: page.pageNumber,
        blockIndex,
        markdown: normalizedText,
        plainText: normalizedText.replace(/\s*\|\s*/g, ' | '),
        rowCount: stats.rowCount,
        columnCount: stats.columnCount,
        warnings: page.warnings,
      });
      tableIndex += 1;
    }

    blocks.push({
      blockIndex,
      pageNumber: page.pageNumber,
      type: blockType,
      text: normalizedText,
      normalizedText,
      startChar: page.startChar + safeLocalStart,
      endChar: page.startChar + localEnd,
      isSubstantive: !['header', 'footer'].includes(blockType),
      sectionHeading: heading,
      paragraphNumber: inferParagraphNumber(normalizedText),
      tableIndex: assignedTableIndex,
      retrievalMetadata: metadata,
      warnings: page.warnings,
    });
    blockIndex += 1;
  }

  return { blocks, tables };
}

function buildBlocksAndTables(pages: DocumentMemoryPageArtifact[]) {
  const blocks: DocumentMemoryBlockArtifact[] = [];
  const tables: DocumentMemoryTableArtifact[] = [];
  for (const page of pages) {
    const result = splitPageIntoBlockArtifacts(page, blocks.length, tables.length);
    blocks.push(...result.blocks);
    tables.push(...result.tables);
  }
  return { blocks, tables };
}

function chunkWarningsForBlocks(blocks: DocumentMemoryBlockArtifact[]) {
  return Array.from(new Set(blocks.flatMap((block) => block.warnings)));
}

function chunkParagraphRange(blocks: DocumentMemoryBlockArtifact[]) {
  const paragraphNumbers = blocks.map((block) => block.paragraphNumber).filter(Boolean) as string[];
  if (paragraphNumbers.length === 0) return undefined;
  const first = paragraphNumbers[0];
  const last = paragraphNumbers[paragraphNumbers.length - 1];
  return first === last ? first : `${first}-${last}`;
}

function buildChunkFromBlocks(chunkIndex: number, blocks: DocumentMemoryBlockArtifact[]): DocumentMemoryChunkArtifact {
  const sorted = [...blocks].sort((a, b) => a.blockIndex - b.blockIndex);
  const text = sorted.map((block) => block.text).join('\n\n').trim();
  const pageStart = Math.min(...sorted.map((block) => block.pageNumber));
  const pageEnd = Math.max(...sorted.map((block) => block.pageNumber));
  const tableIndexes = Array.from(new Set(sorted.map((block) => block.tableIndex).filter((value) => value !== undefined))) as number[];
  const heading = sorted.find((block) => block.sectionHeading)?.sectionHeading ?? inferSectionHeading(text);

  return {
    chunkIndex,
    text,
    textLength: text.length,
    startChar: Math.min(...sorted.map((block) => block.startChar)),
    endChar: Math.max(...sorted.map((block) => block.endChar)),
    tokenCount: estimateTokenCount(text),
    blockIndexes: sorted.map((block) => block.blockIndex),
    tableIndexes,
    sectionHeading: heading,
    pageStart,
    pageEnd,
    paragraphRange: chunkParagraphRange(sorted),
    retrievalMetadata: mergeRetrievalMetadata(sorted.map((block) => block.retrievalMetadata)),
    warnings: chunkWarningsForBlocks(sorted),
  };
}

function selectOverlapBlocks(blocks: DocumentMemoryBlockArtifact[]) {
  const overlap: DocumentMemoryBlockArtifact[] = [];
  let totalLength = 0;

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.type === 'table' || block.type === 'signature') break;
    if (totalLength + block.text.length > CHUNK_OVERLAP_MAX_CHARS) break;
    overlap.unshift(block);
    totalLength += block.text.length;
  }

  return overlap;
}

function buildChunksFromBlocks(blocks: DocumentMemoryBlockArtifact[]) {
  const chunks: DocumentMemoryChunkArtifact[] = [];
  let current: DocumentMemoryBlockArtifact[] = [];
  let currentLength = 0;

  for (const block of blocks.filter((candidate) => candidate.isSubstantive && candidate.text.trim())) {
    const projectedLength = currentLength + block.text.length + (current.length > 0 ? 2 : 0);
    const shouldFlush =
      current.length > 0 &&
      currentLength >= CHUNK_MIN_CHARS &&
      projectedLength > CHUNK_TARGET_CHARS;

    if (shouldFlush) {
      chunks.push(buildChunkFromBlocks(chunks.length, current));
      current = selectOverlapBlocks(current);
      currentLength = current.reduce((sum, item) => sum + item.text.length + 2, 0);
    }

    current.push(block);
    currentLength += block.text.length + (current.length > 1 ? 2 : 0);
  }

  if (current.length > 0) {
    chunks.push(buildChunkFromBlocks(chunks.length, current));
  }

  return chunks;
}

export function buildDocumentMemoryArtifacts(text: string): DocumentMemoryArtifacts {
  const normalizedText = normalizeExtractedText(text);
  if (!normalizedText) {
    return {
      chunkingVersion: DOCUMENT_CHUNKING_VERSION,
      pages: [],
      blocks: [],
      tables: [],
      chunks: [],
      warnings: ['EMPTY_DOCUMENT_TEXT'],
    };
  }

  const pages = buildSyntheticPages(normalizedText);
  const { blocks, tables } = buildBlocksAndTables(pages);
  const chunks = buildChunksFromBlocks(blocks);

  return {
    chunkingVersion: DOCUMENT_CHUNKING_VERSION,
    pages,
    blocks,
    tables,
    chunks,
    warnings: ['PAGE_BOUNDARIES_UNAVAILABLE'],
  };
}
