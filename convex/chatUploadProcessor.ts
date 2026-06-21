"use node";

import { createHash } from 'node:crypto';
import { internalAction } from './_generated/server';
import type { ActionCtx } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { CHAT_UPLOAD_CONFIG } from './lib/chatUploadConfig';
import { extractDocumentText } from '../src/lib/nexx/documentExtraction';
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
  const chatContextText = [
    extractedText.slice(0, headLength).trim(),
    separator,
    extractedText.slice(-tailLength).trim(),
  ].join('');

  return {
    chatContextText,
    chatContextCharCount: chatContextText.length,
    contextTruncated: true,
  };
}

function buildProcessingFile(blob: Blob, filename: string, mimeType: string) {
  return new File([blob], filename, { type: mimeType || blob.type || 'application/octet-stream' });
}

async function ensureVectorStore(ctx: ActionCtx, context: ProcessingContext): Promise<string> {
  const existing = context.conversation?.vectorStoreId;
  if (existing) return existing;

  const externalStoreId = await createVectorStore(`nexx-vs-${crypto.randomUUID()}`);
  const result = await ctx.runMutation(internal.chatUploads.setConversationVectorStoreForSession, {
    uploadSessionId: context.session._id,
    vectorStoreId: externalStoreId,
  }) as { vectorStoreId: string; wasSet: boolean };

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

      const file = buildProcessingFile(blob, context.session.filename, context.session.mimeType);
      const extraction = await extractDocumentText(file);
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
        await ctx.runMutation(internal.chatUploads.failProcessing, {
          uploadSessionId: args.uploadSessionId,
          lockId,
          status: 'failed_empty_extraction',
          errorCode: 'empty_extraction',
          errorMessage: extraction.error || 'NEXX could not read any text from this file.',
          retryable: false,
        });
        return { ok: false, status: 'failed_empty_extraction', error: extraction.error };
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

      await ctx.runMutation(internal.chatUploads.completeProcessing, {
        uploadSessionId: args.uploadSessionId,
        lockId,
        status: indexingError ? 'partial' : 'ready',
        partial: Boolean(indexingError),
        uploadedFileId,
        indexingError,
      });

      console.info('[ChatUpload] ready', {
        uploadSessionId: args.uploadSessionId,
        uploadedFileId,
        partial: Boolean(indexingError),
      });

      return {
        ok: true,
        uploadedFileId,
        status: indexingError ? 'partial' : 'ready',
        partial: Boolean(indexingError),
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
