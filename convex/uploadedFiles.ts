import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Uploaded Files — metadata for user-uploaded documents.
 * userId is a Clerk string (not v.id) for cross-service lookups.
 * The actual file content lives in OpenAI's vector stores.
 *
 * Ownership: callerUserId must match userId for writes and reads.
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
        callerUserId: v.string(),
    },
    handler: async (ctx, args) => {
        // Verify caller matches the userId
        if (args.userId !== args.callerUserId) {
            throw new Error('Unauthorized: caller does not match userId');
        }

        // Verify conversation ownership if provided
        if (args.conversationId) {
            const conversation = await ctx.db.get(args.conversationId);
            if (!conversation) throw new Error('Conversation not found');
            if (String(conversation.userId) !== args.callerUserId) {
                throw new Error('Unauthorized: caller does not own this conversation');
            }
        }

        const { callerUserId: _caller, ...insertFields } = args;
        return await ctx.db.insert('uploadedFiles', {
            ...insertFields,
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
        callerUserId: v.string(),
    },
    handler: async (ctx, args) => {
        // Verify caller owns the file
        const file = await ctx.db.get(args.fileId);
        if (!file) throw new Error('File not found');
        if (file.userId !== args.callerUserId) {
            throw new Error('Unauthorized: caller does not own this file');
        }

        const { fileId, callerUserId: _caller, ...fields } = args;
        await ctx.db.patch(fileId, fields);
    },
});

export const getByUser = query({
    args: {
        userId: v.string(),
        callerUserId: v.string(),
    },
    handler: async (ctx, args) => {
        // Verify caller matches
        if (args.userId !== args.callerUserId) return [];

        return await ctx.db
            .query('uploadedFiles')
            .withIndex('by_userId', (q) => q.eq('userId', args.userId))
            .order('desc')
            .collect();
    },
});

export const getByConversation = query({
    args: {
        conversationId: v.id('conversations'),
        callerUserId: v.string(),
    },
    handler: async (ctx, args) => {
        // Verify conversation ownership
        const conversation = await ctx.db.get(args.conversationId);
        if (!conversation || String(conversation.userId) !== args.callerUserId) {
            return [];
        }

        return await ctx.db
            .query('uploadedFiles')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .order('desc')
            .collect();
    },
});
