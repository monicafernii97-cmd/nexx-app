/**
 * detectedPatterns.ts — CRUD for the detected behavioral patterns table.
 *
 * Strict evidence rules are enforced BEFORE data reaches this module:
 *   • 3+ supporting events
 *   • 2+ distinct dates
 *   • All events source-backed against real Convex records
 *   • Neutral observable categories only
 *   • Score < 5 → never stored (only medium/high confidence)
 *
 * This module handles persistence only — validation lives in premiumAnalytics.ts
 * and the patterns API route.
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import { getAuthenticatedUser, validateCaseOwnership } from './lib/auth';

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all detected patterns for a specific case, newest first. */
export const listByCase = query({
    args: {
        caseId: v.id('cases'),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        await validateCaseOwnership(ctx, args.caseId, user._id);

        return ctx.db
            .query('detectedPatterns')
            .withIndex('by_caseId', (q) => q.eq('caseId', args.caseId))
            .order('desc')
            .collect();
    },
});

/** List patterns for a case filtered by behavior category. */
export const listByCaseAndCategory = query({
    args: {
        caseId: v.id('cases'),
        category: v.string(),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        await validateCaseOwnership(ctx, args.caseId, user._id);

        return ctx.db
            .query('detectedPatterns')
            .withIndex('by_caseId_category', (q) =>
                q.eq('caseId', args.caseId).eq('category', args.category)
            )
            .collect();
    },
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Insert a single scored pattern. Only medium/high confidence allowed. */
export const create = mutation({
    args: {
        caseId: v.id('cases'),
        title: v.string(),
        summary: v.string(),
        category: v.string(),
        eventsJson: v.string(),
        eventCount: v.number(),
        distinctDates: v.number(),
        score: v.number(),
        confidence: v.union(v.literal('medium'), v.literal('high')),
        requestId: v.string(),
        generatedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        await validateCaseOwnership(ctx, args.caseId, user._id);

        return ctx.db.insert('detectedPatterns', {
            userId: user._id,
            caseId: args.caseId,
            title: args.title,
            summary: args.summary,
            category: args.category,
            eventsJson: args.eventsJson,
            eventCount: args.eventCount,
            distinctDates: args.distinctDates,
            score: args.score,
            confidence: args.confidence,
            requestId: args.requestId,
            generatedAt: args.generatedAt,
            createdAt: Date.now(),
        });
    },
});

/**
 * Idempotent batch replace — delete all patterns for a case with the given
 * requestId, then insert the new batch. This prevents duplicate runs from
 * creating duplicate rows.
 */
export const replaceForCase = mutation({
    args: {
        caseId: v.id('cases'),
        requestId: v.string(),
        patterns: v.array(v.object({
            title: v.string(),
            summary: v.string(),
            category: v.string(),
            eventsJson: v.string(),
            eventCount: v.number(),
            distinctDates: v.number(),
            score: v.number(),
            confidence: v.union(v.literal('medium'), v.literal('high')),
            generatedAt: v.number(),
        })),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        await validateCaseOwnership(ctx, args.caseId, user._id);

        // Delete existing patterns with this requestId, validating ownership
        const existing = await ctx.db
            .query('detectedPatterns')
            .withIndex('by_requestId', (q) => q.eq('requestId', args.requestId))
            .collect();

        for (const pattern of existing) {
            if (pattern.userId !== user._id || pattern.caseId !== args.caseId) {
                throw new Error('Not authorized to replace these patterns');
            }
            await ctx.db.delete(pattern._id);
        }

        // Insert new patterns
        const now = Date.now();
        const ids = [];
        for (const p of args.patterns) {
            const id = await ctx.db.insert('detectedPatterns', {
                userId: user._id,
                caseId: args.caseId,
                title: p.title,
                summary: p.summary,
                category: p.category,
                eventsJson: p.eventsJson,
                eventCount: p.eventCount,
                distinctDates: p.distinctDates,
                score: p.score,
                confidence: p.confidence,
                requestId: args.requestId,
                generatedAt: p.generatedAt,
                createdAt: now,
            });
            ids.push(id);
        }

        return ids;
    },
});

/** Delete a single detected pattern. */
export const remove = mutation({
    args: {
        patternId: v.id('detectedPatterns'),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const pattern = await ctx.db.get(args.patternId);
        if (!pattern) throw new Error('Pattern not found');
        if (pattern.userId !== user._id) throw new Error('Not authorized');

        await ctx.db.delete(args.patternId);
    },
});

/** Delete all patterns for a case (used when refreshing). */
export const clearForCase = mutation({
    args: {
        caseId: v.id('cases'),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        await validateCaseOwnership(ctx, args.caseId, user._id);

        const patterns = await ctx.db
            .query('detectedPatterns')
            .withIndex('by_caseId', (q) => q.eq('caseId', args.caseId))
            .collect();

        for (const pattern of patterns) {
            await ctx.db.delete(pattern._id);
        }

        return patterns.length;
    },
});
