import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';
import { createVectorStore, uploadToVectorStore } from '@/lib/nexx/fileSearch';
import { parseLegalDocument, buildDocumentMetadata } from '@/lib/nexx/parser';
import type { Id } from '@convex/_generated/dataModel';

export const maxDuration = 60;

const MAX_PARSE_INPUT_CHARS = 8000;

/**
 * File Upload API Route
 * 
 * Accepts file uploads, stores in OpenAI vector store,
 * extracts legal metadata, and saves to Convex.
 * 
 * Auth: Convex mutations derive the caller from the JWT set on the
 * authenticated ConvexHttpClient — no caller-supplied userId needed.
 *
 * Trust boundary:
 * - `api.uploadedFiles.create` only accepts filename/mimeType/conversationId.
 *   Status is always 'uploaded' — set server-side in the mutation.
 * - `api.uploadedFiles.updateStatus` is auth-guarded (ownership check).
 * - `api.conversations.getOrCreateVectorStoreId` is atomic — no race.
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

    // Create pending Convex record (status set to 'uploaded' server-side)
    const fileRecordId = await convex.mutation(api.uploadedFiles.create, {
      conversationId: typedConversationId,
      filename: file.name,
      mimeType: file.type,
    });

    // Mark as processing
    await convex.mutation(api.uploadedFiles.updateStatus, {
      fileId: fileRecordId,
      status: 'processing',
    });

    try {
      // Atomically get-or-create vector store for this conversation
      let vectorStoreId: string | undefined;
      if (typedConversationId) {
        // Generate a candidate opaque name — only used if no store exists yet
        const candidateId = `nexx-vs-${crypto.randomUUID()}`;
        const result = await convex.mutation(api.conversations.getOrCreateVectorStoreId, {
          conversationId: typedConversationId,
          candidateId,
        });
        vectorStoreId = result.vectorStoreId;

        // Only create the external store if we won the race
        if (result.created) {
          try {
            await createVectorStore(candidateId);
          } catch (storeError) {
            // External store creation failed — roll back the Convex record
            // so the conversation doesn't keep referencing a nonexistent store
            console.error('[Upload] createVectorStore failed, rolling back:', storeError);
            await convex.mutation(api.conversations.clearVectorStoreId, {
              conversationId: typedConversationId,
              staleId: candidateId,
            });
            throw storeError;
          }
        }
      }

      if (!vectorStoreId) {
        // No conversation — create a standalone store
        vectorStoreId = `nexx-vs-${crypto.randomUUID()}`;
        await createVectorStore(vectorStoreId);
      }

      // Parse document for metadata (text files only, bounded to parser limit)
      let metadata: Record<string, string> = { source: 'user_upload' };
      if (file.type === 'text/plain' || file.type === 'application/pdf') {
        try {
          const text = await file.text();
          // Truncate to parser limit so large documents degrade gracefully
          const parseInput = text.length > MAX_PARSE_INPUT_CHARS
            ? text.slice(0, MAX_PARSE_INPUT_CHARS)
            : text;
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
      const openaiFileId = await uploadToVectorStore(
        vectorStoreId,
        file,
        metadata
      );

      // Update Convex record with provider IDs (auth-guarded)
      await convex.mutation(api.uploadedFiles.updateStatus, {
        fileId: fileRecordId,
        status: 'ready',
        openaiFileId,
        vectorStoreId,
      });

      return Response.json({
        ok: true,
        fileId: fileRecordId,
        openaiFileId,
        vectorStoreId,
        filename: file.name,
      });
    } catch (error) {
      // Mark as failed (auth-guarded)
      await convex.mutation(api.uploadedFiles.updateStatus, {
        fileId: fileRecordId,
        status: 'failed',
      });
      throw error;
    }
  } catch (error) {
    console.error('[Upload] Error:', error);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}
