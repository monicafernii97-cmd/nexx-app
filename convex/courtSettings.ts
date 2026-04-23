import { mutation, query, internalMutation, action } from './_generated/server';
import { internal } from './_generated/api';
import { v } from 'convex/values';
import { getAuthenticatedUser } from './lib/auth';

// ── Mutations ──

/** Create or update court settings for the authenticated user. */
export const upsert = mutation({
    args: {
        state: v.string(),
        county: v.string(),
        courtName: v.optional(v.string()),
        judicialDistrict: v.optional(v.string()),
        assignedJudge: v.optional(v.string()),
        causeNumber: v.optional(v.string()),
        caseTitleFormat: v.optional(v.union(
            v.literal('name_v_name'),
            v.literal('in_interest_of'),
            v.literal('in_matter_of_marriage'),
            v.literal('in_re_marriage'),
            v.literal('custom')
        )),
        caseTitleCustom: v.optional(v.string()),
        respondentLegalName: v.optional(v.string()),
        petitionerLegalName: v.optional(v.string()),
        petitionerRole: v.optional(v.union(v.literal('petitioner'), v.literal('respondent'))),
        /** Primary: array of {name, age} objects */
        children: v.optional(v.array(v.object({ name: v.string(), age: v.number() }))),
        /** @deprecated — accepted for backward compat, prefer children[] */
        childName: v.optional(v.string()),
        childrenCount: v.optional(v.number()),
        childrenNames: v.optional(v.array(v.string())),
        childrenAges: v.optional(v.array(v.number())),
        formattingOverrides: v.optional(v.any()),
        profileKey: v.optional(v.string()),
        profileVersion: v.optional(v.string()),
        formattingOverridesV2: v.optional(v.object({
            pageSize: v.optional(v.union(
                v.literal('LETTER'),
                v.literal('A4'),
                v.literal('LEGAL'),
            )),
            pageMarginsPt: v.optional(v.object({
                top: v.number(),
                right: v.number(),
                bottom: v.number(),
                left: v.number(),
            })),
            defaultFont: v.optional(v.string()),
            defaultFontSizePt: v.optional(v.number()),
            lineSpacing: v.optional(v.number()),
            exhibitLabelStyle: v.optional(v.union(
                v.literal('alpha'),
                v.literal('numeric'),
                v.literal('party_numeric'),
            )),
            batesEnabled: v.optional(v.boolean()),
            certificateSeparatePage: v.optional(v.boolean()),
            timelineAsTable: v.optional(v.boolean()),
        })),
    },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);
        const now = Date.now();

        // Derive children[] from legacy parallel arrays if not provided directly
        const children = args.children
            ?? (args.childrenNames
                ? args.childrenNames.map((name, i) => ({
                    name,
                    age: args.childrenAges?.[i] ?? 0,
                }))
                : undefined);

        // Build backward-compat fields from children[]
        const childrenNames = children?.map(c => c.name);
        const childrenAges = children?.map(c => c.age);
        const childrenCount = children?.length;
        const derivedChildName = childrenNames?.filter(Boolean).join(', ') || args.childName?.trim() || undefined;

        // Validate profileKey against known registry keys.
        // This whitelist mirrors src/lib/jurisdiction/profiles/registry.ts.
        // When adding a new profile to the shared registry, add the key here too.
        const VALID_PROFILE_KEYS = new Set([
            'us-default', 'tx-default', 'tx-fort-bend-387th',
            'fl-default', 'ca-default', 'federal-default',
        ]);

        if (args.profileKey && !VALID_PROFILE_KEYS.has(args.profileKey)) {
            throw new Error(`Invalid profileKey: "${args.profileKey}". Must be one of: ${[...VALID_PROFILE_KEYS].join(', ')}`);
        }

        // Never trust client-supplied profileVersion — derive from profile key.
        // The version is always "1.0" for the current profile schema.
        const derivedProfileVersion = args.profileKey ? '1.0' : undefined;

        const normalizedArgs = {
            ...args,
            // Overwrite client profileVersion with server-derived value
            profileVersion: derivedProfileVersion,
            children,
            childrenNames,
            childrenAges,
            childrenCount,
            childName: derivedChildName,
        };

        // Validate: custom title format requires non-empty custom text
        if (args.caseTitleFormat === 'custom' && (!args.caseTitleCustom || !args.caseTitleCustom.trim())) {
            throw new Error('Custom case title text is required when format is set to "custom".');
        }

        // Check if user already has settings
        const existing = await ctx.db
            .query('userCourtSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .first();

        if (existing) {
            // Update existing — reset AI verification since settings changed
            await ctx.db.patch(existing._id, {
                ...normalizedArgs,
                aiVerified: false,
                aiVerifiedAt: undefined,
                updatedAt: now,
            });
            return existing._id;
        }

        // Create new
        return await ctx.db.insert('userCourtSettings', {
            userId: user._id,
            ...normalizedArgs,
            createdAt: now,
            updatedAt: now,
        });
    },
});

/**
 * Mark court settings as NEXXverified.
 * Internal only — cannot be called from clients.
 * Use applyNEXXverification action to trigger from API routes.
 */
export const markNEXXverified = internalMutation({
    args: {
        id: v.id('userCourtSettings'),
        formattingOverrides: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const settings = await ctx.db.get(args.id);
        if (!settings) {
            throw new Error('Court settings not found');
        }

        const now = Date.now();
        await ctx.db.patch(args.id, {
            aiVerified: true,
            aiVerifiedAt: now,
            ...(args.formattingOverrides ? { formattingOverrides: args.formattingOverrides } : {}),
            updatedAt: now,
        });
    },
});

/**
 * Public action to apply NEXXverification — gated by server secret.
 * Only the court-rules lookup API route should call this after
 * successful AI verification. Clients cannot call this without
 * knowing the VERIFICATION_SECRET.
 */
export const applyNEXXverification = action({
    args: {
        id: v.id('userCourtSettings'),
        formattingOverrides: v.optional(v.any()),
        serverSecret: v.string(),
    },
    handler: async (ctx, args) => {
        const expected = process.env.VERIFICATION_SECRET;
        if (!expected || args.serverSecret !== expected) {
            throw new Error('Not authorized — invalid verification secret');
        }

        await ctx.runMutation(internal.courtSettings.markNEXXverified, {
            id: args.id,
            formattingOverrides: args.formattingOverrides,
        });
    },
});

/** Delete court settings. */
export const remove = mutation({
    args: { id: v.id('userCourtSettings') },
    handler: async (ctx, args) => {
        const user = await getAuthenticatedUser(ctx);

        const settings = await ctx.db.get(args.id);
        if (!settings || settings.userId !== user._id) {
            throw new Error('Not authorized');
        }

        await ctx.db.delete(args.id);
    },
});

/** Grant server-side consent for AI compliance checking. */
export const grantComplianceConsent = mutation({
    args: {},
    handler: async (ctx) => {
        const user = await getAuthenticatedUser(ctx);

        const settings = await ctx.db
            .query('userCourtSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .first();

        if (!settings) {
            throw new Error('No court settings found. Save your court settings first.');
        }

        const now = Date.now();
        await ctx.db.patch(settings._id, {
            complianceConsentGrantedAt: now,
            updatedAt: now,
        });
    },
});

// ── Queries ──

/** Get the authenticated user's court settings. */
export const get = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return null;

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return null;

        return await ctx.db
            .query('userCourtSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .first();
    },
});

/**
 * Check if the authenticated user has granted compliance consent.
 * Uses ctx.auth to derive the user — no caller-supplied IDs.
 */
export const hasComplianceConsent = query({
    args: {},
    handler: async (ctx) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) return false;

        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk', (q) => q.eq('clerkId', identity.subject))
            .first();
        if (!user) return false;

        const settings = await ctx.db
            .query('userCourtSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .first();

        return !!settings?.complianceConsentGrantedAt;
    },
});
