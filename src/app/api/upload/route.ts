import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getAuthenticatedConvexClient } from '@/lib/convexServer';
import { api } from '@convex/_generated/api';
import { createVectorStore, uploadToVectorStore } from '@/lib/nexx/fileSearch';
import { parseLegalDocument, buildDocumentMetadata } from '@/lib/nexx/parser';
import type { Id } from '@convex/_generated/dataModel';

export const maxDuration = 60;

/**
 * File Upload API Route
 * 
 * Accepts file uploads, stores in OpenAI vector store,
 * extracts legal metadata, and saves to Convex.
 * 
 * Auth: Convex mutations derive the caller from the JWT set on the
 * authenticated ConvexHttpClient — no caller-supplied userId needed.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const conversationId = formData.get('conversationId') as string | null;

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

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
    const typedConversationId = conversationId as Id<'conversations'> | undefined;

    // Create Convex record — auth derived from JWT on the ConvexHttpClient
    const fileRecordId = await convex.mutation(api.uploadedFiles.create, {
      conversationId: typedConversationId,
      filename: file.name,
      mimeType: file.type,
      status: 'processing',
    });

    try {
      // Get or create vector store for this conversation
      let vectorStoreId: string | undefined;
      if (typedConversationId) {
        const conversation = await convex.query(api.conversations.get, { id: typedConversationId });
        vectorStoreId = conversation?.vectorStoreId ?? undefined;
      }

      if (!vectorStoreId) {
        vectorStoreId = await createVectorStore(`nexx-${conversationId || userId}`);
        // Persist vector store ID to conversation (auth derived from JWT)
        if (typedConversationId) {
          await convex.mutation(api.conversations.setVectorStoreId, {
            conversationId: typedConversationId,
            vectorStoreId,
          });
        }
      }

      // Parse document for metadata (text files only)
      let metadata: Record<string, string> = { source: 'user_upload', userId };
      if (file.type === 'text/plain' || file.type === 'application/pdf') {
        try {
          const text = await file.text();
          const parsed = await parseLegalDocument({ filename: file.name, text });
          metadata = buildDocumentMetadata(parsed, userId, conversationId ?? undefined);
        } catch {
          // Non-fatal — upload without metadata
        }
      }

      // Upload to OpenAI vector store (with parsed legal metadata)
      const openaiFileId = await uploadToVectorStore(
        vectorStoreId,
        file,
        metadata
      );

      // Update Convex record (auth derived from JWT)
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
      // Mark as failed (auth derived from JWT)
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
