import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
    // ═══ Users ═══
    users: defineTable({
        name: v.string(),
        email: v.optional(v.string()),
        role: v.union(v.literal('parent'), v.literal('attorney'), v.literal('therapist')),
        state: v.optional(v.string()),
        county: v.optional(v.string()),
        childrenCount: v.optional(v.number()),
        childrenAges: v.optional(v.string()),
        custodyType: v.optional(v.string()),
        hasAttorney: v.optional(v.string()),
        hasTherapist: v.optional(v.string()),
        courtStatus: v.optional(v.string()),
        onboardingComplete: v.boolean(),
        primaryGoals: v.optional(v.array(v.string())),
        createdAt: v.number(),
    }),

    // ═══ NEX Profiles ═══
    nexProfiles: defineTable({
        userId: v.id('users'),
        behaviors: v.array(v.string()),
        description: v.optional(v.string()),
        communicationStyle: v.optional(v.string()),
        manipulationTactics: v.optional(v.array(v.string())),
        createdAt: v.number(),
    }).index('by_user', ['userId']),

    // ═══ Conversations ═══
    conversations: defineTable({
        userId: v.id('users'),
        title: v.string(),
        mode: v.union(
            v.literal('therapeutic'),
            v.literal('legal'),
            v.literal('strategic'),
            v.literal('general')
        ),
        lastMessageAt: v.number(),
        createdAt: v.number(),
    }).index('by_user', ['userId']),

    // ═══ Messages ═══
    messages: defineTable({
        conversationId: v.id('conversations'),
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
        createdAt: v.number(),
    }).index('by_conversation', ['conversationId']),

    // ═══ Incidents (DocuVault) ═══
    incidents: defineTable({
        userId: v.id('users'),
        narrative: v.string(),
        courtSummary: v.optional(v.string()),
        category: v.string(),
        severity: v.number(),
        date: v.string(),
        time: v.string(),
        status: v.union(v.literal('draft'), v.literal('confirmed')),
        aiAnalysis: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_user', ['userId'])
        .index('by_user_date', ['userId', 'date']),

    // ═══ Documents ═══
    documents: defineTable({
        userId: v.id('users'),
        title: v.string(),
        type: v.string(),
        content: v.optional(v.string()),
        fileUrl: v.optional(v.string()),
        status: v.union(v.literal('draft'), v.literal('final')),
        createdAt: v.number(),
        updatedAt: v.number(),
    }).index('by_user', ['userId']),
});
