"use node";

import { createHash } from 'node:crypto';
import { internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { CHAT_UPLOAD_CONFIG } from './lib/chatUploadConfig';
import { extractDocumentText, type DocumentExtractionResult } from '../src/lib/nexx/documentExtraction';
import { detectDocumentType, type DocumentDetectionResult } from '../src/lib/nexx/documentTypeDetection';
import { buildDocumentMemoryArtifacts, type DocumentMemoryArtifacts } from '../src/lib/nexx/documentChunking';
import { buildDocumentAliases } from '../src/lib/nexx/documentSelection';
import { createVectorStore, deleteVectorStore, uploadTextToVectorStore, uploadToVectorStore } from '../src/lib/nexx/fileSearch';

type ProcessingContext = {
  session: Doc<'chatUploadSessions'>;
  conversation: Doc<'conversations'> | null;
};

type ProcessingActionResult = {
  ok: boolean;
  uploadedFileId?: Id<'uploadedFiles'>;
  status: string;
  partial?: boolean;
  error?: string;
};

type WorkerExtractionResponse = {
  status: 'succeeded' | 'failed';
  attachmentId: string;
  detectedType?: string;
  sha256?: string;
  text?: string;
  metadata?: {
    charCount?: number;
    pageCount?: number;
    extractionMethod?: string;
    hasOcr?: boolean;
    warnings?: string[];
    workerVersion?: string;
    libreOfficeVersion?: string;
    tikaVersion?: string;
    tesseractVersion?: string;
  };
  error?: {
    code: string;
    userMessage: string;
    internalSummary?: string;
  };
};

type StoredDocumentPageRef = {
  pageNumber: number;
  pageId: Id<'documentPages'>;
};

type StoredDocumentBlockRef = {
  blockIndex: number;
  pageNumber: number;
  blockId: Id<'documentBlocks'>;
};

type StoredDocumentTableRef = {
  tableIndex: number;
  pageNumber: number;
  tableId: Id<'documentTables'>;
};

function sha256Text(text: string) {
  return createHash('sha256').update(text).digest('hex');
}

function buildChatContextText(extractedText: string) {
  const limit = CHAT_UPLOAD_CONFIG.maxDirectChatContextChars;
  if (extractedText.length <= limit) {
    return {
      chatContextText: extractedText,
      chatContextCharCount: extractedText.length,
      contextTruncated: false,
    };
  }

  const separator = '\n\n[...middle of document omitted for chat context limit...]\n\n';
  const availableTextLength = Math.max(0, limit - separator.length);
  const headLength = Math.floor(availableTextLength * 0.7);
  const tailLength = availableTextLength - headLength;
  const chatContextSegments = [
    extractedText.slice(0, headLength).trim(),
    separator,
  ];
  if (tailLength > 0) {
    chatContextSegments.push(extractedText.slice(-tailLength).trim());
  }
  const chatContextText = chatContextSegments.join('');

  return {
    chatContextText,
    chatContextCharCount: chatContextText.length,
    contextTruncated: true,
  };
}

function buildProcessingFile(blob: Blob, filename: string, mimeType: string) {
  return new File([blob], filename, { type: mimeType || blob.type || 'application/octet-stream' });
}

function chunkArray<T>(items: T[], batchSize: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

function uniqueNumbers(numbers: number[]) {
  return Array.from(new Set(numbers));
}

function pageRefsForPageNumbers(pageRefs: StoredDocumentPageRef[], pageNumbers: number[]) {
  const neededPageNumbers = new Set(pageNumbers);
  return pageRefs.filter((pageRef) => neededPageNumbers.has(pageRef.pageNumber));
}

function blockRefsForTables(blockRefs: StoredDocumentBlockRef[], tables: DocumentMemoryArtifacts['tables']) {
  const needed = new Set(
    tables
      .filter((table) => table.blockIndex !== undefined)
      .map((table) => `${table.pageNumber}:${table.blockIndex}`),
  );
  return blockRefs.filter((blockRef) => needed.has(`${blockRef.pageNumber}:${blockRef.blockIndex}`));
}

function extractionAttemptExtractor(args: {
  detectedType?: string;
  extension: string;
  extractionMethod?: string;
  ocrProvider?: DocumentExtractionResult['ocrProvider'];
}): 'native_pdf' | 'native_docx' | 'native_txt' | 'mistral_ocr_4' | 'manual_upload' {
  if (args.ocrProvider === 'mistral' || args.extractionMethod === 'mistral_ocr_4') {
    return 'mistral_ocr_4';
  }
  const type = (args.detectedType || args.extension).toLowerCase();
  if (type === 'pdf') return 'native_pdf';
  if (type === 'docx') return 'native_docx';
  if (type === 'txt' || type === 'text') return 'native_txt';
  return 'manual_upload';
}

function usedMistralOcr(extraction: DocumentExtractionResult) {
  return extraction.ocrProvider === 'mistral' || extraction.method === 'mistral_ocr_4';
}

function extractionAttemptProvider(extraction: DocumentExtractionResult) {
  return usedMistralOcr(extraction) ? 'mistral' as const : 'internal' as const;
}

function extractionPlanForResult(extraction: DocumentExtractionResult) {
  const usedMistral = usedMistralOcr(extraction);
  return {
    nativeExtraction: true,
    mistralOcr: usedMistral,
    ocrModel: extraction.ocrModel,
    includeBlocks: usedMistral ? true : false,
    tableFormat: usedMistral ? 'html' as const : undefined,
    confidenceGranularity: usedMistral ? 'page' as const : undefined,
  };
}

function extractionRequestConfigRedacted(extraction: DocumentExtractionResult) {
  const usedMistral = usedMistralOcr(extraction);
  return {
    detectedType: extraction.detectedType,
    extractionMethod: extraction.method,
    ocrAttempted: extraction.ocrAttempted ?? false,
    ocrProvider: extraction.ocrProvider,
    ocrModel: extraction.ocrModel,
    ocrRequestMode: extraction.ocrRequestMode,
    includeBlocks: usedMistral ? true : undefined,
    tableFormat: usedMistral ? 'html' : undefined,
    confidenceGranularity: usedMistral ? 'page' : undefined,
    blocksDetected: extraction.ocrBlocksDetected,
    tablesDetected: extraction.ocrTablesDetected,
  };
}

async function writeDocumentMemoryArtifacts(
  ctx: ActionCtx,
  context: ProcessingContext,
  uploadedFileId: Id<'uploadedFiles'>,
  artifacts: DocumentMemoryArtifacts,
  extraction: DocumentExtractionResult,
  extractionStartedAt: number,
) {
  const batchSize = 40;
  const generation = await ctx.runMutation(internal.documentMemoryGenerations.createGeneration, {
    uploadedFileId,
    reason: 'initial_upload',
    sourceFileHash: context.session.storageSha256,
    pagesExpected: extraction.pagesTotal ?? artifacts.pages.length,
    warnings: artifacts.warnings,
    extractionPlan: {
      ...extractionPlanForResult(extraction),
    },
  }) as {
    memoryGenerationId: Id<'documentMemoryGenerations'>;
    generationNumber: number;
  };
  let generationMarkedFailed = false;

  try {
    await ctx.runMutation(internal.documentMemoryGenerations.recordExtractionAttempt, {
      uploadedFileId,
      memoryGenerationId: generation.memoryGenerationId,
      extractor: extractionAttemptExtractor({
        detectedType: extraction.detectedType,
        extension: context.session.extension,
        extractionMethod: extraction.method,
        ocrProvider: extraction.ocrProvider,
      }),
      extractorVersion: buildExtractionVersion(),
      provider: extractionAttemptProvider(extraction),
      modelId: extraction.ocrModel,
      modelVersion: extraction.ocrModel,
      status: artifacts.pages.length > 0 && artifacts.chunks.length > 0 ? 'succeeded' : 'empty',
      startedAt: extractionStartedAt,
      finishedAt: Date.now(),
      pageCountAttempted: extraction.pagesTotal ?? artifacts.pages.length,
      pageCountSucceeded: extraction.pagesOcrProcessed ?? artifacts.pages.length,
      averageConfidence: extraction.ocrAverageConfidence,
      minConfidence: extraction.ocrMinConfidence,
      warnings: extraction.warnings ?? [],
      errorCode: extraction.errorCode,
      errorMessage: extraction.error,
      providerRequestId: extraction.ocrProviderRequestId,
      usagePages: extraction.ocrUsagePages,
      usageBytes: extraction.ocrUsageBytes ?? context.session.byteSize,
      estimatedCostUsd: extraction.estimatedOcrCostUsd,
      requestConfigRedacted: extractionRequestConfigRedacted(extraction),
    });

    const storedPageRefs: StoredDocumentPageRef[] = [];
    for (const pages of chunkArray(artifacts.pages, batchSize)) {
      const result = await ctx.runMutation(internal.documentMemory.insertDocumentPageBatch, {
        uploadedFileId,
        memoryGenerationId: generation.memoryGenerationId,
        pages,
      }) as { pages: StoredDocumentPageRef[] };
      storedPageRefs.push(...result.pages);
    }

    const storedBlockRefs: StoredDocumentBlockRef[] = [];
    for (const blocks of chunkArray(artifacts.blocks, batchSize)) {
      const result = await ctx.runMutation(internal.documentMemory.insertDocumentBlockBatch, {
        uploadedFileId,
        memoryGenerationId: generation.memoryGenerationId,
        pageRefs: pageRefsForPageNumbers(storedPageRefs, uniqueNumbers(blocks.map((block) => block.pageNumber))),
        blocks,
      }) as { blocks: StoredDocumentBlockRef[] };
      storedBlockRefs.push(...result.blocks);
    }
    const blockIdByIndex = new Map(storedBlockRefs.map((block) => [block.blockIndex, block.blockId]));

    const storedTableRefs: StoredDocumentTableRef[] = [];
    for (const tables of chunkArray(artifacts.tables, batchSize)) {
      const result = await ctx.runMutation(internal.documentMemory.insertDocumentTableBatch, {
        uploadedFileId,
        memoryGenerationId: generation.memoryGenerationId,
        pageRefs: pageRefsForPageNumbers(storedPageRefs, uniqueNumbers(tables.map((table) => table.pageNumber))),
        blockRefs: blockRefsForTables(storedBlockRefs, tables),
        tables,
      }) as { tables: StoredDocumentTableRef[] };
      storedTableRefs.push(...result.tables);
    }
    const tableIdByIndex = new Map(storedTableRefs.map((table) => [table.tableIndex, table.tableId]));

    const chunksForStorage = artifacts.chunks.map((chunk) => {
      const { blockIndexes, tableIndexes, ...chunkWithoutLocalRefs } = chunk;
      const localBlockIndexes = uniqueNumbers(blockIndexes ?? []);
      const localTableIndexes = uniqueNumbers(tableIndexes ?? []);
      const missingBlockIndexes = localBlockIndexes.filter((blockIndex) => !blockIdByIndex.has(blockIndex));
      const missingTableIndexes = localTableIndexes.filter((tableIndex) => !tableIdByIndex.has(tableIndex));

      if (missingBlockIndexes.length > 0 || missingTableIndexes.length > 0) {
        throw new Error(
          `Document memory chunk references missing persisted artifacts: blocks=${missingBlockIndexes.join(',')}; tables=${missingTableIndexes.join(',')}`,
        );
      }

      return {
        ...chunkWithoutLocalRefs,
        blockIds: localBlockIndexes.map((blockIndex) => blockIdByIndex.get(blockIndex)!),
        tableIds: localTableIndexes.map((tableIndex) => tableIdByIndex.get(tableIndex)!),
      };
    });

    for (const chunks of chunkArray(chunksForStorage, batchSize)) {
      await ctx.runMutation(internal.documentMemory.insertDocumentChunkBatch, {
        uploadedFileId,
        memoryGenerationId: generation.memoryGenerationId,
        chunks,
      });
    }

    const activation = await ctx.runMutation(internal.documentMemoryGenerations.validateAndActivateGeneration, {
      uploadedFileId,
      memoryGenerationId: generation.memoryGenerationId,
      pageCount: artifacts.pages.length,
      chunkCount: artifacts.chunks.length,
      chunkingVersion: artifacts.chunkingVersion,
      warnings: artifacts.warnings,
    }) as { activated: boolean; failedChecks: string[] };

    if (!activation.activated) {
      generationMarkedFailed = true;
      throw new Error(`Document memory generation validation failed: ${activation.failedChecks.join(', ')}`);
    }
  } catch (error) {
    if (!generationMarkedFailed) {
      await ctx.runMutation(internal.documentMemoryGenerations.failGeneration, {
        uploadedFileId,
        memoryGenerationId: generation.memoryGenerationId,
        failedReason: error instanceof Error ? error.message : String(error),
      });
    }
    throw error;
  }

  return generation;
}

function getLegacyDocWorkerConfig() {
  const enabled = process.env.ENABLE_LEGACY_DOC_EXTRACTION === 'true';
  const url = process.env.DOCUMENT_WORKER_URL?.replace(/\/+$/, '');
  const token = process.env.DOCUMENT_WORKER_TOKEN;
  return { enabled, url, token };
}

function buildExtractionVersion(worker?: WorkerExtractionResponse['metadata']) {
  return [
    'nexx-extractor-v2',
    worker?.workerVersion ? `worker:${worker.workerVersion}` : undefined,
    worker?.libreOfficeVersion ? `libreoffice:${worker.libreOfficeVersion}` : undefined,
    worker?.tikaVersion ? `tika:${worker.tikaVersion}` : undefined,
    worker?.tesseractVersion ? `tesseract:${worker.tesseractVersion}` : undefined,
  ].filter(Boolean).join(';');
}

async function extractLegacyDocWithWorker(
  ctx: ActionCtx,
  context: ProcessingContext,
  detection: DocumentDetectionResult,
): Promise<DocumentExtractionResult> {
  const config = getLegacyDocWorkerConfig();
  if (!config.enabled) {
    return {
      error: 'Legacy .doc support is being prepared. Please upload DOCX or PDF for now.',
      errorCode: 'WORKER_UNAVAILABLE',
      detectedType: 'doc',
      warnings: detection.warnings,
    };
  }
  if (!config.url || !config.token) {
    return {
      error: 'Document processing is temporarily unavailable. Please try again.',
      errorCode: 'WORKER_UNAVAILABLE',
      detectedType: 'doc',
      warnings: detection.warnings,
    };
  }
  if (!context.session.storageId) {
    return {
      error: 'Stored upload file is missing.',
      errorCode: 'UNKNOWN_EXTRACTION_ERROR',
      detectedType: 'doc',
      warnings: detection.warnings,
    };
  }

  const sourceUrl = await ctx.storage.getUrl(context.session.storageId);
  if (!sourceUrl) {
    return {
      error: 'Document processing is temporarily unavailable. Please try again.',
      errorCode: 'WORKER_UNAVAILABLE',
      detectedType: 'doc',
      warnings: detection.warnings,
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_UPLOAD_CONFIG.workerTimeoutMs);
  try {
    const response = await fetch(`${config.url}/v1/extract`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId: String(context.session._id),
        attachmentId: String(context.session._id),
        tenantId: String(context.session.caseId ?? context.session.conversationId ?? context.session.clerkUserId),
        userId: context.session.clerkUserId,
        source: {
          type: 'signed_url',
          url: sourceUrl,
          expiresAt: Date.now() + CHAT_UPLOAD_CONFIG.uploadUrlTtlMs,
        },
        originalFileName: context.session.filename,
        declaredMimeType: context.session.mimeType,
        declaredExtension: context.session.extension,
        sizeBytes: context.session.byteSize,
        options: {
          allowedTypes: ['doc'],
          enableLegacyDoc: true,
          enableOcr: process.env.ENABLE_LEGACY_DOC_OCR === 'true',
          rejectMacros: true,
          maxSizeBytes: CHAT_UPLOAD_CONFIG.maxBytes,
          timeoutMs: 60_000,
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        error: 'Document processing is temporarily unavailable. Please try again.',
        errorCode: response.status >= 500 ? 'WORKER_UNAVAILABLE' : 'CONVERSION_FAILED',
        detectedType: 'doc',
        warnings: detection.warnings,
      };
    }

    const json = await response.json() as WorkerExtractionResponse;
    if (json.status === 'failed') {
      return {
        error: json.error?.userMessage ?? 'NEXX could not read this legacy DOC file.',
        errorCode: (json.error?.code as DocumentExtractionResult['errorCode']) ?? 'CONVERSION_FAILED',
        detectedType: 'doc',
        warnings: [...detection.warnings, ...(json.metadata?.warnings ?? [])],
      };
    }

    const text = json.text?.trim() ?? '';
    if (!text) {
      return {
        error: 'NEXX could not find readable text in this document. Please upload a text-based DOCX/PDF or a clearer scan.',
        errorCode: 'EXTRACTION_EMPTY',
        detectedType: 'doc',
        warnings: [...detection.warnings, ...(json.metadata?.warnings ?? [])],
      };
    }

    return {
      text,
      method: json.metadata?.extractionMethod ?? 'doc_libreoffice_docx',
      detectedType: 'doc',
      ocrAttempted: json.metadata?.hasOcr,
      warnings: [...detection.warnings, ...(json.metadata?.warnings ?? [])],
      error: json.metadata?.hasOcr ? 'This document was read using OCR. Text may contain recognition errors.' : undefined,
    };
  } catch (error) {
    return {
      error: error instanceof DOMException && error.name === 'AbortError'
        ? 'This document took too long to convert. Please upload a smaller DOCX or PDF version.'
        : 'Document processing is temporarily unavailable. Please try again.',
      errorCode: error instanceof DOMException && error.name === 'AbortError'
        ? 'CONVERSION_TIMEOUT'
        : 'WORKER_UNAVAILABLE',
      detectedType: 'doc',
      warnings: detection.warnings,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function extractStoredDocument(
  ctx: ActionCtx,
  context: ProcessingContext,
  file: File,
  buffer: Buffer,
): Promise<DocumentExtractionResult> {
  const detection = detectDocumentType(buffer, {
    filename: context.session.filename,
    mimeType: context.session.mimeType,
  });

  if (!detection.ok) {
    return {
      error: detection.userMessage ?? 'NEXX could not read this file.',
      errorCode: detection.errorCode,
      detectedType: detection.detectedType,
      warnings: detection.warnings,
    };
  }

  if (detection.detectedType === 'doc') {
    return await extractLegacyDocWithWorker(ctx, context, detection);
  }

  return await extractDocumentText(file, { buffer, detection });
}

async function ensureVectorStore(ctx: ActionCtx, context: ProcessingContext): Promise<string> {
  const existing = context.conversation?.vectorStoreId;
  if (existing) return existing;

  const externalStoreId = await createVectorStore(`nexx-vs-${crypto.randomUUID()}`);
  let result: { vectorStoreId: string; wasSet: boolean };
  try {
    result = await ctx.runMutation(internal.chatUploads.setConversationVectorStoreForSession, {
      uploadSessionId: context.session._id,
      vectorStoreId: externalStoreId,
    }) as { vectorStoreId: string; wasSet: boolean };
  } catch (error) {
    try {
      await deleteVectorStore(externalStoreId);
    } catch {
      // Preserve the original persistence failure; vector-store cleanup is best effort.
    }
    throw error;
  }

  if (result.wasSet) return externalStoreId;

  if (result.vectorStoreId !== externalStoreId) {
    try {
      await deleteVectorStore(externalStoreId);
    } catch {
      // deleteVectorStore already treats cleanup as non-fatal.
    }
  }
  return result.vectorStoreId;
}

/** Process a stored chat upload from Convex storage. */
export const processStoredUpload = internalAction({
  args: {
    uploadSessionId: v.id('chatUploadSessions'),
  },
  handler: async (ctx, args): Promise<ProcessingActionResult> => {
    const lockId = crypto.randomUUID();
    const claim = await ctx.runMutation(internal.chatUploads.claimProcessingLock, {
      uploadSessionId: args.uploadSessionId,
      lockId,
    }) as {
      status: string;
      uploadedFileId?: Id<'uploadedFiles'>;
    };

    if (claim.status !== 'claimed') {
      return {
        ok: claim.status === 'already_done',
        status: claim.status,
        uploadedFileId: 'uploadedFileId' in claim ? claim.uploadedFileId : undefined,
      };
    }

    const context = await ctx.runQuery(internal.chatUploads.getProcessingContext, {
      uploadSessionId: args.uploadSessionId,
    });
    if (!context?.session.storageId) {
      await ctx.runMutation(internal.chatUploads.failProcessing, {
        uploadSessionId: args.uploadSessionId,
        lockId,
        status: 'failed_processing',
        errorCode: 'missing_storage',
        errorMessage: 'Stored upload file is missing.',
        retryable: true,
      });
      return { ok: false, status: 'failed_processing', error: 'Stored upload file is missing.' };
    }

    console.info('[ChatUpload] processing started', {
      uploadSessionId: args.uploadSessionId,
      attempt: context.session.processingAttempt,
      storageId: context.session.storageId,
    });

    try {
      const blob = await ctx.storage.get(context.session.storageId);
      if (!blob) {
        throw new Error('Stored upload blob was not found.');
      }

      const buffer = Buffer.from(await blob.arrayBuffer());
      const file = buildProcessingFile(new Blob([buffer], { type: context.session.mimeType }), context.session.filename, context.session.mimeType);
      const extractionStartedAt = Date.now();
      const extraction = await extractStoredDocument(ctx, context, file, buffer);
      const extractedText = extraction.text?.trim() ?? '';

      console.info('[ChatUpload] extraction completed', {
        uploadSessionId: args.uploadSessionId,
        hasText: extractedText.length > 0,
        extractionCharCount: extractedText.length,
        extractionMethod: extraction.method,
        ocrAttempted: extraction.ocrAttempted ?? false,
        pagesOcrProcessed: extraction.pagesOcrProcessed,
        pagesTotal: extraction.pagesTotal,
      });

      if (!extractedText) {
        const retryableExtractionFailure =
          extraction.errorCode === 'WORKER_UNAVAILABLE' ||
          extraction.errorCode === 'CONVERSION_TIMEOUT';
        await ctx.runMutation(internal.chatUploads.failProcessing, {
          uploadSessionId: args.uploadSessionId,
          lockId,
          status: retryableExtractionFailure ? 'failed_processing' : 'failed_empty_extraction',
          errorCode: extraction.errorCode ?? 'empty_extraction',
          errorMessage: extraction.error || 'NEXX could not read any text from this file.',
          retryable: retryableExtractionFailure,
        });
        return {
          ok: false,
          status: retryableExtractionFailure ? 'failed_processing' : 'failed_empty_extraction',
          error: extraction.error,
        };
      }

      const fullTextStorageId = await ctx.storage.store(
        new Blob([extractedText], { type: 'text/plain;charset=utf-8' }),
      );
      const fullTextSha256 = sha256Text(extractedText);
      const contextText = buildChatContextText(extractedText);

      let openaiFileId: string | undefined;
      let openaiTextFileId: string | undefined;
      let vectorStoreId: string | undefined;
      let indexingError: string | undefined;

      try {
        const ensuredVectorStoreId = await ensureVectorStore(ctx, context);
        vectorStoreId = ensuredVectorStoreId;
        const metadata = {
          source: 'user_upload' as const,
          uploadSessionId: String(args.uploadSessionId),
          originalFilename: context.session.filename,
        };
        openaiFileId = await uploadToVectorStore(ensuredVectorStoreId, file, metadata);
        openaiTextFileId = await uploadTextToVectorStore(
          ensuredVectorStoreId,
          context.session.filename,
          extractedText,
          metadata,
        );
      } catch (error) {
        indexingError = error instanceof Error ? error.message : String(error);
        console.warn('[ChatUpload] indexing partial failure', {
          uploadSessionId: args.uploadSessionId,
          errorCode: 'indexing_failed',
        });
      }

      const uploadedFileId = await ctx.runMutation(internal.chatUploads.upsertProcessedUploadedFile, {
        uploadSessionId: args.uploadSessionId,
        lockId,
        status: indexingError ? 'partial' : 'ready',
        fullTextStorageId,
        fullTextSha256,
        chatContextText: contextText.chatContextText,
        chatContextCharCount: contextText.chatContextCharCount,
        contextTruncated: contextText.contextTruncated,
        extractionMethod: extraction.method,
        detectedType: extraction.detectedType,
        extractionWarnings: extraction.warnings,
        extractionVersion: buildExtractionVersion(),
        extractionCharCount: extractedText.length,
        extractionError: extraction.error,
        indexingError,
        ocrAttempted: extraction.ocrAttempted,
        pagesOcrProcessed: extraction.pagesOcrProcessed,
        pagesTotal: extraction.pagesTotal,
        openaiFileId,
        openaiTextFileId,
        vectorStoreId,
      }) as Id<'uploadedFiles'>;

      try {
        await ctx.runMutation(internal.documentMemory.replaceDocumentAliases, {
          uploadedFileId,
          aliases: buildDocumentAliases({
            filename: context.session.filename,
            detectedType: extraction.detectedType,
          }),
        });
      } catch (error) {
        console.warn('[ChatUpload] document alias indexing failed', {
          uploadSessionId: args.uploadSessionId,
          uploadedFileId,
          errorCode: 'document_alias_indexing_failed',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      let memoryIndexingError: string | undefined;
      try {
        const documentMemory = buildDocumentMemoryArtifacts(extractedText);
        await writeDocumentMemoryArtifacts(ctx, context, uploadedFileId, documentMemory, extraction, extractionStartedAt);
        console.info('[ChatUpload] document memory indexed', {
          uploadSessionId: args.uploadSessionId,
          uploadedFileId,
          pageCount: documentMemory.pages.length,
          chunkCount: documentMemory.chunks.length,
          chunkingVersion: documentMemory.chunkingVersion,
        });
      } catch (error) {
        memoryIndexingError = error instanceof Error ? error.message : String(error);
        try {
          await ctx.runMutation(internal.documentMemory.markDocumentMemoryFailed, {
            uploadedFileId,
          });
        } catch (markError) {
          console.warn('[ChatUpload] failed to persist document memory failure state', {
            uploadSessionId: args.uploadSessionId,
            uploadedFileId,
            errorCode: 'document_memory_failure_mark_failed',
            error: markError instanceof Error ? markError.message : String(markError),
          });
        }
        console.warn('[ChatUpload] document memory indexing failed', {
          uploadSessionId: args.uploadSessionId,
          uploadedFileId,
          errorCode: 'document_memory_indexing_failed',
          error: memoryIndexingError,
        });
      }

      const memoryIndexingUserMessage = memoryIndexingError
        ? 'Document memory indexing did not finish.'
        : undefined;

      await ctx.runMutation(internal.chatUploads.completeProcessing, {
        uploadSessionId: args.uploadSessionId,
        lockId,
        status: indexingError || memoryIndexingError ? 'partial' : 'ready',
        partial: Boolean(indexingError || memoryIndexingError),
        uploadedFileId,
        indexingError: [
          indexingError,
          memoryIndexingUserMessage,
        ].filter(Boolean).join('; ') || undefined,
      });

      console.info('[ChatUpload] ready', {
        uploadSessionId: args.uploadSessionId,
        uploadedFileId,
        partial: Boolean(indexingError),
      });

      return {
        ok: true,
        uploadedFileId,
        status: indexingError || memoryIndexingError ? 'partial' : 'ready',
        partial: Boolean(indexingError || memoryIndexingError),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.chatUploads.failProcessing, {
        uploadSessionId: args.uploadSessionId,
        lockId,
        status: 'failed_processing',
        errorCode: 'processing_failed',
        errorMessage,
        retryable: true,
      });
      return { ok: false, status: 'failed_processing', error: errorMessage };
    }
  },
});
