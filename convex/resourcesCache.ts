/**
 * Resources Cache — Convex backend for the Dynamic Resource Hub.
 *
 * Stores AI-discovered local resources (court clerk, courts website, family
 * division, legal aid, nonprofits, etc.) per state + county combination.
 * Cache is permanent until the user edits their location, at which point
 * the old entry is invalidated and a fresh AI lookup populates a new one.
 */
import { action, internalMutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';

// ═══ Shared resource schema for mutations ═══

/** Validator for a single resource entry used inside the resources object. */
const resourceEntryV = v.object({
    name: v.string(),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
});

/** Validator for a resource entry without address (courts, rules, code). */
const resourceEntryNoAddrV = v.object({
    name: v.string(),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
});

/** Validator for a resource entry used in arrays (legal aid, nonprofits). */
const resourceArrayEntryV = v.object({
    name: v.string(),
    description: v.optional(v.string()),
    url: v.optional(v.string()),
    phone: v.optional(v.string()),
});

/** Full resources object validator matching the schema. */
const resourcesObjV = v.object({
    courtClerk: v.optional(resourceEntryV),
    courtsWebsite: v.optional(resourceEntryNoAddrV),
    familyDivision: v.optional(v.object({
        name: v.string(),
        description: v.optional(v.string()),
        url: v.optional(v.string()),
        address: v.optional(v.string()),
    })),
    localRules: v.optional(resourceEntryNoAddrV),
    stateFamilyCode: v.optional(resourceEntryNoAddrV),
    legalAid: v.optional(v.array(resourceArrayEntryV)),
    nonprofits: v.optional(v.array(resourceArrayEntryV)),
    caseSearch: v.optional(resourceEntryNoAddrV),
});

// ═══ Queries ═══

/** Look up cached resources for a given state + county. Returns null on cache miss. */
export const get = query({
    args: {
        state: v.string(),
        county: v.string(),
    },
    handler: async (ctx, { state, county }) => {
        return await ctx.db
            .query('resourcesCache')
            .withIndex('by_state_county', (q) =>
                q.eq('state', state).eq('county', county)
            )
            .first();
    },
});

// ═══ Internal Mutations (server-only, not callable from clients) ═══

/**
 * Insert or update cached resources for a state + county.
 * Internal mutation — only callable from Convex actions/functions, not from clients.
 * The `/api/resources/lookup` route calls this via a Convex action wrapper.
 */
export const upsert = internalMutation({
    args: {
        state: v.string(),
        county: v.string(),
        resources: resourcesObjV,
        sources: v.optional(v.array(v.string())),
    },
    handler: async (ctx, { state, county, resources, sources }) => {
        const now = Date.now();

        const existing = await ctx.db
            .query('resourcesCache')
            .withIndex('by_state_county', (q) =>
                q.eq('state', state).eq('county', county)
            )
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                resources,
                sources,
                updatedAt: now,
            });
            return existing._id;
        }

        return await ctx.db.insert('resourcesCache', {
            state,
            county,
            resources,
            sources,
            createdAt: now,
            updatedAt: now,
        });
    },
});

/**
 * Delete cached resources for a state + county.
 * Internal mutation — only callable from Convex actions/functions, not from clients.
 * Called when a user changes their location so stale data is cleared
 * before a new AI lookup is triggered.
 */
export const invalidate = internalMutation({
    args: {
        state: v.string(),
        county: v.string(),
    },
    handler: async (ctx, { state, county }) => {
        const existing = await ctx.db
            .query('resourcesCache')
            .withIndex('by_state_county', (q) =>
                q.eq('state', state).eq('county', county)
            )
            .first();

        if (existing) {
            await ctx.db.delete(existing._id);
        }
    },
});

// ═══ Public Action Wrappers (callable from API routes via ConvexHttpClient) ═══

/**
 * Public action wrapper for `upsert` — callable from API routes.
 * Forwards arguments to the internal mutation after validating auth identity.
 */
export const upsertFromServer = action({
    args: {
        state: v.string(),
        county: v.string(),
        resources: resourcesObjV,
        sources: v.optional(v.array(v.string())),
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error('Unauthenticated');
        await ctx.runMutation(internal.resourcesCache.upsert, args);
    },
});
