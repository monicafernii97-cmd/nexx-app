import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser, getAuthenticatedUserAndConversation } from './lib/auth';

/**
 * Uploaded Files — metadata for user-uploaded documents.
 * clerkUserId is resolved from ctx.auth (Clerk JWT), not from args.
 * The actual file content lives in OpenAI's vector stores.
 *
 * Auth: server-derived. Not caller-supplied.
 *
 * Trust boundary:
 * - `create` accepts only client-safe fields (filename, mimeType, conversationId).
 *   Status is always set to 'uploaded' server-side — clients cannot inject
 *   openaiFileId, vectorStoreId, or terminal statuses.
 * - `updateStatus` is auth-guarded (caller must own the file) and restricted
 *   to status transitions plus provider IDs. Since ConvexHttpClient calls
 *   always go through the authenticated API route, this is server-only in practice.
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
 * Update status and attach provider IDs.
 * Auth-guarded: caller must own the file (verified via clerkUserId match).
 */
export const updateStatus = mutation({
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
        // Server-derived auth
        const user = await getAuthenticatedUser(ctx);

        // Verify caller owns the file
        const file = await ctx.db.get(args.fileId);
        if (!file) throw new Error('File not found');
        if (file.clerkUserId !== user.clerkId) {
            throw new Error('Unauthorized: caller does not own this file');
        }

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
