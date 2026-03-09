import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
    // ═══ Users ═══
    users: defineTable({
        clerkId: v.optional(v.string()),
        name: v.string(),
        email: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        phone: v.optional(v.string()),
        role: v.union(
            v.literal('parent'),
            v.literal('attorney'),
            v.literal('therapist')
        ),
        state: v.optional(v.string()),
        county: v.optional(v.string()),
        childrenCount: v.optional(v.number()),
        childrenAges: v.optional(v.array(v.number())),
        custodyType: v.optional(
            v.union(
                v.literal('sole'),
                v.literal('joint'),
                v.literal('split'),
                v.literal('none'),
                v.literal('pending')
            )
        ),
        hasAttorney: v.optional(v.boolean()),
        hasTherapist: v.optional(v.boolean()),
        courtStatus: v.optional(
            v.union(
                v.literal('pending'),
                v.literal('active'),
                v.literal('closed'),
                v.literal('none')
            )
        ),
        onboardingComplete: v.boolean(),
        primaryGoals: v.optional(v.array(v.string())),
        createdAt: v.number(),
    }).index('by_clerk', ['clerkId']),

    // ═══ NEX Profiles ═══
    nexProfiles: defineTable({
        userId: v.id('users'),
        nickname: v.optional(v.string()),
        relationship: v.optional(v.string()),
        behaviors: v.array(v.string()),
        description: v.optional(v.string()),
        communicationStyle: v.optional(v.string()),
        manipulationTactics: v.optional(v.array(v.string())),
        triggerPatterns: v.optional(v.array(v.string())),
        createdAt: v.number(),
        updatedAt: v.optional(v.number()),
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
        status: v.union(v.literal('active'), v.literal('archived')),
        messageCount: v.optional(v.number()),
        lastMessageAt: v.number(),
        createdAt: v.number(),
    })
        .index('by_user', ['userId'])
        .index('by_user_status', ['userId', 'status']),

    // ═══ Messages ═══
    messages: defineTable({
        conversationId: v.id('conversations'),
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
        metadata: v.optional(v.any()),
        createdAt: v.number(),
    }).index('by_conversation', ['conversationId']),

    // ═══ Incidents (DocuVault) ═══
    incidents: defineTable({
        userId: v.id('users'),
        narrative: v.string(),
        courtSummary: v.optional(v.string()),
        category: v.union(
            v.literal('emotional_abuse'),
            v.literal('financial_abuse'),
            v.literal('parental_alienation'),
            v.literal('custody_violation'),
            v.literal('harassment'),
            v.literal('threats'),
            v.literal('manipulation'),
            v.literal('neglect'),
            v.literal('other')
        ),
        severity: v.number(),
        date: v.string(),
        time: v.string(),
        status: v.union(v.literal('draft'), v.literal('confirmed')),
        witnesses: v.optional(v.array(v.string())),
        evidence: v.optional(v.array(v.string())),
        location: v.optional(v.string()),
        childrenInvolved: v.optional(v.boolean()),
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
        type: v.union(
            v.literal('court_order'),
            v.literal('police_report'),
            v.literal('medical_record'),
            v.literal('communication_log'),
            v.literal('photo_evidence'),
            v.literal('legal_filing'),
            v.literal('other')
        ),
        content: v.optional(v.string()),
        storageId: v.optional(v.id('_storage')),
        fileUrl: v.optional(v.string()),
        mimeType: v.optional(v.string()),
        fileSize: v.optional(v.number()),
        incidentId: v.optional(v.id('incidents')),
        status: v.union(v.literal('draft'), v.literal('final')),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_user', ['userId'])
        .index('by_user_type', ['userId', 'type']),
});
