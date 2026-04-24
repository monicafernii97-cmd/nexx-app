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

export const get = query({
  args: { documentId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
  },
});

export const listByUser = query({
  args: {
    status: v.optional(v.union(
      v.literal('drafting'),
      v.literal('preflight'),
      v.literal('ready_to_export'),
      v.literal('exported'),
      v.literal('abandoned'),
    )),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user) return [];

    const q = ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_user', (qb) => qb.eq('userId', user._id));

    const drafts = await q.collect();

    // Filter by status if provided, exclude abandoned by default
    const filtered = args.status
      ? drafts.filter(d => d.status === args.status)
      : drafts.filter(d => d.status !== 'abandoned');

    // Sort by updatedAt descending
    return filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

// ═══════════════════════════════════════════════════════════════
// Update
// ═══════════════════════════════════════════════════════════════

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

    const draft = await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
    if (!draft) throw new Error('Draft not found');

    await ctx.db.patch(draft._id, {
      status: args.status,
      completionPct: args.completionPct ?? draft.completionPct,
      updatedAt: Date.now(),
    });
  },
});

export const touch = mutation({
  args: { documentId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const draft = await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
    if (!draft) return;

    await ctx.db.patch(draft._id, {
      lastOpenedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const bumpVersion = mutation({
  args: {
    documentId: v.string(),
    completionPct: v.optional(v.number()),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const draft = await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
    if (!draft) return;

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

export const abandon = mutation({
  args: { documentId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const draft = await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
    if (!draft) return;

    await ctx.db.patch(draft._id, {
      status: 'abandoned',
      updatedAt: Date.now(),
    });
  },
});
