import { internalMutation, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

const DOCUMENT_MEMORY_BATCH_LIMIT = 50;
const DOCUMENT_MEMORY_RESET_BATCH_LIMIT = 100;

const pageArtifactValidator = v.object({
  pageNumber: v.number(),
  text: v.string(),
  textLength: v.number(),
  startChar: v.optional(v.number()),
  endChar: v.optional(v.number()),
  isSynthetic: v.boolean(),
  warnings: v.array(v.string()),
});

const retrievalMetadataValidator = v.object({
  containsTable: v.boolean(),
  containsSignature: v.boolean(),
  containsDate: v.boolean(),
  containsDeadline: v.boolean(),
  containsMoney: v.boolean(),
  containsPartyName: v.boolean(),
  containsOrderLanguage: v.boolean(),
});

const blockTypeValidator = v.union(
  v.literal('title'),
  v.literal('text'),
  v.literal('list'),
  v.literal('table'),
  v.literal('image'),
  v.literal('caption'),
  v.literal('header'),
  v.literal('footer'),
  v.literal('signature'),
  v.literal('equation'),
  v.literal('aside_text'),
  v.literal('references'),
  v.literal('other'),
);

const blockArtifactValidator = v.object({
  blockIndex: v.number(),
  pageNumber: v.number(),
  type: blockTypeValidator,
  text: v.string(),
  normalizedText: v.string(),
  startChar: v.optional(v.number()),
  endChar: v.optional(v.number()),
  isSubstantive: v.boolean(),
  sectionHeading: v.optional(v.string()),
  paragraphNumber: v.optional(v.string()),
  tableIndex: v.optional(v.number()),
  retrievalMetadata: retrievalMetadataValidator,
  warnings: v.array(v.string()),
});

const tableArtifactValidator = v.object({
  tableIndex: v.number(),
  pageNumber: v.number(),
  blockIndex: v.optional(v.number()),
  html: v.optional(v.string()),
  markdown: v.optional(v.string()),
  plainText: v.string(),
  rowCount: v.optional(v.number()),
  columnCount: v.optional(v.number()),
  warnings: v.array(v.string()),
});

const chunkArtifactValidator = v.object({
  chunkIndex: v.number(),
  text: v.string(),
  textLength: v.number(),
  startChar: v.number(),
  endChar: v.number(),
  tokenCount: v.number(),
  blockIds: v.optional(v.array(v.id('documentBlocks'))),
  tableIds: v.optional(v.array(v.id('documentTables'))),
  sectionHeading: v.optional(v.string()),
  pageStart: v.optional(v.number()),
  pageEnd: v.optional(v.number()),
  paragraphRange: v.optional(v.string()),
  citationLabel: v.optional(v.string()),
  retrievalMetadata: v.optional(retrievalMetadataValidator),
  warnings: v.array(v.string()),
});

const aliasArtifactValidator = v.object({
  alias: v.string(),
  normalizedAlias: v.string(),
  source: v.union(
    v.literal('filename'),
    v.literal('document_type'),
    v.literal('assistant_reference'),
    v.literal('system_generated'),
  ),
});

/** Keep document memory writes bounded so large uploads cannot exceed Convex mutation limits. */
function assertBatchSize(length: number) {
  if (length > DOCUMENT_MEMORY_BATCH_LIMIT) {
    throw new Error(`Document memory batch exceeded ${DOCUMENT_MEMORY_BATCH_LIMIT} records`);
  }
}

/** Validate chunk offsets and page ranges before storing retrieval artifacts. */
function assertChunkRange(chunk: {
  startChar: number;
  endChar: number;
  pageStart?: number;
  pageEnd?: number;
}) {
  if (chunk.startChar >= chunk.endChar) {
    throw new Error('Document chunk startChar must be less than endChar');
  }
  if (
    chunk.pageStart !== undefined &&
    chunk.pageEnd !== undefined &&
    chunk.pageStart > chunk.pageEnd
  ) {
    throw new Error('Document chunk pageStart must be less than or equal to pageEnd');
  }
}

function canonicalSourceForUploadedFile(uploadedFile: {
  ocrAttempted?: boolean;
  extractionMethod?: string;
}) {
  if (uploadedFile.extractionMethod?.toLowerCase().includes('ocr') || uploadedFile.ocrAttempted) {
    return 'ocr' as const;
  }
  return 'native' as const;
}

function artifactSourceForUploadedFile(uploadedFile: {
  ocrAttempted?: boolean;
  extractionMethod?: string;
}) {
  if (uploadedFile.extractionMethod === 'mistral_ocr_4') {
    return 'mistral_ocr_4' as const;
  }
  if (uploadedFile.extractionMethod?.toLowerCase().includes('ocr') || uploadedFile.ocrAttempted) {
    return 'hybrid' as const;
  }
  return 'native' as const;
}

function buildCitationLabel(filename: string, chunk: {
  chunkIndex: number;
  pageStart?: number;
  pageEnd?: number;
  sectionHeading?: string;
}) {
  const pageLabel = chunk.pageStart !== undefined && chunk.pageEnd !== undefined
    ? chunk.pageStart === chunk.pageEnd
      ? `p. ${chunk.pageStart}`
      : `pp. ${chunk.pageStart}-${chunk.pageEnd}`
    : 'stored text';
  return [
    filename,
    pageLabel,
    chunk.sectionHeading,
    `chunk ${chunk.chunkIndex + 1}`,
  ].filter(Boolean).join(', ');
}

function retrievalMetadataForText(text: string) {
  return {
    containsTable: /\|.+\||\t/.test(text),
    containsSignature: /\b(signature|signed|judge|notary)\b/i.test(text),
    containsDate: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(text),
    containsDeadline: /\b(deadline|due|within|no later than|on or before|shall file|shall serve)\b/i.test(text),
    containsMoney: /\$\s?\d|\b(?:dollars|fees|payment|arrears|support)\b/i.test(text),
    containsPartyName: /\b(?:petitioner|respondent|father|mother|parent|plaintiff|defendant)\b/i.test(text),
    containsOrderLanguage: /\b(?:ordered|shall|must|restrained|granted|denied|injunction)\b/i.test(text),
  };
}

async function getOptionalGeneration(
  ctx: MutationCtx,
  uploadedFileId: Id<'uploadedFiles'>,
  memoryGenerationId?: Id<'documentMemoryGenerations'>,
) {
  if (!memoryGenerationId) return null;
  const generation = await ctx.db.get(memoryGenerationId);
  if (!generation || generation.uploadedFileId !== uploadedFileId) {
    throw new Error('Document memory generation not found for uploaded file');
  }
  if (generation.status !== 'building') {
    throw new Error(`Cannot write document memory artifacts to ${generation.status} generation`);
  }
  return generation;
}

export const resetDocumentMemory = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
  },
  handler: async (ctx, args) => {
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    if (uploadedFile.activeMemoryGenerationId) {
      throw new Error('Cannot reset generation-aware document memory; retire or replace a generation instead');
    }

    let deletedPages = 0;
    while (true) {
      const pages = await ctx.db
        .query('documentPages')
        .withIndex('by_uploaded_file_page', (q) => q.eq('uploadedFileId', args.uploadedFileId))
        .take(DOCUMENT_MEMORY_RESET_BATCH_LIMIT);
      if (pages.length === 0) break;
      for (const page of pages) await ctx.db.delete(page._id);
      deletedPages += pages.length;
      if (pages.length < DOCUMENT_MEMORY_RESET_BATCH_LIMIT) break;
    }

    let deletedChunks = 0;
    while (true) {
      const chunks = await ctx.db
        .query('documentChunks')
        .withIndex('by_uploaded_file_chunk', (q) => q.eq('uploadedFileId', args.uploadedFileId))
        .take(DOCUMENT_MEMORY_RESET_BATCH_LIMIT);
      if (chunks.length === 0) break;
      for (const chunk of chunks) await ctx.db.delete(chunk._id);
      deletedChunks += chunks.length;
      if (chunks.length < DOCUMENT_MEMORY_RESET_BATCH_LIMIT) break;
    }

    await ctx.db.patch(args.uploadedFileId, {
      pageCount: 0,
      chunkCount: 0,
      chunkingVersion: undefined,
      memoryIndexedAt: undefined,
      updatedAt: Date.now(),
    });

    return { deletedPages, deletedChunks };
  },
});

export const insertDocumentPageBatch = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    memoryGenerationId: v.optional(v.id('documentMemoryGenerations')),
    pages: v.array(pageArtifactValidator),
  },
  handler: async (ctx, args) => {
    assertBatchSize(args.pages.length);
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    await getOptionalGeneration(ctx, args.uploadedFileId, args.memoryGenerationId);
    const now = Date.now();
    const canonicalSource = canonicalSourceForUploadedFile(uploadedFile);
    const inserted: Array<{
      pageNumber: number;
      pageId: Id<'documentPages'>;
    }> = [];

    for (const page of args.pages) {
      const pageId = await ctx.db.insert('documentPages', {
        uploadedFileId: args.uploadedFileId,
        memoryGenerationId: args.memoryGenerationId,
        orgId: uploadedFile.orgId,
        accountId: uploadedFile.accountId,
        matterId: uploadedFile.matterId,
        clerkUserId: uploadedFile.clerkUserId,
        conversationId: uploadedFile.conversationId,
        caseId: uploadedFile.caseId,
        pageNumber: page.pageNumber,
        sourcePageIndex: page.pageNumber - 1,
        startChar: page.startChar,
        endChar: page.endChar,
        text: page.text,
        textLength: page.textLength,
        nativeText: canonicalSource === 'native' ? page.text : undefined,
        ocrMarkdown: canonicalSource === 'ocr' ? page.text : undefined,
        canonicalText: page.text,
        canonicalSource,
        extractionMethod: uploadedFile.extractionMethod,
        warnings: page.warnings,
        isSynthetic: page.isSynthetic,
        createdAt: now,
      });
      inserted.push({ pageNumber: page.pageNumber, pageId });
    }

    return { inserted: inserted.length, pages: inserted };
  },
});

export const insertDocumentBlockBatch = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    memoryGenerationId: v.id('documentMemoryGenerations'),
    pageRefs: v.array(v.object({
      pageNumber: v.number(),
      pageId: v.id('documentPages'),
    })),
    blocks: v.array(blockArtifactValidator),
  },
  handler: async (ctx, args) => {
    assertBatchSize(args.blocks.length);
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    await getOptionalGeneration(ctx, args.uploadedFileId, args.memoryGenerationId);
    const pageIdByNumber = new Map(args.pageRefs.map((page) => [page.pageNumber, page.pageId]));
    const now = Date.now();
    const source = artifactSourceForUploadedFile(uploadedFile);
    const inserted: Array<{
      blockIndex: number;
      pageNumber: number;
      blockId: Id<'documentBlocks'>;
    }> = [];

    for (const block of args.blocks) {
      const pageId = pageIdByNumber.get(block.pageNumber);
      if (!pageId) {
        throw new Error(`Document block page ${block.pageNumber} was not stored for this generation`);
      }
      const blockId = await ctx.db.insert('documentBlocks', {
        orgId: uploadedFile.orgId,
        accountId: uploadedFile.accountId,
        matterId: uploadedFile.matterId,
        clerkUserId: uploadedFile.clerkUserId,
        conversationId: uploadedFile.conversationId,
        caseId: uploadedFile.caseId,
        uploadedFileId: args.uploadedFileId,
        memoryGenerationId: args.memoryGenerationId,
        pageId,
        pageNumber: block.pageNumber,
        blockIndex: block.blockIndex,
        type: block.type,
        text: block.text,
        normalizedText: block.normalizedText,
        startChar: block.startChar,
        endChar: block.endChar,
        source,
        isSubstantive: block.isSubstantive,
        sectionHeading: block.sectionHeading,
        paragraphNumber: block.paragraphNumber,
        tableIndex: block.tableIndex,
        retrievalMetadata: block.retrievalMetadata,
        warnings: block.warnings,
        textHash: undefined,
        createdAt: now,
      });
      inserted.push({
        blockIndex: block.blockIndex,
        pageNumber: block.pageNumber,
        blockId,
      });
    }

    return { inserted: inserted.length, blocks: inserted };
  },
});

export const insertDocumentTableBatch = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    memoryGenerationId: v.id('documentMemoryGenerations'),
    pageRefs: v.array(v.object({
      pageNumber: v.number(),
      pageId: v.id('documentPages'),
    })),
    blockRefs: v.array(v.object({
      blockIndex: v.number(),
      pageNumber: v.number(),
      blockId: v.id('documentBlocks'),
    })),
    tables: v.array(tableArtifactValidator),
  },
  handler: async (ctx, args) => {
    assertBatchSize(args.tables.length);
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    await getOptionalGeneration(ctx, args.uploadedFileId, args.memoryGenerationId);
    const pageIdByNumber = new Map(args.pageRefs.map((page) => [page.pageNumber, page.pageId]));
    const blockKey = (pageNumber: number, blockIndex: number) => `${pageNumber}:${blockIndex}`;
    const blockIdByPageAndIndex = new Map(
      args.blockRefs.map((block) => [blockKey(block.pageNumber, block.blockIndex), block.blockId]),
    );
    const now = Date.now();
    const inserted: Array<{
      tableIndex: number;
      pageNumber: number;
      tableId: Id<'documentTables'>;
    }> = [];

    for (const table of args.tables) {
      const pageId = pageIdByNumber.get(table.pageNumber);
      if (!pageId) {
        throw new Error(`Document table page ${table.pageNumber} was not stored for this generation`);
      }
      const blockId = table.blockIndex !== undefined
        ? blockIdByPageAndIndex.get(blockKey(table.pageNumber, table.blockIndex))
        : undefined;
      if (table.blockIndex !== undefined && !blockId) {
        throw new Error(`Document table block ${table.blockIndex} on page ${table.pageNumber} was not stored for this generation`);
      }
      const tableId = await ctx.db.insert('documentTables', {
        orgId: uploadedFile.orgId,
        accountId: uploadedFile.accountId,
        matterId: uploadedFile.matterId,
        clerkUserId: uploadedFile.clerkUserId,
        conversationId: uploadedFile.conversationId,
        caseId: uploadedFile.caseId,
        uploadedFileId: args.uploadedFileId,
        memoryGenerationId: args.memoryGenerationId,
        pageId,
        blockId,
        pageNumber: table.pageNumber,
        tableIndex: table.tableIndex,
        html: table.html,
        markdown: table.markdown,
        plainText: table.plainText,
        rowCount: table.rowCount,
        columnCount: table.columnCount,
        warnings: table.warnings,
        createdAt: now,
      });
      inserted.push({
        tableIndex: table.tableIndex,
        pageNumber: table.pageNumber,
        tableId,
      });
    }

    return { inserted: inserted.length, tables: inserted };
  },
});

export const insertDocumentChunkBatch = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    memoryGenerationId: v.optional(v.id('documentMemoryGenerations')),
    chunks: v.array(chunkArtifactValidator),
  },
  handler: async (ctx, args) => {
    assertBatchSize(args.chunks.length);
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    await getOptionalGeneration(ctx, args.uploadedFileId, args.memoryGenerationId);
    const now = Date.now();

    for (const chunk of args.chunks) {
      assertChunkRange(chunk);
      await ctx.db.insert('documentChunks', {
        uploadedFileId: args.uploadedFileId,
        memoryGenerationId: args.memoryGenerationId,
        orgId: uploadedFile.orgId,
        accountId: uploadedFile.accountId,
        matterId: uploadedFile.matterId,
        clerkUserId: uploadedFile.clerkUserId,
        conversationId: uploadedFile.conversationId,
        caseId: uploadedFile.caseId,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        blockIds: chunk.blockIds?.length ? chunk.blockIds : undefined,
        tableIds: chunk.tableIds?.length ? chunk.tableIds : undefined,
        sectionHeading: chunk.sectionHeading,
        chunkIndex: chunk.chunkIndex,
        text: chunk.text,
        chunkText: chunk.text,
        normalizedText: chunk.text.replace(/\s+/g, ' ').trim(),
        searchText: [
          chunk.sectionHeading,
          chunk.text,
        ].filter(Boolean).join('\n\n'),
        textLength: chunk.textLength,
        startChar: chunk.startChar,
        endChar: chunk.endChar,
        paragraphRange: chunk.paragraphRange,
        citationLabel: chunk.citationLabel ?? buildCitationLabel(uploadedFile.filename, chunk),
        tokenCount: chunk.tokenCount,
        extractionMethod: uploadedFile.extractionMethod,
        warnings: chunk.warnings,
        retrievalMetadata: chunk.retrievalMetadata ?? retrievalMetadataForText(chunk.text),
        createdAt: now,
      });
    }

    return { inserted: args.chunks.length };
  },
});

export const finalizeDocumentMemory = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    pageCount: v.number(),
    chunkCount: v.number(),
    chunkingVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    const now = Date.now();

    await ctx.db.patch(args.uploadedFileId, {
      pageCount: args.pageCount,
      chunkCount: args.chunkCount,
      chunkingVersion: args.chunkingVersion,
      memoryIndexedAt: now,
      updatedAt: now,
    });

    return { pageCount: args.pageCount, chunkCount: args.chunkCount };
  },
});

/** Replace the generated alias set for a processed upload without touching its extracted text memory. */
export const replaceDocumentAliases = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    aliases: v.array(aliasArtifactValidator),
  },
  handler: async (ctx, args) => {
    assertBatchSize(args.aliases.length);
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    const existing = await ctx.db
      .query('documentAliases')
      .withIndex('by_uploaded_file', (q) => q.eq('uploadedFileId', args.uploadedFileId))
      .collect();
    for (const alias of existing) await ctx.db.delete(alias._id);

    const now = Date.now();
    for (const alias of args.aliases) {
      await ctx.db.insert('documentAliases', {
        uploadedFileId: args.uploadedFileId,
        clerkUserId: uploadedFile.clerkUserId,
        conversationId: uploadedFile.conversationId,
        caseId: uploadedFile.caseId,
        alias: alias.alias,
        normalizedAlias: alias.normalizedAlias,
        source: alias.source,
        createdAt: now,
      });
    }

    return { inserted: args.aliases.length, deleted: existing.length };
  },
});

export const markDocumentMemoryFailed = internalMutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
  },
  handler: async (ctx, args) => {
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) throw new Error('Uploaded file not found');
    const message = 'Document memory indexing did not finish.';
    const indexingError = uploadedFile.indexingError
      ? `${uploadedFile.indexingError}; ${message}`
      : message;

    await ctx.db.patch(args.uploadedFileId, {
      status: uploadedFile.status === 'ready' ? 'partial' : uploadedFile.status,
      indexingError,
      updatedAt: Date.now(),
    });

    return true;
  },
});
