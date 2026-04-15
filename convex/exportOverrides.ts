/**
 * Export Overrides — Convex mutations & queries for the Review-Centered Assembly.
 *
 * Manages two concerns:
 * 1. **Overrides** — persisted per case/export path so human edits survive across sessions
 * 2. **Sessions** — auto-saved assembly state for crash recovery (30s interval)
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';

// ═══════════════════════════════════════════════════════════════════════════
// Override Queries
// ═══════════════════════════════════════════════════════════════════════════

/** Load overrides for a given case + export path. Returns null if none saved. */
export const getOverrides = query({
    args: {
        caseId: v.optional(v.id('cases')),
        exportPath: v.union(
            v.literal('case_summary'),
            v.literal('court_document'),
            v.literal('exhibit_document'),
        ),
    },
    handler: async (ctx, { caseId, exportPath }) => {
        const user = await getAuthenticatedUser(ctx);
        const userId = user._id;

        const results = await ctx.db
            .query('exportOverrides')
            .withIndex('by_userId_case_path', (q) =>
                q.eq('userId', userId).eq('caseId', caseId).eq('exportPath', exportPath),
            )
            .first();

        return results ?? null;
    },
});

// ═══════════════════════════════════════════════════════════════════════════
// Override Mutations
// ═══════════════════════════════════════════════════════════════════════════

/** Upsert overrides for a case + export path. Creates or replaces the entire override set. */
export const saveOverrides = mutation({
    args: {
        caseId: v.optional(v.id('cases')),
        exportPath: v.union(
            v.literal('case_summary'),
            v.literal('court_document'),
            v.literal('exhibit_document'),
        ),
        sectionOverrides: v.array(v.object({
            sectionId: v.string(),
            isLocked: v.boolean(),
            itemOrder: v.optional(v.array(v.string())),
        })),
        itemOverrides: v.array(v.object({
            nodeId: v.string(),
            editedText: v.optional(v.string()),
            forcedSection: v.optional(v.string()),
            excluded: v.optional(v.boolean()),
        })),
    },
    handler: async (ctx, { caseId, exportPath, sectionOverrides, itemOverrides }) => {
        const user = await getAuthenticatedUser(ctx);
        const userId = user._id;
        const now = Date.now();

        // Collect ALL matching records to guard against race-created duplicates
        const allMatching = await ctx.db
            .query('exportOverrides')
            .withIndex('by_userId_case_path', (q) =>
                q.eq('userId', userId).eq('caseId', caseId).eq('exportPath', exportPath),
            )
            .collect();

        if (allMatching.length > 0) {
            // Keep the first record, delete any race-created duplicates
            const [primary, ...duplicates] = allMatching;
            for (const dup of duplicates) {
                await ctx.db.delete(dup._id);
            }
            await ctx.db.patch(primary._id, {
                sectionOverrides,
                itemOverrides,
                updatedAt: now,
            });
            return primary._id;
        }

        return await ctx.db.insert('exportOverrides', {
            userId,
            caseId,
            exportPath,
            sectionOverrides,
            itemOverrides,
            createdAt: now,
            updatedAt: now,
        });
    },
});

/** Delete overrides for a case + export path (reset to AI defaults). */
export const clearOverrides = mutation({
    args: {
        caseId: v.optional(v.id('cases')),
        exportPath: v.union(
            v.literal('case_summary'),
            v.literal('court_document'),
            v.literal('exhibit_document'),
        ),
    },
    handler: async (ctx, { caseId, exportPath }) => {
        const user = await getAuthenticatedUser(ctx);
        const userId = user._id;

        // Collect all matches to clean up any race-created duplicates
        const allMatching = await ctx.db
            .query('exportOverrides')
            .withIndex('by_userId_case_path', (q) =>
                q.eq('userId', userId).eq('caseId', caseId).eq('exportPath', exportPath),
            )
            .collect();

        for (const record of allMatching) {
            await ctx.db.delete(record._id);
        }
    },
});

// ═══════════════════════════════════════════════════════════════════════════
// Session Queries & Mutations (Crash Recovery)
// ═══════════════════════════════════════════════════════════════════════════

/** Load the most recent export session for a case. */
export const getSession = query({
    args: {
        caseId: v.optional(v.id('cases')),
    },
    handler: async (ctx, { caseId }) => {
        const user = await getAuthenticatedUser(ctx);
        const userId = user._id;

        return await ctx.db
            .query('exportSessions')
            .withIndex('by_userId_case', (q) =>
                q.eq('userId', userId).eq('caseId', caseId),
            )
            .order('desc')
            .first();
    },
});

/** Create or update an export session (auto-save during review). */
export const saveSession = mutation({
    args: {
        caseId: v.optional(v.id('cases')),
        phase: v.union(
            v.literal('configuring'),
            v.literal('assembling'),
            v.literal('reviewing'),
            v.literal('drafting'),
            v.literal('completed'),
        ),
        exportRequestJson: v.string(),
        assemblyResultJson: v.optional(v.string()),
        draftOutputJson: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const userId = user._id;
        const now = Date.now();

        // Collect ALL matching sessions to guard against race-created duplicates
        const allSessions = await ctx.db
            .query('exportSessions')
            .withIndex('by_userId_case', (q) =>
                q.eq('userId', userId).eq('caseId', args.caseId),
            )
            .order('desc')
            .collect();

        // Find first non-completed session to update
        const active = allSessions.find(s => s.phase !== 'completed');

        if (active) {
            // Delete any other non-completed sessions (race duplicates)
            for (const s of allSessions) {
                if (s._id !== active._id && s.phase !== 'completed') {
                    await ctx.db.delete(s._id);
                }
            }
            await ctx.db.patch(active._id, {
                phase: args.phase,
                exportRequestJson: args.exportRequestJson,
                assemblyResultJson: args.assemblyResultJson,
                draftOutputJson: args.draftOutputJson,
                updatedAt: now,
            });
            return active._id;
        }

        return await ctx.db.insert('exportSessions', {
            userId,
            caseId: args.caseId,
            phase: args.phase,
            exportRequestJson: args.exportRequestJson,
            assemblyResultJson: args.assemblyResultJson,
            draftOutputJson: args.draftOutputJson,
            createdAt: now,
            updatedAt: now,
        });
    },
});

/** Delete a completed or abandoned session. */
export const clearSession = mutation({
    args: {
        sessionId: v.id('exportSessions'),
    },
    handler: async (ctx, { sessionId }) => {
        const user = await getAuthenticatedUser(ctx);
        const session = await ctx.db.get(sessionId);
        if (!session || session.userId !== user._id) {
            throw new Error('Not authorized to delete this session');
        }
        await ctx.db.delete(sessionId);
    },
});
