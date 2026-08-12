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

        // Query for existing records
        const allMatching = await ctx.db
            .query('exportOverrides')
            .withIndex('by_userId_case_path', (q) =>
                q.eq('userId', userId).eq('caseId', caseId).eq('exportPath', exportPath),
            )
            .collect();

        if (allMatching.length > 0) {
            // Update the first record, delete any duplicates
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

        // No existing record — insert then immediately verify.
        // Convex mutations are serializable (OCC with automatic retry on
        // conflict), so a true concurrent-insert race cannot occur. The
        // post-insert verification is defense-in-depth: if a duplicate is
        // somehow present, it is cleaned up within this same transaction
        // so getOverrides never observes nondeterministic rows.
        const newId = await ctx.db.insert('exportOverrides', {
            userId,
            caseId,
            exportPath,
            sectionOverrides,
            itemOverrides,
            createdAt: now,
            updatedAt: now,
        });

        // Post-insert dedup verification
        const postInsert = await ctx.db
            .query('exportOverrides')
            .withIndex('by_userId_case_path', (q) =>
                q.eq('userId', userId).eq('caseId', caseId).eq('exportPath', exportPath),
            )
            .collect();

        if (postInsert.length > 1) {
            // Keep earliest record, remove duplicates
            const sorted = postInsert.sort((a, b) => a._creationTime - b._creationTime);
            const [primary, ...duplicates] = sorted;
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

        return newId;
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

        // Query all sessions for this user+case
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
            // Delete any other non-completed sessions (duplicates)
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

        // No active session — insert then verify.
        // Convex mutations are serializable (OCC with automatic retry on
        // conflict), preventing true concurrent-insert races. The post-insert
        // verification is defense-in-depth so getSession never sees duplicates.
        const newId = await ctx.db.insert('exportSessions', {
            userId,
            caseId: args.caseId,
            phase: args.phase,
            exportRequestJson: args.exportRequestJson,
            assemblyResultJson: args.assemblyResultJson,
            draftOutputJson: args.draftOutputJson,
            createdAt: now,
            updatedAt: now,
        });

        // Post-insert dedup verification
        const postInsert = await ctx.db
            .query('exportSessions')
            .withIndex('by_userId_case', (q) =>
                q.eq('userId', userId).eq('caseId', args.caseId),
            )
            .order('desc')
            .collect();

        const activePostInsert = postInsert.filter(s => s.phase !== 'completed');
        if (activePostInsert.length > 1) {
            // Keep earliest active session, remove duplicates
            const sorted = activePostInsert.sort((a, b) => a._creationTime - b._creationTime);
            const [primary, ...duplicates] = sorted;
            for (const dup of duplicates) {
                await ctx.db.delete(dup._id);
            }
            await ctx.db.patch(primary._id, {
                phase: args.phase,
                exportRequestJson: args.exportRequestJson,
                assemblyResultJson: args.assemblyResultJson,
                draftOutputJson: args.draftOutputJson,
                updatedAt: now,
            });
            return primary._id;
        }

        return newId;
    },
});

/**
 * Atomically save the editable review state and its recovery session.
 * Identical checkpoint hashes are no-ops, and the large immutable assembly
 * payload is only rewritten when it actually changes.
 */
export const saveReviewCheckpoint = mutation({
    args: {
        caseId: v.id('cases'),
        exportPath: v.union(
            v.literal('case_summary'),
            v.literal('court_document'),
            v.literal('exhibit_document'),
        ),
        phase: v.literal('reviewing'),
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
        exportRequestJson: v.string(),
        assemblyResultJson: v.optional(v.string()),
        reviewItemsJson: v.optional(v.string()),
        clearAssemblyResult: v.optional(v.boolean()),
        clearReviewItems: v.optional(v.boolean()),
        checkpointHash: v.string(),
    },
    handler: async (ctx, input) => {
        const user = await getAuthenticatedUser(ctx);
        const ownedCase = await ctx.db.get(input.caseId);
        if (!ownedCase || ownedCase.userId !== user._id) {
            throw new Error('Not authorized to save this review checkpoint');
        }

        const now = Date.now();
        const [overrideRows, sessionRows] = await Promise.all([
            ctx.db
                .query('exportOverrides')
                .withIndex('by_userId_case_path', (q) =>
                    q.eq('userId', user._id).eq('caseId', input.caseId).eq('exportPath', input.exportPath),
                )
                .collect(),
            ctx.db
                .query('exportSessions')
                .withIndex('by_userId_case', (q) => q.eq('userId', user._id).eq('caseId', input.caseId))
                .order('desc')
                .collect(),
        ]);

        const sortedOverrideRows = [...overrideRows]
            .sort((a, b) => a._creationTime - b._creationTime);
        const override = sortedOverrideRows[0];
        const session = sessionRows.find((row) => row.phase !== 'completed');
        if (override?.checkpointHash === input.checkpointHash && session?.checkpointHash === input.checkpointHash) {
            return { changed: false, checkpointHash: input.checkpointHash };
        }

        if (override) {
            await ctx.db.patch(override._id, {
                sectionOverrides: input.sectionOverrides,
                itemOverrides: input.itemOverrides,
                checkpointHash: input.checkpointHash,
                updatedAt: now,
            });
            for (const duplicate of sortedOverrideRows.slice(1)) await ctx.db.delete(duplicate._id);
        } else {
            await ctx.db.insert('exportOverrides', {
                userId: user._id,
                caseId: input.caseId,
                exportPath: input.exportPath,
                sectionOverrides: input.sectionOverrides,
                itemOverrides: input.itemOverrides,
                checkpointHash: input.checkpointHash,
                createdAt: now,
                updatedAt: now,
            });
        }

        if (session) {
            const sessionPatch: {
                phase: 'reviewing';
                exportRequestJson: string;
                reviewItemsJson?: string;
                checkpointHash: string;
                updatedAt: number;
                assemblyResultJson?: string;
            } = {
                phase: input.phase,
                exportRequestJson: input.exportRequestJson,
                checkpointHash: input.checkpointHash,
                updatedAt: now,
            };
            if (input.clearReviewItems === true) {
                sessionPatch.reviewItemsJson = undefined;
            } else if (input.reviewItemsJson !== undefined) {
                sessionPatch.reviewItemsJson = input.reviewItemsJson;
            }
            if (input.clearAssemblyResult === true) {
                sessionPatch.assemblyResultJson = undefined;
            } else if (
                input.assemblyResultJson !== undefined
                && session.assemblyResultJson !== input.assemblyResultJson
            ) {
                sessionPatch.assemblyResultJson = input.assemblyResultJson;
            }
            await ctx.db.patch(session._id, sessionPatch);
            for (const duplicate of sessionRows) {
                if (duplicate._id !== session._id && duplicate.phase !== 'completed') {
                    await ctx.db.delete(duplicate._id);
                }
            }
        } else {
            await ctx.db.insert('exportSessions', {
                userId: user._id,
                caseId: input.caseId,
                phase: input.phase,
                exportRequestJson: input.exportRequestJson,
                ...(input.clearAssemblyResult !== true && input.assemblyResultJson !== undefined
                    ? { assemblyResultJson: input.assemblyResultJson }
                    : {}),
                ...(input.clearReviewItems !== true && input.reviewItemsJson !== undefined
                    ? { reviewItemsJson: input.reviewItemsJson }
                    : {}),
                checkpointHash: input.checkpointHash,
                createdAt: now,
                updatedAt: now,
            });
        }

        return { changed: true, checkpointHash: input.checkpointHash };
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
