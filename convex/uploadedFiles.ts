import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Uploaded Files — metadata for user-uploaded documents.
 * userId is a Clerk string (not v.id) for cross-service lookups.
 * The actual file content lives in OpenAI's vector stores.
 */

export const create = mutation({
    args: {
        userId: v.string(),
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
        return await ctx.db.insert('uploadedFiles', {
            ...args,
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
        const { fileId, ...fields } = args;
        await ctx.db.patch(fileId, fields);
    },
});

export const getByUser = query({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('uploadedFiles')
            .withIndex('by_userId', (q) => q.eq('userId', args.userId))
            .order('desc')
            .collect();
    },
});

export const getByConversation = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('uploadedFiles')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .order('desc')
            .collect();
    },
});
