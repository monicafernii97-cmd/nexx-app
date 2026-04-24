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

export const createMany = mutation({
  args: {
    documentId: v.string(),
    caseId: v.optional(v.id('cases')),
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

    const now = Date.now();
    const ids: string[] = [];

    for (const section of args.sections) {
      const id = await ctx.db.insert('courtDocumentSections', {
        documentId: args.documentId,
        userId: user._id,
        caseId: args.caseId,
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

export const listByDocument = query({
  args: { documentId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

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

    await ctx.db.patch(section._id, {
      content: args.content,
      status: args.status,
      source: args.source,
      updatedAt: Date.now(),
    });
  },
});

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

    await ctx.db.patch(section._id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

export const reorder = mutation({
  args: {
    documentId: v.string(),
    orderedSectionIds: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error('Not authenticated');

    const sections = await ctx.db
      .query('courtDocumentSections')
      .withIndex('by_document', (q) => q.eq('documentId', args.documentId))
      .collect();

    const existingIds = new Set(sections.map(s => s.sectionId));
    const unknownIds = args.orderedSectionIds.filter(id => !existingIds.has(id));
    if (unknownIds.length > 0) {
      console.warn(`reorder: Unknown sectionIds ignored: ${unknownIds.join(', ')}`);
    }

    for (let i = 0; i < args.orderedSectionIds.length; i++) {
      const sectionId = args.orderedSectionIds[i];
      const section = sections.find(s => s.sectionId === sectionId);
      if (section && section.order !== i) {
        await ctx.db.patch(section._id, { order: i, updatedAt: Date.now() });
      }
    }
  },
});
