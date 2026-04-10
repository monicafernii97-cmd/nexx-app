import { mutation, query, internalMutation, internalQuery, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getAuthenticatedUser, getAuthenticatedUserAndConversation } from './lib/auth';

/**
 * Uploaded Files — metadata for user-uploaded documents.
 * clerkUserId is resolved from ctx.auth (Clerk JWT), not from args.
 * The actual file content lives in OpenAI's vector stores.
 *
 * Auth: server-derived. Not caller-supplied.
 *
 * Trust boundary:
 * - `create` is a public mutation. Only accepts client-safe fields
 *   (filename, mimeType, conversationId). Status is always 'uploaded'.
 * - `updateStatusAction` is a public action (callable from ConvexHttpClient).
 *   Verifies auth + file ownership, then delegates to the internalMutation.
 * - `_updateStatusInternal` is an internalMutation (not callable from clients).
 *   Performs the actual DB patch — can set terminal statuses and provider IDs.
 */

/** Public: create a pending upload record. */
export const create = mutation({
    args: {
        conversationId: v.optional(v.id('conversations')),
        filename: v.string(),
        mimeType: v.string(),
    },
    handler: async (ctx, args) => {
        // Server-derived auth
        const user = await getAuthenticatedUser(ctx);
        if (!user.clerkId) {
            throw new Error('Authenticated user is missing clerkId');
        }
        const clerkUserId = user.clerkId;

        // Verify conversation ownership if provided
        if (args.conversationId) {
            await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        }

        // Status is always 'uploaded' — clients cannot set terminal states
        return await ctx.db.insert('uploadedFiles', {
            clerkUserId,
            conversationId: args.conversationId,
            filename: args.filename,
            mimeType: args.mimeType,
            status: 'uploaded',
            createdAt: Date.now(),
        });
    },
});

/**
 * Internal: update status and attach provider IDs.
 * NOT callable from browser clients (internalMutation).
 * Called only from updateStatusAction after auth verification.
 */
export const _updateStatusInternal = internalMutation({
    args: {
        fileId: v.id('uploadedFiles'),
        status: v.union(
            v.literal('uploaded'),
            v.literal('processing'),
            v.literal('ready'),
            v.literal('failed')
        ),
        openaiFileId: v.optional(v.string()),
        vectorStoreId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const file = await ctx.db.get(args.fileId);
        if (!file) throw new Error('File not found');

        const patch: {
            status: 'uploaded' | 'processing' | 'ready' | 'failed';
            openaiFileId?: string;
            vectorStoreId?: string;
        } = {
            status: args.status,
        };
        if (args.openaiFileId !== undefined) patch.openaiFileId = args.openaiFileId;
        if (args.vectorStoreId !== undefined) patch.vectorStoreId = args.vectorStoreId;

        await ctx.db.patch(args.fileId, patch);
    },
});

/**
 * Public action: update status (callable from ConvexHttpClient).
 * Verifies auth + file ownership, then delegates to the internalMutation.
 * Actions can call internalMutation — mutations cannot.
 */
export const updateStatus = action({
    args: {
        fileId: v.id('uploadedFiles'),
        status: v.union(
            v.literal('uploaded'),
            v.literal('processing'),
            v.literal('ready'),
            v.literal('failed')
        ),
        openaiFileId: v.optional(v.string()),
        vectorStoreId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        // Verify auth
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) {
            throw new Error('Authentication required');
        }

        // Verify file ownership via a query
        const file = await ctx.runQuery(internal.uploadedFiles._getFileForOwnership, {
            fileId: args.fileId,
        });
        if (!file) throw new Error('File not found');

        // Compare clerkId from identity with file owner
        const clerkId = identity.subject; // Clerk user ID from JWT
        if (file.clerkUserId !== clerkId) {
            throw new Error('Unauthorized: caller does not own this file');
        }

        // Delegate to internal mutation
        await ctx.runMutation(internal.uploadedFiles._updateStatusInternal, {
            fileId: args.fileId,
            status: args.status,
            openaiFileId: args.openaiFileId,
            vectorStoreId: args.vectorStoreId,
        });
    },
});

/**
 * Internal query: fetch file record for ownership check.
 * Used by updateStatus action.
 */
export const _getFileForOwnership = internalQuery({
    args: {
        fileId: v.id('uploadedFiles'),
    },
    handler: async (ctx, args) => {
        return await ctx.db.get(args.fileId);
    },
});

export const getByUser = query({
    args: {},
    handler: async (ctx) => {
        // Server-derived auth
        const user = await getAuthenticatedUser(ctx);
        if (!user.clerkId) {
            throw new Error('Authenticated user is missing clerkId');
        }
        const clerkUserId = user.clerkId;

        return await ctx.db
            .query('uploadedFiles')
            .withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
            .order('desc')
            .collect();
    },
});

export const getByConversation = query({
    args: {
        conversationId: v.id('conversations'),
    },
    handler: async (ctx, args) => {
        // Server-derived auth
        await getAuthenticatedUserAndConversation(ctx, args.conversationId);

        return await ctx.db
            .query('uploadedFiles')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .order('desc')
            .collect();
    },
});
