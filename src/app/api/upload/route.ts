import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';
import { createVectorStore, deleteVectorStore, uploadToVectorStore } from '@/lib/nexx/fileSearch';
import { parseLegalDocument, buildDocumentMetadata } from '@/lib/nexx/parser';
import type { Id } from '@convex/_generated/dataModel';

export const maxDuration = 60;

const MAX_PARSE_INPUT_CHARS = 8000;

/**
 * Extract text from a file for metadata parsing.
 * Uses pdf-parse for PDFs (binary → text), and file.text() for plain text.
 * Returns undefined if extraction fails or file type is unsupported.
 */
async function extractTextForMetadata(file: File): Promise<string | undefined> {
  if (file.type === 'text/plain') {
    return await file.text();
  }
  if (file.type === 'application/pdf') {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { PDFParse } = await import('pdf-parse');
      const pdf = new PDFParse({ data: new Uint8Array(buffer) });
      const result = await pdf.getText();
      return result.text;
    } catch (err) {
      console.warn('[Upload] PDF text extraction failed:', err);
      return undefined;
    }
  }
  return undefined;
}

/**
 * File Upload API Route
 * 
 * Accepts file uploads, stores in OpenAI vector store,
 * extracts legal metadata, and saves to Convex.
 * 
 * Auth: Convex mutations derive the caller from the JWT set on the
 * authenticated ConvexHttpClient — no caller-supplied userId needed.
 *
 * Vector store pattern: "create-then-persist"
 * 1. Create the external store first
 * 2. Then atomically persist via compareAndSetVectorStoreId
 * 3. If we lose the race, delete our orphan and use the winner's store
 * This guarantees vectorStoreId in Convex always points to a real store.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const formData = await req.formData();

    // Validate multipart field types before casting
    const fileEntry = formData.get('file');
    const conversationEntry = formData.get('conversationId');

    if (!(fileEntry instanceof File)) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }
    if (conversationEntry !== null && typeof conversationEntry !== 'string') {
      return Response.json({ error: 'Invalid conversationId' }, { status: 400 });
    }

    const file = fileEntry;
    const conversationId = conversationEntry;

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/jpeg',
      'image/png',
    ];
    if (!allowedTypes.includes(file.type)) {
      return Response.json(
        { error: 'Unsupported file type. Please upload PDF, DOCX, TXT, JPG, or PNG.' },
        { status: 400 }
      );
    }

    // Max 25MB
    if (file.size > 25 * 1024 * 1024) {
      return Response.json({ error: 'File too large. Maximum size is 25MB.' }, { status: 400 });
    }

    const convex = await getAuthenticatedConvexClient();
    // Normalize null → undefined so Convex v.optional() validation passes
    const typedConversationId = conversationId
      ? (conversationId as Id<'conversations'>)
      : undefined;

    // Authorize conversation BEFORE creating the upload record.
    // api.conversations.get throws for missing/unauthorized, so bad or
    // foreign IDs fail before any side effects (no orphaned upload rows).
    // Only map known auth/not-found errors — re-throw transient failures
    // so they surface as 500 via the outer catch.
    if (typedConversationId) {
      try {
        await convex.query(api.conversations.get, { id: typedConversationId });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (errorMsg.includes('Not authorized') || errorMsg.includes('Not authenticated')) {
          return Response.json({ error: 'Unauthorized access to conversation' }, { status: 403 });
        }
        if (errorMsg.includes('not found') || errorMsg.includes('Could not find')) {
          return Response.json({ error: 'Conversation not found' }, { status: 404 });
        }
        // Catch Convex v.id() validation errors (malformed ID strings)
        if (errorMsg.includes('Invalid') || errorMsg.toLowerCase().includes('validation') || errorMsg.includes('is not a valid ID')) {
          return Response.json({ error: 'Invalid conversationId' }, { status: 400 });
        }
        // Transient / network error — let the outer 500 handler deal with it
        throw err;
      }
    }

    // Create pending Convex record (status set to 'uploaded' server-side)
    const fileRecordId = await convex.mutation(api.uploadedFiles.create, {
      conversationId: typedConversationId,
      filename: file.name,
      mimeType: file.type,
    });

    // Hoist provider IDs so the failure path can include them in the
    // 'failed' status update for cleanup/audit/dedupe.
    let vectorStoreId: string | undefined;
    let openaiFileId: string | undefined;
    let createdStandaloneStoreId: string | undefined;

    try {
      // Mark as processing — inside the failure-handled block so the
      // inner catch can reliably flip the row to 'failed' on error.
      await convex.action(api.uploadedFiles.updateStatus, {
        fileId: fileRecordId,
        status: 'processing',
      });

      if (typedConversationId) {
        // Check if conversation already has a store
        const conversation = await convex.query(api.conversations.get, { id: typedConversationId });
        vectorStoreId = conversation?.vectorStoreId ?? undefined;

        if (!vectorStoreId) {
          // No store yet — create external store FIRST, then persist atomically
          const candidateId = `nexx-vs-${crypto.randomUUID()}`;
          const externalStoreId = await createVectorStore(candidateId);

          // Atomically persist — only wins if still vacant.
          // If CAS throws, clean up the orphaned external store.
          let result;
          try {
            result = await convex.mutation(api.conversations.compareAndSetVectorStoreId, {
              conversationId: typedConversationId,
              candidateId: externalStoreId,
            });
          } catch (casErr) {
            await deleteVectorStore(externalStoreId);
            throw casErr;
          }

          if (result.wasSet) {
            // We won the race
            vectorStoreId = externalStoreId;
          } else {
            // Another thread won — use the winner's store, delete our orphan
            vectorStoreId = result.vectorStoreId;
            await deleteVectorStore(externalStoreId);
          }
        }
      }

      if (!vectorStoreId) {
        // No conversation — create a standalone store
        const standaloneId = `nexx-vs-${crypto.randomUUID()}`;
        vectorStoreId = await createVectorStore(standaloneId);
        createdStandaloneStoreId = vectorStoreId;
      }

      // Extract text for metadata (text files + PDFs using pdf-parse)
      let metadata: Record<string, string> = { source: 'user_upload' };
      const extractedText = await extractTextForMetadata(file);
      if (extractedText) {
        try {
          // Truncate to parser limit so large documents degrade gracefully
          const parseInput = extractedText.length > MAX_PARSE_INPUT_CHARS
            ? extractedText.slice(0, MAX_PARSE_INPUT_CHARS)
            : extractedText;
          const parsed = await parseLegalDocument({ filename: file.name, text: parseInput });
          // Strip internal IDs before sending to external provider
          const fullMetadata = buildDocumentMetadata(parsed, userId, conversationId ?? undefined);
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { userId: _uid, conversationId: _cid, ...safeMetadata } = fullMetadata;
          metadata = safeMetadata;
        } catch (err) {
          console.warn('[Upload] Metadata extraction failed:', err);
          // Non-fatal — upload without metadata
        }
      }

      // Upload to OpenAI vector store (only non-identifying metadata)
      openaiFileId = await uploadToVectorStore(
        vectorStoreId,
        file,
        metadata
      );

      // Persist provider IDs immediately — if this fails, the catch
      // marks the row as 'failed' but the file is already indexed in the
      // vector store. The provider IDs are included in the 'failed' update
      // so they can be used for cleanup or dedupe later.
      await convex.action(api.uploadedFiles.updateStatus, {
        fileId: fileRecordId,
        status: 'ready',
        openaiFileId,
        vectorStoreId,
      });

      // Standalone store successfully used — don't clean it up
      createdStandaloneStoreId = undefined;

      return Response.json({
        ok: true,
        fileId: fileRecordId,
        openaiFileId,
        vectorStoreId,
        filename: file.name,
      });
    } catch (error) {
      // Mark file as failed — include any provider IDs we already obtained
      // so they aren't lost and can be used for cleanup/audit
      try {
        await convex.action(api.uploadedFiles.updateStatus, {
          fileId: fileRecordId,
          status: 'failed',
          openaiFileId,
          vectorStoreId,
        });
      } catch (statusErr) {
        console.error('[Upload] Failed to mark file as failed:', statusErr);
      }

      // Clean up orphaned standalone store if we created one
      if (createdStandaloneStoreId) {
        try {
          await deleteVectorStore(createdStandaloneStoreId);
        } catch (cleanupErr) {
          console.error('[Upload] Failed to clean up standalone store:', cleanupErr);
        }
      }

      throw error;
    }
  } catch (error) {
    console.error('[Upload] Error:', error);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}
