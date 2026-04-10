import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthenticatedUser, getAuthenticatedUserAndConversation } from './lib/auth';

/**
 * Uploaded Files — metadata for user-uploaded documents.
 * clerkUserId is resolved from ctx.auth (Clerk JWT), not from args.
 * The actual file content lives in OpenAI's vector stores.
 *
 * Auth: server-derived. Not caller-supplied.
 */

export const create = mutation({
    args: {
        conversationId: v.optional(v.id('conversations')),
        filename: v.string(),
        mimeType: v.string(),
        openaiFileId: v.optional(v.string()),
        vectorStoreId: v.optional(v.string()),
        status: v.union(
            v.literal('uploaded'),
            v.literal('processing'),
            v.literal('ready'),
            v.literal('failed')
        ),
    },
    handler: async (ctx, args) => {
        // Server-derived auth
        const user = await getAuthenticatedUser(ctx);

        // Verify conversation ownership if provided
        if (args.conversationId) {
            await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        }

        return await ctx.db.insert('uploadedFiles', {
            clerkUserId: user.clerkId ?? '',
            conversationId: args.conversationId,
            filename: args.filename,
            mimeType: args.mimeType,
            openaiFileId: args.openaiFileId,
            vectorStoreId: args.vectorStoreId,
            status: args.status,
            createdAt: Date.now(),
        });
    },
});

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

        await ctx.db.patch(args.fileId, {
            status: args.status,
            openaiFileId: args.openaiFileId,
            vectorStoreId: args.vectorStoreId,
        });
    },
});

export const getByUser = query({
    args: {},
    handler: async (ctx) => {
        // Server-derived auth
        const user = await getAuthenticatedUser(ctx);

        return await ctx.db
            .query('uploadedFiles')
            .withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', user.clerkId ?? ''))
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
