/**
 * Court Document Drafts — Convex Functions
 *
 * CRUD operations for the document shell (metadata only).
 * Sections are stored in courtDocumentSections.
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// ═══════════════════════════════════════════════════════════════
// Create
// ═══════════════════════════════════════════════════════════════

/** Create a new court document draft shell with metadata. */
export const create = mutation({
  args: {
    documentId: v.string(),
    documentType: v.string(),
    title: v.optional(v.string()),
    caseId: v.optional(v.id('cases')),
    sectionCount: v.optional(v.number()),
    jurisdictionJson: v.optional(v.string()),
    source: v.optional(v.union(
      v.literal('parsed_input'),
      v.literal('manual_start'),
      v.literal('ai_generated'),
    )),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user) throw new Error('User not found');

    const now = Date.now();
    const id = await ctx.db.insert('courtDocumentDrafts', {
      userId: user._id,
      caseId: args.caseId,
      documentId: args.documentId,
      documentType: args.documentType,
      title: args.title,
      status: 'drafting',
      schemaVersion: 1,
      version: 1,
      sectionCount: args.sectionCount,
      jurisdictionJson: args.jurisdictionJson,
      source: args.source,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now,
    });

    return { _id: id, documentId: args.documentId };
  },
});

// ═══════════════════════════════════════════════════════════════
// Read
// ═══════════════════════════════════════════════════════════════

/** Fetch a single draft by documentId (ownership-verified). */
export const get = query({
  args: { documentId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const draft = await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
    if (!draft) return null;

    // Ownership check
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user || draft.userId !== user._id) return null;

    return draft;
  },
});

/** List all non-abandoned drafts for the authenticated user. */
export const listByUser = query({
  args: {
    status: v.optional(v.union(
      v.literal('drafting'),
      v.literal('preflight'),
      v.literal('ready_to_export'),
      v.literal('exported'),
      v.literal('abandoned'),
    )),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user) return [];

    const cap = Math.max(1, Math.min(args.limit ?? 50, 50));

    // Use the by_user_status compound index when a specific status is requested,
    // otherwise filter abandoned at the DB query level to reduce rows loaded.
    let drafts;
    if (args.status) {
      drafts = await ctx.db
        .query('courtDocumentDrafts')
        .withIndex('by_user_status', (qb) =>
          qb.eq('userId', user._id).eq('status', args.status!)
        )
        .collect();
    } else {
      drafts = await ctx.db
        .query('courtDocumentDrafts')
        .withIndex('by_user', (qb) => qb.eq('userId', user._id))
        .filter((q) => q.neq(q.field('status'), 'abandoned'))
        .collect();
    }

    // Sort by updatedAt descending and apply limit
    return drafts
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, cap);
  },
});

// ═══════════════════════════════════════════════════════════════
// Update
// ═══════════════════════════════════════════════════════════════

/** Update the workflow status of a draft (e.g. drafting → preflight → exported). */
export const updateStatus = mutation({
  args: {
    documentId: v.string(),
    status: v.union(
      v.literal('drafting'),
      v.literal('preflight'),
      v.literal('ready_to_export'),
      v.literal('exported'),
      v.literal('abandoned'),
    ),
    completionPct: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user) throw new Error('User not found');

    const draft = await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
    if (!draft) throw new Error('Draft not found');
    if (draft.userId !== user._id) throw new Error('Not authorized');

    await ctx.db.patch(draft._id, {
      status: args.status,
      completionPct: args.completionPct ?? draft.completionPct,
      updatedAt: Date.now(),
    });
  },
});

/** Touch a draft to refresh its lastOpenedAt timestamp. */
export const touch = mutation({
  args: { documentId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user) return;

    const draft = await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
    if (!draft || draft.userId !== user._id) return;

    await ctx.db.patch(draft._id, {
      lastOpenedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/** Increment the draft version number and optionally update completion/title. */
export const bumpVersion = mutation({
  args: {
    documentId: v.string(),
    completionPct: v.optional(v.number()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user) return;

    const draft = await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
    if (!draft || draft.userId !== user._id) return;

    await ctx.db.patch(draft._id, {
      version: draft.version + 1,
      completionPct: args.completionPct ?? draft.completionPct,
      title: args.title ?? draft.title,
      updatedAt: Date.now(),
    });
  },
});

// ═══════════════════════════════════════════════════════════════
// Soft Delete
// ═══════════════════════════════════════════════════════════════

/** Soft-delete a draft by setting its status to 'abandoned'. */
export const abandon = mutation({
  args: { documentId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user) return;

    const draft = await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
    if (!draft || draft.userId !== user._id) return;

    await ctx.db.patch(draft._id, {
      status: 'abandoned',
      updatedAt: Date.now(),
    });
  },
});
