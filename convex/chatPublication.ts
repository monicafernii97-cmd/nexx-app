import { query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUserAndConversation } from './lib/auth';

/** Redacted publication receipt for authorized diagnostics and UI support. */
export const getReceiptForTurn = query({
  args: { turnId: v.id('chatTurns') },
  handler: async (ctx, args) => {
    const turn = await ctx.db.get(args.turnId);
    if (!turn) return null;
    const { user } = await getAuthenticatedUserAndConversation(ctx, turn.conversationId);
    if (turn.userId !== user._id) throw new Error('publication_receipt_scope_mismatch');
    const audit = await ctx.db.query('responsePublicationAudits')
      .withIndex('by_turn', (q) => q.eq('turnId', args.turnId))
      .order('desc')
      .first();
    if (!audit) return null;
    return {
      turnId: audit.turnId,
      planId: audit.planId,
      taskId: audit.taskId,
      focusRevision: audit.focusRevision,
      decision: audit.decision,
      rejectionCodes: audit.rejectionCodes,
      validatorVersion: audit.validatorVersion,
      createdAt: audit.createdAt,
    };
  },
});

