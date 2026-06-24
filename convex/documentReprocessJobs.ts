import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';

const reprocessReasonValidator = v.union(
  v.literal('user_requested'),
  v.literal('partial_extraction'),
  v.literal('failed_pages'),
  v.literal('parser_upgrade'),
  v.literal('ocr_upgrade'),
  v.literal('embedding_upgrade'),
  v.literal('admin_requested')
);

/** Queue a document reprocess request without re-uploading the original file. */
export const requestDocumentReprocess = mutation({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
    reason: reprocessReasonValidator,
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.clerkId) throw new Error('Authenticated user is missing clerkId');

    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile || uploadedFile.clerkUserId !== user.clerkId) {
      throw new Error('Document not found or not authorized');
    }
    if (!uploadedFile.storageId && !uploadedFile.fullTextStorageId) {
      throw new Error('Document does not have stored source material to reprocess');
    }

    const now = Date.now();
    const jobId = await ctx.db.insert('documentReprocessJobs', {
      uploadedFileId: uploadedFile._id,
      requestedByUserId: user._id,
      clerkUserId: user.clerkId,
      conversationId: uploadedFile.conversationId,
      caseId: uploadedFile.caseId,
      reason: args.reason,
      status: 'queued',
      attempt: 0,
      maxAttempts: 1,
      sourceExtractionVersion: uploadedFile.extractionVersion,
      sourceChunkingVersion: uploadedFile.chunkingVersion,
      createdAt: now,
      updatedAt: now,
    });

    return { jobId, status: 'queued' as const };
  },
});

/** List recent reprocess jobs for a stored document the current user owns. */
export const listForDocument = query({
  args: {
    uploadedFileId: v.id('uploadedFiles'),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.clerkId) throw new Error('Authenticated user is missing clerkId');

    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile || uploadedFile.clerkUserId !== user.clerkId) {
      throw new Error('Document not found or not authorized');
    }

    return await ctx.db
      .query('documentReprocessJobs')
      .withIndex('by_uploaded_file', (q) => q.eq('uploadedFileId', args.uploadedFileId))
      .order('desc')
      .take(20);
  },
});
