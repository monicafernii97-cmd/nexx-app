/**
 * Export Assembly Queries — Dedicated backend queries for export assembly inputs.
 *
 * These queries aggregate raw records from the 5 source tables
 * (caseMemory, casePins, timelineCandidates, detectedPatterns, incidents)
 * strictly scoped to a single case. They are NOT for UI display.
 *
 * The normalization layer (getAssemblyInputs) calls these and converts
 * raw Convex docs into canonical WorkspaceNode[] + TimelineEventNode[].
 */

import { v } from 'convex/values';
import { query } from './_generated/server';
import { getAuthenticatedUser } from './lib/auth';

// ---------------------------------------------------------------------------
// Assembly Workspace Nodes (caseMemory + casePins + detectedPatterns + incidents)
// ---------------------------------------------------------------------------

/**
 * Fetch all assembly-eligible workspace data for a case.
 *
 * Returns raw docs from caseMemory, casePins, detectedPatterns, and incidents.
 * The caller is responsible for normalizing these into WorkspaceNode[].
 *
 * Filtering rules:
 * - Only records with matching caseId (strict — no null fallback)
 * - Excludes draft incidents (only confirmed)
 * - All caseMemory/casePins types included
 * - All detectedPatterns included (they're already quality-gated at insert)
 */
export const getAssemblyNodesByCase = query({
    args: {
        caseId: v.id('cases'),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        // Parallel queries for performance
        const [memories, pins, patterns, incidents] = await Promise.all([
            // caseMemory: all types, strict caseId match
            ctx.db
                .query('caseMemory')
                .withIndex('by_caseId', (q) => q.eq('caseId', args.caseId))
                .collect()
                .then(rows => rows.filter(r => r.userId === user._id)),

            // casePins: all types, strict caseId match
            ctx.db
                .query('casePins')
                .withIndex('by_caseId', (q) => q.eq('caseId', args.caseId))
                .collect()
                .then(rows => rows.filter(r => r.userId === user._id)),

            // detectedPatterns: strict caseId (required field, not optional)
            ctx.db
                .query('detectedPatterns')
                .withIndex('by_caseId', (q) => q.eq('caseId', args.caseId))
                .collect()
                .then(rows => rows.filter(r => r.userId === user._id)),

            // incidents: user+case scoped, confirmed only
            ctx.db
                .query('incidents')
                .withIndex('by_user_case', (q) =>
                    q.eq('userId', user._id).eq('caseId', args.caseId)
                )
                .collect()
                .then(rows => rows.filter(r => r.status === 'confirmed')),
        ]);

        return {
            memories,
            pins,
            patterns,
            incidents,
        };
    },
});

// ---------------------------------------------------------------------------
// Assembly Timeline Events (timelineCandidates)
// ---------------------------------------------------------------------------

/**
 * Fetch all assembly-eligible timeline events for a case.
 *
 * Returns raw timelineCandidates docs. The caller normalizes into TimelineEventNode[].
 *
 * Filtering: strict caseId match, user-owned.
 * Ordering: by createdAt (eventDate ordering done in normalization layer).
 */
export const getAssemblyEventsByCase = query({
    args: {
        caseId: v.id('cases'),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const events = await ctx.db
            .query('timelineCandidates')
            .withIndex('by_caseId', (q) => q.eq('caseId', args.caseId))
            .collect();

        // Strict user ownership filter
        return events.filter(e => e.userId === user._id);
    },
});
