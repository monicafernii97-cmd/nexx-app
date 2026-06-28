import { internalMutation, type MutationCtx } from './_generated/server';
import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';

const DOCUMENT_MEMORY_BATCH_LIMIT = 50;
const DOCUMENT_MEMORY_RESET_BATCH_LIMIT = 100;

const pageArtifactValidator = v.object({
  pageNumber: v.number(),
  text: v.string(),
  textLength: v.number(),
  isSynthetic: v.boolean(),
  warnings: v.array(v.string()),
});

const chunkArtifactValidator = v.object({
  chunkIndex: v.number(),
  text: v.string(),
  textLength: v.number(),
  startChar: v.number(),
  endChar: v.number(),
  tokenCount: v.number(),
  sectionHeading: v.optional(v.string()),
  pageStart: v.optional(v.number()),
  pageEnd: v.optional(v.number()),
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

    for (const page of args.pages) {
      await ctx.db.insert('documentPages', {
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
    }

    return { inserted: args.pages.length };
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
        paragraphRange: undefined,
        citationLabel: buildCitationLabel(uploadedFile.filename, chunk),
        tokenCount: chunk.tokenCount,
        extractionMethod: uploadedFile.extractionMethod,
        warnings: chunk.warnings,
        retrievalMetadata: retrievalMetadataForText(chunk.text),
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
