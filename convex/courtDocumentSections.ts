/**
 * Court Document Sections — Convex Functions
 *
 * Section-level CRUD for autosave. One row per section.
 * Content is saved per-section, never as a giant JSON blob.
 */

import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// ═══════════════════════════════════════════════════════════════
// Create
// ═══════════════════════════════════════════════════════════════

/** Batch-create all sections for a draft document in a single transaction. */
export const createMany = mutation({
  args: {
    documentId: v.string(),
    sections: v.array(v.object({
      sectionId: v.string(),
      heading: v.string(),
      order: v.number(),
      content: v.string(),
      status: v.union(
        v.literal('empty'),
        v.literal('drafted'),
        v.literal('court_ready'),
        v.literal('locked'),
      ),
      source: v.union(
        v.literal('blank_template'),
        v.literal('parsed_input'),
        v.literal('user_edit'),
        v.literal('ai_draft'),
        v.literal('ai_rewrite'),
      ),
      required: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user) throw new Error('User not found');

    // Verify the parent draft belongs to this user
    const parentDraft = await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
    if (!parentDraft || parentDraft.userId !== user._id) {
      throw new Error('Not authorized');
    }

    // Reject if sections already exist for this document (prevents double-submit)
    const existing = await ctx.db
      .query('courtDocumentSections')
      .withIndex('by_document', (q) => q.eq('documentId', args.documentId))
      .first();
    if (existing) {
      throw new Error('Sections already exist for this document');
    }

    // Validate payload has no duplicate sectionIds or orders
    const seenIds = new Set<string>();
    const seenOrders = new Set<number>();
    for (const section of args.sections) {
      if (seenIds.has(section.sectionId)) {
        throw new Error(`Duplicate sectionId in payload: ${section.sectionId}`);
      }
      if (seenOrders.has(section.order)) {
        throw new Error(`Duplicate order in payload: ${section.order}`);
      }
      seenIds.add(section.sectionId);
      seenOrders.add(section.order);
    }

    const now = Date.now();
    const ids: string[] = [];

    for (const section of args.sections) {
      const id = await ctx.db.insert('courtDocumentSections', {
        documentId: args.documentId,
        userId: user._id,
        caseId: parentDraft.caseId,
        sectionId: section.sectionId,
        heading: section.heading,
        order: section.order,
        content: section.content,
        status: section.status,
        source: section.source,
        required: section.required,
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }

    return { count: ids.length };
  },
});

// ═══════════════════════════════════════════════════════════════
// Read
// ═══════════════════════════════════════════════════════════════

/** List all sections for a document, sorted by order (auth-verified). */
export const listByDocument = query({
  args: { documentId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    // Verify ownership via parent draft
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user) return [];

    const parentDraft = await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
    if (!parentDraft || parentDraft.userId !== user._id) return [];

    const sections = await ctx.db
      .query('courtDocumentSections')
      .withIndex('by_document', (q) => q.eq('documentId', args.documentId))
      .collect();

    // Return sorted by order
    return sections.sort((a, b) => a.order - b.order);
  },
});

// ═══════════════════════════════════════════════════════════════
// Update
// ═══════════════════════════════════════════════════════════════

/** Update the content, status, and source of a specific section. */
export const updateContent = mutation({
  args: {
    documentId: v.string(),
    sectionId: v.string(),
    content: v.string(),
    status: v.union(
      v.literal('empty'),
      v.literal('drafted'),
      v.literal('court_ready'),
      v.literal('locked'),
    ),
    source: v.union(
      v.literal('blank_template'),
      v.literal('parsed_input'),
      v.literal('user_edit'),
      v.literal('ai_draft'),
      v.literal('ai_rewrite'),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const section = await ctx.db
      .query('courtDocumentSections')
      .withIndex('by_document_section', (q) =>
        q.eq('documentId', args.documentId).eq('sectionId', args.sectionId),
      )
      .unique();
    if (!section) throw new Error(`Section not found: ${args.sectionId}`);

    // Verify ownership via section.userId
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user || section.userId !== user._id) throw new Error('Not authorized');

    // Reject writes to locked sections (prevents autosave from overriding lock)
    if (section.status === 'locked') throw new Error('Section is locked');

    await ctx.db.patch(section._id, {
      content: args.content,
      status: args.status,
      source: args.source,
      updatedAt: Date.now(),
    });
  },
});

/** Update only the status of a section (e.g. lock/unlock). */
export const updateStatus = mutation({
  args: {
    documentId: v.string(),
    sectionId: v.string(),
    status: v.union(
      v.literal('empty'),
      v.literal('drafted'),
      v.literal('court_ready'),
      v.literal('locked'),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const section = await ctx.db
      .query('courtDocumentSections')
      .withIndex('by_document_section', (q) =>
        q.eq('documentId', args.documentId).eq('sectionId', args.sectionId),
      )
      .unique();
    if (!section) throw new Error(`Section not found: ${args.sectionId}`);

    // Verify ownership via section.userId
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user || section.userId !== user._id) throw new Error('Not authorized');

    await ctx.db.patch(section._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

/** Reorder sections by updating their order field from an ordered ID array. */
export const reorder = mutation({
  args: {
    documentId: v.string(),
    orderedSectionIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    // Verify ownership via parent draft
    const user = await ctx.db
      .query('users')
      .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
      .unique();
    if (!user) throw new Error('User not found');

    const parentDraft = await ctx.db
      .query('courtDocumentDrafts')
      .withIndex('by_documentId', (q) => q.eq('documentId', args.documentId))
      .unique();
    if (!parentDraft || parentDraft.userId !== user._id) {
      throw new Error('Not authorized');
    }

    const sections = await ctx.db
      .query('courtDocumentSections')
      .withIndex('by_document', (q) => q.eq('documentId', args.documentId))
      .collect();

    // Validate: orderedSectionIds must be a complete permutation of existing sections
    if (args.orderedSectionIds.length !== sections.length) {
      throw new Error(
        `reorder: Expected ${sections.length} positions but received ${args.orderedSectionIds.length}`,
      );
    }
    const existingIds = new Set(sections.map(s => s.sectionId));
    const inputIds = new Set(args.orderedSectionIds);

    if (inputIds.size !== args.orderedSectionIds.length) {
      throw new Error('reorder: orderedSectionIds contains duplicates');
    }
    if (inputIds.size !== existingIds.size) {
      throw new Error(
        `reorder: Expected ${existingIds.size} section IDs but received ${inputIds.size}`,
      );
    }
    for (const id of existingIds) {
      if (!inputIds.has(id)) {
        throw new Error(`reorder: Missing section "${id}" in orderedSectionIds`);
      }
    }

    const now = Date.now();
    for (let i = 0; i < args.orderedSectionIds.length; i++) {
      const sectionId = args.orderedSectionIds[i];
      const section = sections.find(s => s.sectionId === sectionId);
      if (section && section.order !== i) {
        await ctx.db.patch(section._id, { order: i, updatedAt: now });
      }
    }
  },
});
