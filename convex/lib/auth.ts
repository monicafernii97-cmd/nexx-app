/**
 * Shared Convex Authentication Helpers
 *
 * Centralized authentication utilities used by Convex mutations and queries.
 * Prevents code duplication across conversations, documents, incidents, messages, and nexProfiles.
 */
import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

/**
 * Resolve the authenticated user from the Convex auth context.
 * Throws if not authenticated or user record not found.
 *
 * Works with both MutationCtx and QueryCtx (QueryCtx is a subset).
 */
export async function getAuthenticatedUser(ctx: MutationCtx | QueryCtx) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');
    const user = await ctx.db
        .query('users')
        .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
        .first();
    if (!user) throw new Error('User not found');
    return user;
}

/**
 * Resolve the authenticated user AND verify they own the given conversation.
 * Throws if not authenticated, user not found, or conversation not owned by user.
 */
export async function getAuthenticatedUserAndConversation(
    ctx: MutationCtx | QueryCtx,
    conversationId: Id<'conversations'>
) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const user = await ctx.db
        .query('users')
        .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
        .first();
    if (!user) throw new Error('User not found');

    const conversation = await ctx.db.get(conversationId);
    if (!conversation || conversation.userId !== user._id) {
        throw new Error('Not authorized to access this conversation');
    }

    return { user, conversation };
}

/**
 * Validate that a caseId belongs to the given user.
 * Returns the case doc if valid, throws if the case doesn't exist or is owned by another user.
 * Accepts undefined/null caseId and returns null (no-op for legacy records).
 */
export async function validateCaseOwnership(
    ctx: MutationCtx | QueryCtx,
    caseId: Id<'cases'> | undefined,
    userId: Id<'users'>
) {
    if (!caseId) return null;
    const caseDoc = await ctx.db.get(caseId);
    if (!caseDoc || caseDoc.userId !== userId) {
        throw new Error('Not authorized to use this case');
    }
    return caseDoc;
}
