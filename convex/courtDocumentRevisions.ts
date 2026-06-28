/**
 * Court Document Revisions — Convex Functions
 *
 * Stores revision history separately from sections.
 * Large documents don't bloat the sections table.
 */

import { v } from 'convex/values';
import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Doc } from './_generated/dataModel';

async function getAuthenticatedUser(ctx: MutationCtx | QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Not authenticated');

  const user = await ctx.db
    .query('users')
    .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
    .unique();
  if (!user) throw new Error('User not found');
  return user;
}

async function getOwnedDraft(
  ctx: MutationCtx | QueryCtx,
  documentId: string,
  userId: Doc<'users'>['_id'],
) {
  const draft = await ctx.db
    .query('courtDocumentDrafts')
    .withIndex('by_documentId', (q) => q.eq('documentId', documentId))
    .unique();
  if (!draft || draft.userId !== userId) {
    throw new Error('Not authorized');
  }
  return draft;
}

async function getOwnedSection(
  ctx: MutationCtx | QueryCtx,
  documentId: string,
  sectionId: string,
  userId: Doc<'users'>['_id'],
) {
  await getOwnedDraft(ctx, documentId, userId);
  const section = await ctx.db
    .query('courtDocumentSections')
    .withIndex('by_document_section', (q) =>
      q.eq('documentId', documentId).eq('sectionId', sectionId),
    )
    .unique();
  if (!section || section.userId !== userId) {
    throw new Error('Not authorized');
  }
  return section;
}

// ═══════════════════════════════════════════════════════════════
// Create
// ═══════════════════════════════════════════════════════════════

/** Create a revision record for a section change (before/after + diff). */
export const create = mutation({
  args: {
    documentId: v.string(),
    sectionId: v.string(),
    before: v.string(),
    after: v.string(),
    diffJson: v.optional(v.string()),
    source: v.union(
      v.literal('user_edit'),
      v.literal('ai_draft'),
      v.literal('ai_rewrite'),
    ),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    await getOwnedSection(ctx, args.documentId, args.sectionId, user._id);

    return await ctx.db.insert('courtDocumentRevisions', {
      documentId: args.documentId,
      sectionId: args.sectionId,
      userId: user._id,
      before: args.before,
      after: args.after,
      diffJson: args.diffJson,
      source: args.source,
      note: args.note,
      createdAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════════
// Read
// ═══════════════════════════════════════════════════════════════

/** List all revisions for a specific section within a document. */
export const listBySection = query({
  args: {
    documentId: v.string(),
    sectionId: v.string(),
  },
  handler: async (ctx, args) => {
    let user: Doc<'users'>;
    try {
      user = await getAuthenticatedUser(ctx);
      await getOwnedSection(ctx, args.documentId, args.sectionId, user._id);
    } catch {
      return [];
    }

    return await ctx.db
      .query('courtDocumentRevisions')
      .withIndex('by_section', (q) =>
        q.eq('documentId', args.documentId).eq('sectionId', args.sectionId),
      )
      .collect();
  },
});

/** List all revisions across all sections of a document. */
export const listByDocument = query({
  args: { documentId: v.string() },
  handler: async (ctx, args) => {
    let user: Doc<'users'>;
    try {
      user = await getAuthenticatedUser(ctx);
      await getOwnedDraft(ctx, args.documentId, user._id);
    } catch {
      return [];
    }

    return await ctx.db
      .query('courtDocumentRevisions')
      .withIndex('by_document', (q) => q.eq('documentId', args.documentId))
      .collect();
  },
});
