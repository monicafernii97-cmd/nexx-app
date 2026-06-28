import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';
import { getAuthenticatedUser, validateCaseOwnership } from './lib/auth';
import {
  sanitizeAuditMetadata,
  summarizeProviderUsageEvents,
} from './lib/documentTelemetry';

const DEFAULT_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_OPERATION_RECORDS = 500;
const MAX_FLAG_RECORDS = 100;

const reviewFlagTypeValidator = v.union(
  v.literal('low_confidence_ocr'),
  v.literal('missing_citation'),
  v.literal('provider_policy_blocked'),
  v.literal('manual_review_required'),
  v.literal('generation_validation_failed')
);

function boundedLookbackMs(value?: number) {
  if (value === undefined) return DEFAULT_LOOKBACK_MS;
  if (!Number.isFinite(value) || value <= 0) throw new Error('lookbackMs must be positive');
  return Math.min(value, MAX_LOOKBACK_MS);
}

function visibleAuditEvent(event: Doc<'auditEvents'>) {
  return {
    eventType: event.eventType,
    uploadedFileId: event.uploadedFileId,
    memoryGenerationId: event.memoryGenerationId,
    conversationId: event.conversationId,
    caseId: event.caseId,
    createdAt: event.createdAt,
    metadataRedacted: sanitizeAuditMetadata(event.metadataRedacted),
  };
}

function visibleReviewFlag(flag: Doc<'reviewFlags'>) {
  return {
    reviewFlagId: flag._id,
    uploadedFileId: flag.uploadedFileId,
    memoryGenerationId: flag.memoryGenerationId,
    pageId: flag.pageId,
    chunkId: flag.chunkId,
    caseId: flag.caseId,
    flagType: flag.flagType,
    severity: flag.severity,
    message: flag.message,
    resolvedAt: flag.resolvedAt,
    createdAt: flag.createdAt,
  };
}

/** Summarize document safety, cost, review, and audit signals for the current user. */
export const getOperationsSummary = query({
  args: {
    caseId: v.optional(v.id('cases')),
    lookbackMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.clerkId) throw new Error('Authenticated user is missing clerkId');
    const clerkUserId = user.clerkId;
    if (args.caseId) await validateCaseOwnership(ctx, args.caseId, user._id);

    const since = Date.now() - boundedLookbackMs(args.lookbackMs);
    const auditEvents = args.caseId
      ? await ctx.db
        .query('auditEvents')
        .withIndex('by_case_created', (q) => q.eq('caseId', args.caseId!))
        .filter((q) => q.and(
          q.eq(q.field('clerkUserId'), clerkUserId),
          q.gte(q.field('createdAt'), since)
        ))
        .order('desc')
        .take(MAX_OPERATION_RECORDS)
      : await ctx.db
        .query('auditEvents')
        .withIndex('by_clerk_created', (q) => q.eq('clerkUserId', clerkUserId))
        .filter((q) => q.gte(q.field('createdAt'), since))
        .order('desc')
        .take(MAX_OPERATION_RECORDS);

    const providerUsage = args.caseId
      ? await ctx.db
        .query('providerUsageEvents')
        .withIndex('by_case_created', (q) => q.eq('caseId', args.caseId!))
        .filter((q) => q.and(
          q.eq(q.field('clerkUserId'), clerkUserId),
          q.gte(q.field('createdAt'), since)
        ))
        .order('desc')
        .take(MAX_OPERATION_RECORDS)
      : await ctx.db
        .query('providerUsageEvents')
        .withIndex('by_clerk_created', (q) => q.eq('clerkUserId', clerkUserId))
        .filter((q) => q.gte(q.field('createdAt'), since))
        .order('desc')
        .take(MAX_OPERATION_RECORDS);

    const reviewFlags = args.caseId
      ? await ctx.db
        .query('reviewFlags')
        .withIndex('by_case_created', (q) => q.eq('caseId', args.caseId!))
        .filter((q) => q.and(
          q.eq(q.field('clerkUserId'), clerkUserId),
          q.gte(q.field('createdAt'), since)
        ))
        .order('desc')
        .take(MAX_OPERATION_RECORDS)
      : await ctx.db
        .query('reviewFlags')
        .withIndex('by_clerk_created', (q) => q.eq('clerkUserId', clerkUserId))
        .filter((q) => q.gte(q.field('createdAt'), since))
        .order('desc')
        .take(MAX_OPERATION_RECORDS);

    const auditCounts = auditEvents.reduce<Record<string, number>>((counts, event) => {
      counts[event.eventType] = (counts[event.eventType] ?? 0) + 1;
      return counts;
    }, {});
    const openReviewFlags = reviewFlags.filter((flag) => !flag.resolvedAt);
    const reviewFlagsBySeverity = openReviewFlags.reduce<Record<string, number>>((counts, flag) => {
      counts[flag.severity] = (counts[flag.severity] ?? 0) + 1;
      return counts;
    }, {});

    return {
      since,
      auditCounts,
      providerUsage: summarizeProviderUsageEvents(providerUsage),
      openReviewFlags: openReviewFlags.slice(0, 20).map(visibleReviewFlag),
      openReviewFlagCount: openReviewFlags.length,
      reviewFlagsBySeverity,
      recentAuditEvents: auditEvents.slice(0, 20).map(visibleAuditEvent),
    };
  },
});

/** List open review flags without exposing raw document text or provider payloads. */
export const listOpenReviewFlags = query({
  args: {
    caseId: v.optional(v.id('cases')),
    flagType: v.optional(reviewFlagTypeValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.clerkId) throw new Error('Authenticated user is missing clerkId');
    const clerkUserId = user.clerkId;
    if (args.caseId) await validateCaseOwnership(ctx, args.caseId, user._id);

    const limit = Math.min(Math.max(args.limit ?? 50, 1), MAX_FLAG_RECORDS);
    const flags = args.caseId
      ? await ctx.db
        .query('reviewFlags')
        .withIndex('by_case_created', (q) => q.eq('caseId', args.caseId!))
        .filter((q) => q.and(
          q.eq(q.field('clerkUserId'), clerkUserId),
          q.eq(q.field('resolvedAt'), undefined),
          args.flagType
            ? q.eq(q.field('flagType'), args.flagType)
            : q.gte(q.field('createdAt'), 0)
        ))
        .order('desc')
        .take(limit)
      : await ctx.db
        .query('reviewFlags')
        .withIndex('by_clerk_resolved_created', (q) =>
          q.eq('clerkUserId', clerkUserId).eq('resolvedAt', undefined)
        )
        .filter((q) => args.flagType
          ? q.eq(q.field('flagType'), args.flagType)
          : q.gte(q.field('createdAt'), 0)
      )
        .order('desc')
        .take(limit);

    return flags.map(visibleReviewFlag);
  },
});

/** Resolve an operational review flag after it has been handled. */
export const resolveReviewFlag = mutation({
  args: {
    reviewFlagId: v.id('reviewFlags'),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.clerkId) throw new Error('Authenticated user is missing clerkId');

    const flag = await ctx.db.get(args.reviewFlagId);
    if (!flag || flag.clerkUserId !== user.clerkId) {
      throw new Error('Review flag not found or not authorized');
    }
    if (flag.resolvedAt) return { resolved: true, resolvedAt: flag.resolvedAt };

    const resolvedAt = Date.now();
    await ctx.db.patch(flag._id, { resolvedAt });
    return { resolved: true, resolvedAt };
  },
});

/** Audit when an authorized user opens a cited source from a chat answer. */
export const recordCitationOpened = mutation({
  args: {
    chatAnswerSourceId: v.id('chatAnswerSources'),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user.clerkId) throw new Error('Authenticated user is missing clerkId');

    const source = await ctx.db.get(args.chatAnswerSourceId);
    if (!source || source.clerkUserId !== user.clerkId) {
      throw new Error('Citation source not found or not authorized');
    }

    await ctx.db.insert('auditEvents', {
      orgId: source.orgId,
      accountId: source.accountId,
      matterId: source.matterId,
      actorUserId: user._id,
      clerkUserId: user.clerkId,
      eventType: 'citation_opened',
      uploadedFileId: source.uploadedFileId,
      memoryGenerationId: source.memoryGenerationId,
      conversationId: source.conversationId,
      caseId: source.caseId,
      turnId: source.turnId,
      messageId: source.messageId,
      metadataRedacted: sanitizeAuditMetadata({
        pageStart: source.pageStart,
        pageEnd: source.pageEnd,
        citationVerifierStatus: source.citationVerifierStatus,
      }),
      createdAt: Date.now(),
    });

    return { recorded: true };
  },
});
