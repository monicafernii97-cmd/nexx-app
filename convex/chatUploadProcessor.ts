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

async function writeDocumentMemoryArtifacts(
  ctx: ActionCtx,
  uploadedFileId: Id<'uploadedFiles'>,
  artifacts: DocumentMemoryArtifacts,
) {
  const batchSize = 40;
  await ctx.runMutation(internal.documentMemory.resetDocumentMemory, { uploadedFileId });

  for (const pages of chunkArray(artifacts.pages, batchSize)) {
    await ctx.runMutation(internal.documentMemory.insertDocumentPageBatch, {
      uploadedFileId,
      pages,
    });
  }

  for (const chunks of chunkArray(artifacts.chunks, batchSize)) {
    await ctx.runMutation(internal.documentMemory.insertDocumentChunkBatch, {
      uploadedFileId,
      chunks,
    });
  }

  await ctx.runMutation(internal.documentMemory.finalizeDocumentMemory, {
    uploadedFileId,
    pageCount: artifacts.pages.length,
    chunkCount: artifacts.chunks.length,
    chunkingVersion: artifacts.chunkingVersion,
  });
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
        await writeDocumentMemoryArtifacts(ctx, uploadedFileId, documentMemory);
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
