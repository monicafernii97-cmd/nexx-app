import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthenticatedUserAndConversation } from './lib/auth';
import {
    detectDocumentReference,
    type DocumentReferenceDetection,
} from '../src/lib/nexx/documentReferenceDetection';
import { resolveTurnRoute } from '../src/lib/nexx/router';
import type { RouteMode } from '../src/lib/types';
import { buildContextualDocumentFollowUpMessage } from '../src/lib/nexx/followUpContext';
import { summarizeActiveLegalIssue } from '../src/lib/nexx/legal-engine/activeIssueContract';
import {
    compactConversationMemoryContent,
    shouldInvalidateConversationSummary,
} from '../src/lib/nexx/conversationMemoryPolicy';
import {
    detectStoredDocumentAmbiguity,
    normalizeDocumentAlias,
    selectStoredDocumentCandidates,
} from '../src/lib/nexx/documentSelection';
import {
    buildDocumentChunkSearchQuery,
    retrieveRelevantDocumentChunks,
} from '../src/lib/nexx/documentChunkRetrieval';
import {
    canUseDocumentMemoryCandidate,
    resolveDocumentMemorySource,
    type DocumentAccessScope,
    type DocumentMemorySource,
} from '../src/lib/nexx/documentAccess';
import {
    getDailyLimit,
    PRIMARY_MODEL,
} from '../src/lib/tiers';
import {
    ANALYSIS_STATUS_UI_KIND,
    ASSISTANT_ANSWER_UI_KIND,
    SAFE_ANALYSIS_DRAFT_MESSAGE,
} from '../src/lib/chat/analysisStatus';
import { looksLikeInternalStructuredPayload } from '../src/lib/chat/internalLeakGuard';
import {
    buildChatRegenerationPlan,
    type ChatRegenerationMode,
    type ChatRegenerationPlan,
} from '../src/lib/chat/regeneration';
import {
    CHAT_RATE_LIMIT_WINDOW_MS,
    chatRateLimitKeyForModel,
    fixedWindowStartMs,
    userSubscriptionTier,
} from './lib/chatRateLimitPolicy';
import { normalizeReviewFlagMessage, sanitizeAuditMetadata } from './lib/documentTelemetry';
import { routeModeValidator } from './lib/routeModeValidator';

const TURN_LOCK_TTL_MS = 3 * 60 * 1000;
const JOB_LEASE_TTL_MS = 2 * 60 * 1000;
const JOB_RETRY_DELAY_MS = 5_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const DOCUMENT_RETRIEVAL_AUDIT_RETENTION_MS = 30 * ONE_DAY_MS;
const DOCUMENT_RETRIEVAL_AUDIT_CLEANUP_BATCH_SIZE = 1000;
const MAX_EXPLICIT_ALIAS_LOOKUP_TERMS = 60;
const MAX_ALIAS_MATCHES_PER_TERM = 8;
const MAX_EXPLICIT_ALIAS_MATCHED_FILES = 50;
const MAX_DOCUMENT_CHUNKS_TO_SCAN_PER_FILE = 300;
const MAX_DOCUMENT_CHUNKS_FROM_SEARCH_PER_FILE = 80;
const MAX_RETRIEVED_CHUNKS_PER_FILE = 12;

const documentEvidenceSourceValidator = v.object({
    uploadedFileId: v.id('uploadedFiles'),
    filename: v.string(),
    source: v.union(
        v.literal('current_turn'),
        v.literal('conversation_memory'),
        v.literal('case_memory'),
        v.literal('user_private_memory'),
        v.literal('shared_memory')
    ),
    status: v.string(),
    extractionMethod: v.optional(v.string()),
    contextCharCount: v.optional(v.number()),
    contextTruncated: v.optional(v.boolean()),
});

const verifiedDocumentCitationValidator = v.object({
    sourceId: v.string(),
    chunkId: v.id('documentChunks'),
    quotedText: v.string(),
    citationVerifierStatus: v.union(v.literal('verified'), v.literal('partial')),
});

const turnModeValidator = v.union(v.literal('send'), v.literal('retry'), v.literal('edit'));

const attachmentRefValidator = v.object({
    uploadedFileId: v.id('uploadedFiles'),
    uploadSessionId: v.id('chatUploadSessions'),
    storageId: v.id('_storage'),
    filename: v.string(),
    mimeType: v.string(),
    byteSize: v.number(),
    status: v.union(v.literal('ready'), v.literal('partial')),
});

/**
 * Treat retryable failures as terminal for this worker attempt.
 * The user can retry by creating a fresh turn, but this specific turn should
 * leave the active-turn list so the composer can recover.
 */
function isTerminalTurnStatus(status: string) {
    return [
        'assistant_saved',
        'degraded_saved',
        'failed_retryable',
        'failed_final',
        'cancelled',
    ].includes(status);
}

/** Build the stable request id used for an assistant message in a turn. */
function assistantRequestId(requestId: string) {
    return `${requestId}-assistant`;
}

async function insertChatAuditEvent(
    ctx: MutationCtx,
    args: {
        eventType: 'chat_question_asked' | 'chat_answer_generated' | 'access_denied';
        user: Doc<'users'>;
        conversationId: Id<'conversations'>;
        caseId?: Id<'cases'>;
        turnId?: Id<'chatTurns'>;
        messageId?: Id<'messages'>;
        metadataRedacted?: unknown;
    }
) {
    await ctx.db.insert('auditEvents', {
        actorUserId: args.user._id,
        clerkUserId: args.user.clerkId,
        eventType: args.eventType,
        conversationId: args.conversationId,
        caseId: args.caseId,
        turnId: args.turnId,
        messageId: args.messageId,
        metadataRedacted: sanitizeAuditMetadata(args.metadataRedacted),
        createdAt: Date.now(),
    });
}

async function insertOpenReviewFlagOnce(
    ctx: MutationCtx,
    args: {
        orgId?: string;
        accountId?: string;
        matterId?: string;
        clerkUserId: string;
        uploadedFileId: Id<'uploadedFiles'>;
        memoryGenerationId?: Id<'documentMemoryGenerations'>;
        caseId?: Id<'cases'>;
        chunkId?: Id<'documentChunks'>;
        flagType:
            | 'low_confidence_ocr'
            | 'missing_citation'
            | 'provider_policy_blocked'
            | 'manual_review_required'
            | 'generation_validation_failed';
        severity: 'low' | 'medium' | 'high';
        message: string;
        createdAt: number;
    }
) {
    const existing = await ctx.db
        .query('reviewFlags')
        .withIndex('by_clerk_created', (q) => q.eq('clerkUserId', args.clerkUserId))
        .filter((q) => q.and(
            q.eq(q.field('uploadedFileId'), args.uploadedFileId),
            q.eq(q.field('memoryGenerationId'), args.memoryGenerationId),
            q.eq(q.field('caseId'), args.caseId),
            q.eq(q.field('chunkId'), args.chunkId),
            q.eq(q.field('flagType'), args.flagType),
            q.eq(q.field('resolvedAt'), undefined)
        ))
        .first();
    if (existing) return existing._id;

    return await ctx.db.insert('reviewFlags', {
        orgId: args.orgId,
        accountId: args.accountId,
        matterId: args.matterId,
        clerkUserId: args.clerkUserId,
        uploadedFileId: args.uploadedFileId,
        memoryGenerationId: args.memoryGenerationId,
        caseId: args.caseId,
        chunkId: args.chunkId,
        flagType: args.flagType,
        severity: args.severity,
        message: normalizeReviewFlagMessage(args.message),
        createdAt: args.createdAt,
    });
}

const DEGRADED_MESSAGE =
    'I saved your message, but NEXX could not finish the response right now. Please retry this turn in a moment.';
const EMPTY_ARTIFACTS_JSON = JSON.stringify({
    draftReady: null,
    timelineReady: null,
    exhibitReady: null,
    judgeSimulation: null,
    oppositionSimulation: null,
    confidence: null,
});

/** Normalize a ready uploaded file into the context shape consumed by the chat worker. */
function buildUploadedFileContext(
    uploadedFile: Doc<'uploadedFiles'>,
    source: 'current_turn' | DocumentMemorySource,
    uploadSessionId = uploadedFile.uploadSessionId,
    byteSize = uploadedFile.byteSize
) {
    if (!uploadSessionId || (uploadedFile.status !== 'ready' && uploadedFile.status !== 'partial')) {
        return null;
    }

    return {
        uploadedFileId: uploadedFile._id,
        uploadSessionId,
        storageId: uploadedFile.storageId,
        storageSha256: uploadedFile.storageSha256,
        filename: uploadedFile.filename,
        mimeType: uploadedFile.mimeType,
        byteSize: byteSize ?? 0,
        status: uploadedFile.status,
        source,
        detectedType: uploadedFile.detectedType,
        extractionMethod: uploadedFile.extractionMethod,
        extractionWarnings: uploadedFile.extractionWarnings,
        extractionCharCount: uploadedFile.extractionCharCount,
        chatContextText: uploadedFile.chatContextText,
        chatContextCharCount: uploadedFile.chatContextCharCount,
        contextTruncated: uploadedFile.contextTruncated,
        indexingError: uploadedFile.indexingError,
        extractionError: uploadedFile.extractionError,
    };
}

function uploadedFileAccessCandidate(uploadedFile: Doc<'uploadedFiles'>) {
    return {
        uploadedFileId: uploadedFile._id.toString(),
        clerkUserId: uploadedFile.clerkUserId,
        conversationId: uploadedFile.conversationId?.toString(),
        caseId: uploadedFile.caseId?.toString(),
        status: uploadedFile.status,
        chatContextText: uploadedFile.chatContextText,
        activeMemoryGenerationId: uploadedFile.activeMemoryGenerationId?.toString(),
        chunkCount: uploadedFile.chunkCount,
    };
}

async function getActiveUserChatGrants(
    ctx: QueryCtx | MutationCtx,
    args: {
        clerkUserId: string;
        caseId?: Id<'cases'>;
        limit?: number;
    }
) {
    const now = Date.now();
    const grants = await ctx.db
        .query('fileAccessGrants')
        .withIndex('by_subject', (q) =>
            q.eq('subjectType', 'user').eq('subjectId', args.clerkUserId)
        )
        .collect();

    const activeGrants = grants.filter((grant) => {
        if (!grant.permissions.chat) return false;
        if (grant.revokedAt !== undefined) return false;
        if (grant.expiresAt !== undefined && grant.expiresAt <= now) return false;
        if (grant.caseId && args.caseId && grant.caseId !== args.caseId) return false;
        if (grant.caseId && !args.caseId) return false;
        return true;
    });

    return args.limit === undefined ? activeGrants : activeGrants.slice(0, args.limit);
}

async function hasActiveUserChatGrant(
    ctx: QueryCtx | MutationCtx,
    args: {
        clerkUserId: string;
        uploadedFileId: Id<'uploadedFiles'>;
        caseId?: Id<'cases'>;
    }
) {
    const grants = await getActiveUserChatGrants(ctx, {
        clerkUserId: args.clerkUserId,
        caseId: args.caseId,
    });
    return grants.some((grant) => grant.uploadedFileId === args.uploadedFileId);
}

async function getGrantedUploadedFilesForChat(
    ctx: QueryCtx,
    args: {
        clerkUserId: string;
        caseId?: Id<'cases'>;
    }
) {
    const grants = await getActiveUserChatGrants(ctx, args);
    const seen = new Set<string>();
    const files: Doc<'uploadedFiles'>[] = [];

    for (const grant of grants) {
        const uploadedFileId = grant.uploadedFileId.toString();
        if (seen.has(uploadedFileId)) continue;
        seen.add(uploadedFileId);
        const uploadedFile = await ctx.db.get(grant.uploadedFileId);
        if (!uploadedFile) continue;
        if (uploadedFile.deletedAt || uploadedFile.status === 'deleted' || uploadedFile.status === 'quarantined') continue;
        if (args.caseId) {
            if (uploadedFile.caseId && uploadedFile.caseId !== args.caseId) continue;
        } else if (uploadedFile.caseId) {
            continue;
        }
        files.push(uploadedFile);
    }

    return files;
}

function documentChunkCandidate(chunk: Doc<'documentChunks'>) {
    return {
        chunkId: chunk._id.toString(),
        uploadedFileId: chunk.uploadedFileId.toString(),
        memoryGenerationId: chunk.memoryGenerationId?.toString(),
        blockIds: chunk.blockIds?.map((blockId) => blockId.toString()),
        chunkIndex: chunk.chunkIndex,
        text: chunk.chunkText ?? chunk.text,
        textLength: chunk.textLength,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        sectionHeading: chunk.sectionHeading,
        paragraphNumber: chunk.paragraphRange,
        extractionMethod: chunk.extractionMethod,
        ocrConfidence: chunk.ocrConfidence,
        warnings: chunk.warnings,
        retrievalMetadata: chunk.retrievalMetadata,
    };
}

function mergeDocumentChunkDocs(chunks: Doc<'documentChunks'>[]) {
    const seen = new Set<string>();
    const merged: Doc<'documentChunks'>[] = [];
    for (const chunk of chunks) {
        const chunkId = chunk._id.toString();
        if (seen.has(chunkId)) continue;
        seen.add(chunkId);
        merged.push(chunk);
    }
    return merged;
}

function chunkMatchesActiveDocumentMemory(chunk: Doc<'documentChunks'>, uploadedFile: Doc<'uploadedFiles'>) {
    if (chunk.clerkUserId !== uploadedFile.clerkUserId) return false;
    if (chunk.uploadedFileId !== uploadedFile._id) return false;

    if (uploadedFile.activeMemoryGenerationId) {
        return chunk.memoryGenerationId === uploadedFile.activeMemoryGenerationId;
    }

    return !chunk.memoryGenerationId;
}

async function getContinuityChunksForSearchHits(
    ctx: QueryCtx,
    args: {
        uploadedFile: Doc<'uploadedFiles'>;
        searchChunks: Doc<'documentChunks'>[];
        generationId?: Id<'documentMemoryGenerations'>;
    }
) {
    if (args.searchChunks.length === 0) {
        return args.generationId
            ? await ctx.db
                .query('documentChunks')
                .withIndex('by_file_generation', (q) =>
                    q
                        .eq('uploadedFileId', args.uploadedFile._id)
                        .eq('memoryGenerationId', args.generationId)
                )
                .take(MAX_DOCUMENT_CHUNKS_TO_SCAN_PER_FILE)
            : await ctx.db
                .query('documentChunks')
                .withIndex('by_uploaded_file_chunk', (q) => q.eq('uploadedFileId', args.uploadedFile._id))
                .take(MAX_DOCUMENT_CHUNKS_TO_SCAN_PER_FILE);
    }

    const continuityChunks: Doc<'documentChunks'>[] = [];
    for (const chunk of args.searchChunks) {
        const windowChunks = await ctx.db
            .query('documentChunks')
            .withIndex('by_uploaded_file_chunk', (q) =>
                q
                    .eq('uploadedFileId', args.uploadedFile._id)
                    .gte('chunkIndex', Math.max(0, chunk.chunkIndex - 1))
                    .lte('chunkIndex', chunk.chunkIndex + 1)
            )
            .filter((q) =>
                args.generationId
                    ? q.eq(q.field('memoryGenerationId'), args.generationId)
                    : q.eq(q.field('memoryGenerationId'), undefined)
            )
            .take(3);
        continuityChunks.push(...windowChunks);
    }

    return mergeDocumentChunkDocs(continuityChunks);
}

/** Load the highest-signal chunks for a selected uploaded document and this user turn. */
async function getRelevantDocumentChunkContexts(
    ctx: QueryCtx,
    args: {
        uploadedFileId: Id<'uploadedFiles'>;
        message: string;
        detection: DocumentReferenceDetection;
        accessScope: DocumentAccessScope;
    }
) {
    const uploadedFile = await ctx.db.get(args.uploadedFileId);
    if (!uploadedFile) return [];

    if (!canUseDocumentMemoryCandidate(uploadedFileAccessCandidate(uploadedFile), args.accessScope)) {
        return [];
    }

    const generationId = uploadedFile.activeMemoryGenerationId;
    const searchQuery = generationId
        ? buildDocumentChunkSearchQuery(args.message, args.detection)
        : '';
    const searchChunks = searchQuery
        ? await ctx.db
            .query('documentChunks')
            .withSearchIndex('by_search_text', (q) =>
                q
                    .search('searchText', searchQuery)
                    .eq('clerkUserId', uploadedFile.clerkUserId)
                    .eq('uploadedFileId', args.uploadedFileId)
                    .eq('memoryGenerationId', generationId)
            )
            .take(MAX_DOCUMENT_CHUNKS_FROM_SEARCH_PER_FILE)
        : [];
    const continuityChunks = await getContinuityChunksForSearchHits(ctx, {
        uploadedFile,
        searchChunks,
        generationId,
    });

    const chunks = mergeDocumentChunkDocs([...searchChunks, ...continuityChunks])
        .filter((chunk) => chunkMatchesActiveDocumentMemory(chunk, uploadedFile));
    const chunksById = new Map(chunks.map((chunk) => [chunk._id.toString(), chunk]));

    return retrieveRelevantDocumentChunks({
        message: args.message,
        detection: args.detection,
        maxChunks: MAX_RETRIEVED_CHUNKS_PER_FILE,
        chunks: chunks.map(documentChunkCandidate),
    })
        .filter((chunk) => {
            const chunkDoc = chunksById.get(chunk.chunkId);
            if (!chunkDoc || !chunkMatchesActiveDocumentMemory(chunkDoc, uploadedFile)) return false;
            return canUseDocumentMemoryCandidate(uploadedFileAccessCandidate(uploadedFile), args.accessScope);
        })
        .map((chunk) => ({
            ...chunk,
            chunkId: chunk.chunkId as Id<'documentChunks'>,
            uploadedFileId: chunk.uploadedFileId as Id<'uploadedFiles'>,
        }));
}

function uniqueRecentUploadedFileIds(ids: Id<'uploadedFiles'>[]) {
    return Array.from(new Set(ids.map((id) => id.toString())))
        .slice(0, 10)
        .map((id) => id as Id<'uploadedFiles'>);
}

function messagePreview(message: string) {
    return message.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/** Preserve existing message metadata when adding structured document source summaries. */
function asMetadataObject(metadata: unknown) {
    return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? metadata as Record<string, unknown>
        : {};
}

/** Parse optional assistant metadata JSON without letting malformed metadata break completion. */
function metadataFromJson(metadataJson?: string) {
    if (!metadataJson) return {};

    try {
        return asMetadataObject(JSON.parse(metadataJson));
    } catch {
        return {};
    }
}

/** Load normalized aliases for a stored document before ranking it for recall. */
async function getDocumentAliases(ctx: QueryCtx, uploadedFileId: Id<'uploadedFiles'>) {
    const aliases = await ctx.db
        .query('documentAliases')
        .withIndex('by_uploaded_file', (q) => q.eq('uploadedFileId', uploadedFileId))
        .collect();
    return aliases.map((alias) => alias.normalizedAlias);
}

function buildExplicitAliasLookupTerms(message: string, detection: DocumentReferenceDetection) {
    const normalizedMessage = normalizeDocumentAlias(message);
    const words = normalizedMessage.split(/\s+/).filter(Boolean);
    const terms = new Set<string>();
    const addTerm = (value: string) => {
        const normalized = normalizeDocumentAlias(value);
        if (normalized.split(/\s+/).filter(Boolean).length >= 2) terms.add(normalized);
    };

    detection.documentHints.forEach(addTerm);
    detection.requestedDocumentTypes.forEach((type) => addTerm(type.replace(/_/g, ' ')));

    for (let wordCount = Math.min(8, words.length); wordCount >= 2; wordCount -= 1) {
        for (let start = 0; start <= words.length - wordCount; start += 1) {
            addTerm(words.slice(start, start + wordCount).join(' '));
            if (terms.size >= MAX_EXPLICIT_ALIAS_LOOKUP_TERMS) return Array.from(terms);
        }
    }

    return Array.from(terms);
}

/** Load explicitly named stored documents that may be older than the normal recency window. */
async function getExplicitAliasMatchedFiles(
    ctx: QueryCtx,
    args: {
        clerkUserId: string;
        caseId?: Id<'cases'>;
        terms: string[];
    }
) {
    const matchedFileIds = new Set<string>();
    const matchedFiles: Doc<'uploadedFiles'>[] = [];
    const addAliasMatches = async (aliases: Doc<'documentAliases'>[]) => {
        for (const alias of aliases) {
            if (matchedFiles.length >= MAX_EXPLICIT_ALIAS_MATCHED_FILES) return;
            const uploadedFileId = alias.uploadedFileId.toString();
            if (matchedFileIds.has(uploadedFileId)) continue;
            const uploadedFile = await ctx.db.get(alias.uploadedFileId);
            if (!uploadedFile) continue;
            matchedFileIds.add(uploadedFileId);
            matchedFiles.push(uploadedFile);
        }
    };

    for (const term of args.terms) {
        if (matchedFiles.length >= MAX_EXPLICIT_ALIAS_MATCHED_FILES) break;
        const userAliases = await ctx.db
            .query('documentAliases')
            .withIndex('by_user_alias', (q) =>
                q.eq('clerkUserId', args.clerkUserId).eq('normalizedAlias', term)
            )
            .take(MAX_ALIAS_MATCHES_PER_TERM);
        await addAliasMatches(userAliases);

        if (matchedFiles.length >= MAX_EXPLICIT_ALIAS_MATCHED_FILES) break;
        if (!args.caseId) continue;
        const caseAliases = await ctx.db
            .query('documentAliases')
            .withIndex('by_case_alias', (q) => q.eq('caseId', args.caseId).eq('normalizedAlias', term))
            .take(MAX_ALIAS_MATCHES_PER_TERM);
        await addAliasMatches(caseAliases);
    }

    return matchedFiles;
}

async function upsertConversationDocumentState(
    ctx: MutationCtx,
    args: {
        conversationId: Id<'conversations'>;
        userId: Id<'users'>;
        uploadedFileIds: Id<'uploadedFiles'>[];
        turnId?: Id<'chatTurns'>;
        now: number;
    }
) {
    if (args.uploadedFileIds.length === 0) return;

    const existing = await ctx.db
        .query('conversationDocumentState')
        .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
        .first();
    const lastReferencedUploadedFileIds = uniqueRecentUploadedFileIds([
        ...args.uploadedFileIds,
        ...(existing?.lastReferencedUploadedFileIds ?? []),
    ]);

    if (existing) {
        await ctx.db.patch(existing._id, {
            activeUploadedFileId: args.uploadedFileIds[0],
            lastReferencedUploadedFileIds,
            lastDocumentAnalysisTurnId: args.turnId ?? existing.lastDocumentAnalysisTurnId,
            lastDocumentReferenceAt: args.now,
            updatedAt: args.now,
        });
        return;
    }

    await ctx.db.insert('conversationDocumentState', {
        conversationId: args.conversationId,
        userId: args.userId,
        activeUploadedFileId: args.uploadedFileIds[0],
        lastReferencedUploadedFileIds,
        pinnedUploadedFileIds: [],
        lastDocumentAnalysisTurnId: args.turnId,
        lastDocumentReferenceAt: args.now,
        createdAt: args.now,
        updatedAt: args.now,
    });
}

/** Consume one chat quota unit after duplicate-turn detection has completed. */
async function consumeTurnRateLimit(
    ctx: MutationCtx,
    userId: Id<'users'>,
    key: string,
    limit: number,
    now: number,
    windowMs = CHAT_RATE_LIMIT_WINDOW_MS
) {
    if (!Number.isInteger(windowMs) || windowMs <= 0) {
        throw new Error('Rate-limit window must be a positive integer');
    }
    const windowStartMs = fixedWindowStartMs(now, windowMs);
    const resetInMs = Math.max(0, windowStartMs + windowMs - now);

    if (limit === -1) {
        return { allowed: true, current: 0, limit, resetInMs };
    }

    if (limit <= 0) {
        return { allowed: false, current: 0, limit, resetInMs };
    }

    const existing = await ctx.db
        .query('chatRateLimitWindows')
        .withIndex('by_user_key', (q) => q.eq('userId', userId).eq('key', key))
        .first();

    if (!existing || existing.windowStartMs !== windowStartMs || existing.windowMs !== windowMs) {
        const count = 1;
        if (existing) {
            await ctx.db.patch(existing._id, {
                windowStartMs,
                windowMs,
                count,
                limit,
                updatedAt: now,
            });
        } else {
            await ctx.db.insert('chatRateLimitWindows', {
                userId,
                key,
                windowStartMs,
                windowMs,
                count,
                limit,
                createdAt: now,
                updatedAt: now,
            });
        }

        return { allowed: true, current: count, limit, resetInMs };
    }

    if (existing.count >= limit) {
        return { allowed: false, current: existing.count, limit, resetInMs };
    }

    const count = existing.count + 1;
    await ctx.db.patch(existing._id, {
        count,
        limit,
        updatedAt: now,
    });

    return { allowed: true, current: count, limit, resetInMs };
}

function rateLimitPolicyForTurn(user: Doc<'users'>, model?: string) {
    const resolvedModel = model || PRIMARY_MODEL;
    return {
        key: chatRateLimitKeyForModel(resolvedModel),
        limit: getDailyLimit(userSubscriptionTier(user), resolvedModel),
        windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
    };
}

/** Save a durable degraded assistant message when generation cannot complete. */
async function saveDegradedAssistantForTurn(
    ctx: MutationCtx,
    turn: Doc<'chatTurns'>,
    now: number,
    errorCode: string,
    errorMessage: string
) {
    const metadata = {
        degraded: true,
        errorCode,
        errorMessage,
    };
    let assistantMessageId = turn.assistantMessageId;
    let shouldIncrementMessageCount = false;

    if (assistantMessageId) {
        await ctx.db.patch(assistantMessageId, {
            content: DEGRADED_MESSAGE,
            status: 'degraded',
            artifactsJson: EMPTY_ARTIFACTS_JSON,
            metadata,
            updatedAt: now,
        });
    } else if (turn.assistantDraftMessageId) {
        assistantMessageId = turn.assistantDraftMessageId;
        shouldIncrementMessageCount = true;
        await ctx.db.patch(turn.assistantDraftMessageId, {
            content: DEGRADED_MESSAGE,
            status: 'degraded',
            artifactsJson: EMPTY_ARTIFACTS_JSON,
            requestId: assistantRequestId(turn.requestId),
            metadata,
            updatedAt: now,
        });
    } else {
        shouldIncrementMessageCount = true;
        assistantMessageId = await ctx.db.insert('messages', {
            conversationId: turn.conversationId,
            userId: turn.userId,
            turnId: turn._id,
            role: 'assistant',
            content: DEGRADED_MESSAGE,
            status: 'degraded',
            turnNumber: turn.turnNumber,
            roleOrder: 1,
            version: 1,
            artifactsJson: EMPTY_ARTIFACTS_JSON,
            requestId: assistantRequestId(turn.requestId),
            metadata,
            createdAt: now,
            updatedAt: now,
            mode: turn.routeMode,
        });
    }

    await ctx.db.patch(turn._id, {
        status: 'degraded_saved',
        assistantMessageId,
        assistantDraftMessageId: undefined,
        errorCode,
        errorMessage,
        errorRetryable: true,
        completedAt: now,
        updatedAt: now,
    });

    const conversation = await ctx.db.get(turn.conversationId);
    if (conversation) {
        await ctx.db.patch(turn.conversationId, {
            activeTurnRequestId: conversation.activeTurnRequestId === turn.requestId ? undefined : conversation.activeTurnRequestId,
            activeTurnStartedAt: conversation.activeTurnRequestId === turn.requestId ? undefined : conversation.activeTurnStartedAt,
            lastMessageAt: now,
            messageCount: shouldIncrementMessageCount
                ? (conversation.messageCount ?? 0) + 1
                : conversation.messageCount,
        });
    }

    return assistantMessageId;
}

/** Admit a user turn once, create its generation job, and skip duplicates safely. */
export const acceptChatTurn = mutation({
    args: {
        conversationId: v.id('conversations'),
        requestId: v.string(),
        message: v.string(),
        mode: v.optional(turnModeValidator),
        routeMode: v.optional(routeModeValidator),
        model: v.optional(v.string()),
        temperature: v.optional(v.number()),
        userContextJson: v.optional(v.string()),
        persistUserMessage: v.optional(v.boolean()),
        retryOfAssistantMessageId: v.optional(v.id('messages')),
        editOfUserMessageId: v.optional(v.id('messages')),
        attachments: v.optional(v.array(attachmentRefValidator)),
    },
    handler: async (ctx, args) => {
        const { user, conversation } = await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        if (!user.clerkId) throw new Error('Authenticated user is missing clerkId');
        const now = Date.now();
        const attachments = args.attachments ?? [];
        const validatedAttachments = [];

        for (const attachment of attachments) {
            const uploadedFile = await ctx.db.get(attachment.uploadedFileId);
            if (
                !uploadedFile ||
                uploadedFile.clerkUserId !== user.clerkId ||
                uploadedFile.conversationId !== args.conversationId ||
                uploadedFile.uploadSessionId !== attachment.uploadSessionId ||
                uploadedFile.storageId !== attachment.storageId ||
                (uploadedFile.status !== 'ready' && uploadedFile.status !== 'partial')
            ) {
                throw new Error('Attachment is not ready or does not belong to this conversation.');
            }
            validatedAttachments.push({
                uploadedFileId: uploadedFile._id,
                uploadSessionId: uploadedFile.uploadSessionId,
                storageId: uploadedFile.storageId,
                filename: uploadedFile.filename,
                mimeType: uploadedFile.mimeType,
                byteSize: uploadedFile.byteSize ?? attachment.byteSize,
                status: uploadedFile.status as 'ready' | 'partial',
            });
        }

        const existingTurn = await ctx.db
            .query('chatTurns')
            .withIndex('by_request', (q) =>
                q.eq('conversationId', args.conversationId).eq('requestId', args.requestId)
            )
            .first();

        if (existingTurn) {
            const existingJob = await ctx.db
                .query('chatGenerationJobs')
                .withIndex('by_turn', (q) => q.eq('turnId', existingTurn._id))
                .first();

            return {
                accepted: true,
                duplicate: true,
                turnId: existingTurn._id,
                jobId: existingJob?._id ?? null,
                status: existingTurn.status,
                userMessageId: existingTurn.userMessageId ?? null,
                assistantMessageId: existingTurn.assistantMessageId ?? null,
            };
        }

        const mode = (args.mode ?? 'send') as ChatRegenerationMode;
        const shouldPersistUserMessage = mode === 'send';
        if (args.persistUserMessage !== undefined && args.persistUserMessage !== shouldPersistUserMessage) {
            throw new Error('Chat turn persistence does not match the requested mode.');
        }

        let effectiveMessage = args.message;
        let regenerationMessages: Doc<'messages'>[] = [];
        let regenerationPlan: ChatRegenerationPlan = mode === 'send'
            ? buildChatRegenerationPlan({
                mode,
                message: args.message,
                messages: [],
                retryOfAssistantMessageId: args.retryOfAssistantMessageId?.toString(),
                editOfUserMessageId: args.editOfUserMessageId?.toString(),
            })
            : { promptMessage: args.message, deleteMessageIds: [] as string[] };
        if (mode !== 'send') {
            regenerationMessages = await ctx.db
                .query('messages')
                .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
                .order('asc')
                .collect();
            regenerationPlan = buildChatRegenerationPlan({
                mode,
                message: args.message,
                messages: regenerationMessages.map((candidate) => ({
                    id: candidate._id.toString(),
                    role: candidate.role,
                    content: candidate.content,
                })),
                retryOfAssistantMessageId: args.retryOfAssistantMessageId?.toString(),
                editOfUserMessageId: args.editOfUserMessageId?.toString(),
            });
            effectiveMessage = regenerationPlan.promptMessage;
        }

        const rateLimitPolicy = rateLimitPolicyForTurn(user, args.model);
        const rateLimit = await consumeTurnRateLimit(
            ctx,
            user._id,
            rateLimitPolicy.key,
            rateLimitPolicy.limit,
            now,
            rateLimitPolicy.windowMs
        );

        if (!rateLimit.allowed) {
            return {
                accepted: false,
                duplicate: false,
                rateLimited: true,
                rateLimit,
                turnId: null,
                jobId: null,
                status: 'rate_limited',
                userMessageId: null,
                assistantMessageId: null,
            };
        }

        if (regenerationPlan.editedUserMessageId) {
            const editedMessage = regenerationMessages.find(
                (candidate) => candidate._id.toString() === regenerationPlan.editedUserMessageId
            );
            if (!editedMessage) throw new Error('The message selected for editing is no longer available.');
            await ctx.db.patch(editedMessage._id, {
                content: effectiveMessage,
                version: (editedMessage.version ?? 1) + 1,
                updatedAt: now,
            });
        }
        const deletedMessageIds = new Set(regenerationPlan.deleteMessageIds);

        if (mode !== 'send' && (regenerationPlan.editedUserMessageId || deletedMessageIds.size > 0)) {
            const existingSummary = await ctx.db
                .query('conversationSummaries')
                .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
                .first();
            const changesSummarizedHistory = shouldInvalidateConversationSummary({
                summaryTurnCount: existingSummary?.turnCount,
                editedMessageId: regenerationPlan.editedUserMessageId,
                deletedMessageIds,
                messages: regenerationMessages.map((candidate) => ({
                    id: candidate._id.toString(),
                    turnNumber: candidate.turnNumber ?? 0,
                })),
            });
            if (existingSummary && changesSummarizedHistory) {
                // A free-form summary cannot be patched safely after an edit/retry.
                // Delete it now; the completed regeneration turn forces a rebuild
                // from the surviving canonical message history.
                await ctx.db.delete(existingSummary._id);
            }
        }

        for (const candidate of regenerationMessages) {
            if (deletedMessageIds.has(candidate._id.toString())) {
                await ctx.db.delete(candidate._id);
            }
        }

        const existingDocumentState = await ctx.db
            .query('conversationDocumentState')
            .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId))
            .first();
        const hasActiveDocumentContext =
            validatedAttachments.length > 0 ||
            Boolean(existingDocumentState?.activeUploadedFileId);
        const contextualRoute = resolveTurnRoute({
            message: effectiveMessage,
            activeMode: conversation.routeMode as RouteMode | undefined,
            hasActiveDocumentContext,
        });
        const routeMode = args.routeMode === 'safety_escalation'
            ? args.routeMode
            : contextualRoute.mode;
        const temperature = args.routeMode === routeMode
            ? args.temperature
            : contextualRoute.temperature;
        console.info('[ChatTurns] Route resolved', {
            conversationId: args.conversationId,
            requestId: args.requestId,
            apiRouteMode: args.routeMode,
            finalRouteMode: routeMode,
            activeRouteMode: conversation.routeMode,
            hasActiveDocumentContext,
            routeChangedAfterAdmission: args.routeMode !== routeMode,
        });

        const turnNumber = conversation.nextTurnNumber ?? (conversation.messageCount ?? 0) + 1;
        const turnId = await ctx.db.insert('chatTurns', {
            conversationId: args.conversationId,
            userId: user._id,
            requestId: args.requestId,
            message: effectiveMessage,
            turnNumber,
            mode,
            status: 'accepted',
            routeMode,
            retryOfAssistantMessageId: args.retryOfAssistantMessageId,
            editOfUserMessageId: args.editOfUserMessageId,
            attempt: 0,
            maxAttempts: 3,
            provider: 'openai',
            model: args.model,
            temperature,
            userContextJson: args.userContextJson,
            attachmentRefsJson: validatedAttachments.length > 0 ? JSON.stringify(validatedAttachments) : undefined,
            createdAt: now,
            updatedAt: now,
        });

        let userMessageId: Id<'messages'> | undefined;
        if (shouldPersistUserMessage) {
            userMessageId = await ctx.db.insert('messages', {
                conversationId: args.conversationId,
                userId: user._id,
                turnId,
                role: 'user',
                content: effectiveMessage,
                status: 'committed',
                turnNumber,
                roleOrder: 0,
                version: 1,
                metadata: {
                    requestId: args.requestId,
                    attachments: validatedAttachments.map((attachment) => ({
                        uploadedFileId: attachment.uploadedFileId,
                        uploadSessionId: attachment.uploadSessionId,
                        filename: attachment.filename,
                        mimeType: attachment.mimeType,
                        byteSize: attachment.byteSize,
                        status: attachment.status,
                    })),
                },
                requestId: `${args.requestId}-user`,
                createdAt: now,
                updatedAt: now,
                mode: routeMode,
            });

            for (const attachment of validatedAttachments) {
                await ctx.db.insert('messageAttachments', {
                    messageId: userMessageId,
                    turnId,
                    conversationId: args.conversationId,
                    uploadedFileId: attachment.uploadedFileId,
                    uploadSessionId: attachment.uploadSessionId,
                    filename: attachment.filename,
                    mimeType: attachment.mimeType,
                    byteSize: attachment.byteSize,
                    status: attachment.status,
                    createdAt: now,
                });
            }
        }

        await upsertConversationDocumentState(ctx, {
            conversationId: args.conversationId,
            userId: user._id,
            uploadedFileIds: validatedAttachments.map((attachment) => attachment.uploadedFileId),
            turnId,
            now,
        });

        const jobId = await ctx.db.insert('chatGenerationJobs', {
            turnId,
            conversationId: args.conversationId,
            userId: user._id,
            requestId: args.requestId,
            status: 'queued',
            attempt: 0,
            maxAttempts: 3,
            createdAt: now,
            updatedAt: now,
        });

        await ctx.db.patch(turnId, {
            status: shouldPersistUserMessage ? 'user_saved' : 'queued',
            userMessageId,
            updatedAt: now,
        });

        await ctx.db.patch(args.conversationId, {
            nextTurnNumber: turnNumber + 1,
            lastMessageAt: now,
            messageCount: Math.max(0, (conversation.messageCount ?? 0) - deletedMessageIds.size) + (shouldPersistUserMessage ? 1 : 0),
            routeMode,
        });

        await insertChatAuditEvent(ctx, {
            eventType: 'chat_question_asked',
            user,
            conversationId: args.conversationId,
            caseId: conversation.caseId,
            turnId,
            messageId: userMessageId,
            metadataRedacted: {
                requestId: args.requestId,
                mode,
                routeMode,
                attachmentCount: validatedAttachments.length,
                persistedUserMessage: shouldPersistUserMessage,
            },
        });

        await ctx.scheduler.runAfter(0, internal.chatWorker.processChatGenerationJob, { jobId });

        return {
            accepted: true,
            duplicate: false,
            turnId,
            jobId,
            status: shouldPersistUserMessage ? 'user_saved' : 'queued',
            userMessageId: userMessageId ?? null,
            assistantMessageId: null,
        };
    },
});

/** List non-terminal turns so the client can show generation state. */
export const activeForConversation = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, args) => {
        const { conversation } = await getAuthenticatedUserAndConversation(ctx, args.conversationId);
        const recent = await ctx.db
            .query('chatTurns')
            .withIndex('by_conversation', (q) => q.eq('conversationId', conversation._id))
            .order('desc')
            .take(10);

        return recent
            .filter((turn) => !isTerminalTurnStatus(turn.status))
            .sort((a, b) => a.turnNumber - b.turnNumber)
            .map((turn) => ({
                _id: turn._id,
                status: turn.status,
                routeMode: turn.routeMode,
                turnNumber: turn.turnNumber,
                createdAt: turn.createdAt,
                startedAt: turn.startedAt,
                updatedAt: turn.updatedAt,
                errorCode: turn.errorCode,
            }));
    },
});

/** Record that the client observed a turn update. */
export const acknowledgeTurn = mutation({
    args: { turnId: v.id('chatTurns') },
    handler: async (ctx, args) => {
        const turn = await ctx.db.get(args.turnId);
        if (!turn) return null;
        await getAuthenticatedUserAndConversation(ctx, turn.conversationId);
        await ctx.db.patch(args.turnId, {
            clientAckedAt: Date.now(),
            updatedAt: Date.now(),
        });
        return true;
    },
});

/** Lease one queued generation job while respecting per-conversation ordering. */
export const leaseGenerationJob = internalMutation({
    args: {
        jobId: v.id('chatGenerationJobs'),
        leaseOwner: v.string(),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const job = await ctx.db.get(args.jobId);
        if (!job) return { status: 'missing' as const };

        if (job.status === 'completed' || job.status === 'failed_final' || job.status === 'cancelled') {
            return { status: 'terminal' as const, turnId: job.turnId };
        }

        if (job.leaseAvailableAt && job.leaseAvailableAt > now) {
            await ctx.scheduler.runAfter(job.leaseAvailableAt - now, internal.chatWorker.processChatGenerationJob, {
                jobId: args.jobId,
            });
            return { status: 'not_ready' as const, turnId: job.turnId };
        }

        const turn = await ctx.db.get(job.turnId);
        const conversation = await ctx.db.get(job.conversationId);
        if (!turn || !conversation) {
            await ctx.db.patch(args.jobId, {
                status: 'failed_final',
                errorCode: 'missing_turn_or_conversation',
                updatedAt: now,
                completedAt: now,
            });
            return { status: 'missing_context' as const };
        }

        const activeRequestId = conversation.activeTurnRequestId;
        const activeStartedAt = conversation.activeTurnStartedAt ?? 0;
        const activeIsFresh = activeRequestId && activeRequestId !== job.requestId && now - activeStartedAt < TURN_LOCK_TTL_MS;

        if (activeIsFresh) {
            await ctx.db.patch(args.jobId, {
                status: 'queued',
                leaseAvailableAt: now + JOB_RETRY_DELAY_MS,
                updatedAt: now,
            });
            await ctx.db.patch(job.turnId, {
                status: 'queued',
                updatedAt: now,
            });
            await ctx.scheduler.runAfter(JOB_RETRY_DELAY_MS, internal.chatWorker.processChatGenerationJob, {
                jobId: args.jobId,
            });
            return { status: 'conversation_busy' as const, turnId: job.turnId };
        }

        await ctx.db.patch(job.conversationId, {
            activeTurnRequestId: job.requestId,
            activeTurnStartedAt: now,
        });
        await ctx.db.patch(args.jobId, {
            status: 'running',
            leaseOwner: args.leaseOwner,
            leaseExpiresAt: now + JOB_LEASE_TTL_MS,
            startedAt: job.startedAt ?? now,
            updatedAt: now,
        });
        await ctx.db.patch(job.turnId, {
            status: 'generating',
            startedAt: turn.startedAt ?? now,
            updatedAt: now,
        });

        return { status: 'leased' as const, turnId: job.turnId };
    },
});

/** Load the prompt context needed by the worker for a specific turn. */
export const getGenerationContext = internalQuery({
    args: { turnId: v.id('chatTurns') },
    handler: async (ctx, args) => {
        const turn = await ctx.db.get(args.turnId);
        if (!turn) return null;

        const [conversation, user, summaryDoc, caseGraphDoc, courtSettings, activeLegalIssueState] = await Promise.all([
            ctx.db.get(turn.conversationId),
            ctx.db.get(turn.userId),
            ctx.db
                .query('conversationSummaries')
                .withIndex('by_conversationId', (q) => q.eq('conversationId', turn.conversationId))
                .first(),
            ctx.db
                .query('caseGraphs')
                .withIndex('by_userId', (q) => q.eq('userId', turn.userId))
                .first(),
            ctx.db
                .query('userCourtSettings')
                .withIndex('by_user', (q) => q.eq('userId', turn.userId))
                .first(),
            ctx.db
                .query('conversationLegalIssueState')
                .withIndex('by_conversation_status', (q) => q.eq('conversationId', turn.conversationId).eq('status', 'focused'))
                .order('desc')
                .first(),
        ]);

        if (!conversation || !user?.clerkId) return null;

        const activeCase = conversation.caseId ? await ctx.db.get(conversation.caseId) : null;
        const safeActiveCase = activeCase?.userId === turn.userId ? activeCase : null;

        const recentMessages = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', turn.conversationId))
            .order('desc')
            .take(40);

        recentMessages.sort((a, b) => {
            const aTurn = a.turnNumber ?? 0;
            const bTurn = b.turnNumber ?? 0;
            if (aTurn !== bTurn) return aTurn - bTurn;
            const aRole = a.roleOrder ?? (a.role === 'user' ? 0 : 1);
            const bRole = b.roleOrder ?? (b.role === 'user' ? 0 : 1);
            if (aRole !== bRole) return aRole - bRole;
            return a.createdAt - b.createdAt;
        });

        const routeMode = turn.routeMode ?? conversation.routeMode as RouteMode | undefined;
        const contextualFollowUpMessage = buildContextualDocumentFollowUpMessage(
            turn.message,
            recentMessages.filter((m) => m.status !== 'deleted'),
            routeMode,
            4_000,
            summarizeActiveLegalIssue(activeLegalIssueState ? {
                issueKey: activeLegalIssueState.issueKey,
                label: activeLegalIssueState.label,
                routeMode: activeLegalIssueState.routeMode,
                userQuestion: activeLegalIssueState.userQuestion,
                controllingConclusion: activeLegalIssueState.controllingConclusion,
                issueTerms: activeLegalIssueState.issueTerms,
                sourceAnchors: activeLegalIssueState.sourceAnchors.map((anchor) => ({
                    uploadedFileId: anchor.uploadedFileId.toString(),
                    pageStart: anchor.pageStart,
                    pageEnd: anchor.pageEnd,
                })),
            } : null)
        );
        const documentReference = detectDocumentReference(contextualFollowUpMessage);
        const clerkUserId = user.clerkId;
        const activeCaseId = conversation.caseId;
        const grantedUploadedFiles = clerkUserId
            ? await getGrantedUploadedFilesForChat(ctx, {
                clerkUserId,
                caseId: activeCaseId,
            })
            : [];
        const grantedUploadedFileIds = grantedUploadedFiles.map((uploadedFile) => uploadedFile._id.toString());
        const accessScope = {
            clerkUserId,
            conversationId: turn.conversationId.toString(),
            caseId: activeCaseId?.toString(),
            grantedUploadedFileIds,
        };
        const attachmentRows = await ctx.db
            .query('messageAttachments')
            .withIndex('by_turn', (q) => q.eq('turnId', turn._id))
            .collect();
        const attachmentContexts = [];
        for (const attachment of attachmentRows) {
            const uploadedFile = await ctx.db.get(attachment.uploadedFileId);
            if (!uploadedFile) continue;
            const context = buildUploadedFileContext(
                uploadedFile,
                'current_turn',
                attachment.uploadSessionId,
                uploadedFile.byteSize ?? attachment.byteSize
            );
            if (context) {
                attachmentContexts.push({
                    ...context,
                    documentChunks: await getRelevantDocumentChunkContexts(ctx, {
                        uploadedFileId: uploadedFile._id,
                        message: contextualFollowUpMessage,
                        detection: documentReference,
                        accessScope,
                    }),
                });
            }
        }

        const currentAttachmentIds = new Set(attachmentContexts.map((attachment) => attachment.uploadedFileId));
        const documentState = await ctx.db
            .query('conversationDocumentState')
            .withIndex('by_conversation', (q) => q.eq('conversationId', turn.conversationId))
            .first();
        const rememberedFileIds = uniqueRecentUploadedFileIds([
            ...(documentState?.activeUploadedFileId ? [documentState.activeUploadedFileId] : []),
            ...(documentState?.lastReferencedUploadedFileIds ?? []),
        ]);
        const rememberedUploadedFiles: Doc<'uploadedFiles'>[] = [];
        for (const uploadedFileId of rememberedFileIds) {
            const uploadedFile = await ctx.db.get(uploadedFileId);
            if (
                uploadedFile &&
                (uploadedFile.clerkUserId === user?.clerkId ||
                    grantedUploadedFileIds.includes(uploadedFile._id.toString()))
            ) {
                rememberedUploadedFiles.push(uploadedFile);
            }
        }
        const aliasLookupTerms = documentReference.referencesDocument
            ? buildExplicitAliasLookupTerms(turn.message, documentReference)
            : [];
        const [
            conversationUploadedFiles,
            caseUploadedFiles,
            userPrivateUploadedFiles,
            explicitAliasMatchedFiles,
        ] = await Promise.all([
            ctx.db
                .query('uploadedFiles')
                .withIndex('by_conversationId', (q) => q.eq('conversationId', turn.conversationId))
                .order('desc')
                .take(25),
            clerkUserId && activeCaseId
                ? ctx.db
                    .query('uploadedFiles')
                    .withIndex('by_clerk_case', (q) =>
                        q.eq('clerkUserId', clerkUserId).eq('caseId', activeCaseId)
                    )
                    .order('desc')
                    .take(25)
                : Promise.resolve([] as Doc<'uploadedFiles'>[]),
            clerkUserId
                ? ctx.db
                    .query('uploadedFiles')
                    .withIndex('by_clerk_private_scope', (q) =>
                        q.eq('clerkUserId', clerkUserId).eq('conversationId', undefined).eq('caseId', undefined)
                    )
                    .order('desc')
                    .take(25)
                : Promise.resolve([] as Doc<'uploadedFiles'>[]),
            clerkUserId && aliasLookupTerms.length > 0
                ? getExplicitAliasMatchedFiles(ctx, {
                    clerkUserId,
                    caseId: activeCaseId,
                    terms: aliasLookupTerms,
                })
                : Promise.resolve([] as Doc<'uploadedFiles'>[]),
        ]);
        const candidateMemoryFiles = [
            ...rememberedUploadedFiles,
            ...explicitAliasMatchedFiles,
            ...conversationUploadedFiles.filter((uploadedFile) =>
                !rememberedUploadedFiles.some((remembered) => remembered._id === uploadedFile._id)
            ),
            ...caseUploadedFiles,
            ...userPrivateUploadedFiles,
            ...grantedUploadedFiles,
        ].filter((uploadedFile) => !currentAttachmentIds.has(uploadedFile._id));
        const memorySourceByUploadedFileId = new Map<string, DocumentMemorySource>();
        const seenCandidateFileIds = new Set<string>();
        const accessibleMemoryFiles: Doc<'uploadedFiles'>[] = [];
        for (const uploadedFile of candidateMemoryFiles) {
            const uploadedFileId = uploadedFile._id.toString();
            if (seenCandidateFileIds.has(uploadedFileId) || !accessScope) continue;
            seenCandidateFileIds.add(uploadedFileId);
            if (!canUseDocumentMemoryCandidate({
                uploadedFileId,
                clerkUserId: uploadedFile.clerkUserId,
                conversationId: uploadedFile.conversationId?.toString(),
                caseId: uploadedFile.caseId?.toString(),
                status: uploadedFile.status,
                chatContextText: uploadedFile.chatContextText,
                activeMemoryGenerationId: uploadedFile.activeMemoryGenerationId?.toString(),
                chunkCount: uploadedFile.chunkCount,
            }, accessScope)) {
                continue;
            }
            const source = resolveDocumentMemorySource({
                uploadedFileId,
                clerkUserId: uploadedFile.clerkUserId,
                conversationId: uploadedFile.conversationId?.toString(),
                caseId: uploadedFile.caseId?.toString(),
                status: uploadedFile.status,
                chatContextText: uploadedFile.chatContextText,
                activeMemoryGenerationId: uploadedFile.activeMemoryGenerationId?.toString(),
                chunkCount: uploadedFile.chunkCount,
            }, accessScope);
            if (!source) continue;
            memorySourceByUploadedFileId.set(uploadedFileId, source);
            accessibleMemoryFiles.push(uploadedFile);
        }
        const rankableMemoryFiles = accessibleMemoryFiles.filter((uploadedFile) => {
            const source = memorySourceByUploadedFileId.get(uploadedFile._id.toString());
            return source
                ? Boolean(
                    buildUploadedFileContext(uploadedFile, source)?.chatContextText?.trim() ||
                    (uploadedFile.activeMemoryGenerationId && (uploadedFile.chunkCount ?? 0) > 0)
                )
                : false;
        });

        const aliasesByUploadedFileId = new Map<string, string[]>();
        const aliasPairs = await Promise.all(
            rankableMemoryFiles.map(async (uploadedFile) => [
                uploadedFile._id.toString(),
                await getDocumentAliases(ctx, uploadedFile._id),
            ] as const)
        );
        for (const [uploadedFileId, aliases] of aliasPairs) {
            aliasesByUploadedFileId.set(uploadedFileId, aliases);
        }

        const recentReferenceRankById = new Map(
            rememberedFileIds.map((uploadedFileId, index) => [uploadedFileId.toString(), index])
        );
        const storedDocumentCandidateInputs = rankableMemoryFiles.map((uploadedFile) => ({
            uploadedFileId: uploadedFile._id.toString(),
            filename: uploadedFile.filename,
            createdAt: uploadedFile.createdAt,
            detectedType: uploadedFile.detectedType,
            aliases: aliasesByUploadedFileId.get(uploadedFile._id.toString()) ?? [],
            memorySource: memorySourceByUploadedFileId.get(uploadedFile._id.toString()),
            isActiveDocument: documentState?.activeUploadedFileId?.toString() === uploadedFile._id.toString(),
            recentReferenceRank: recentReferenceRankById.get(uploadedFile._id.toString()),
        }));
        const selectedStoredDocuments = selectStoredDocumentCandidates({
            message: turn.message,
            detection: documentReference,
            maxDocuments: 5,
            candidates: storedDocumentCandidateInputs,
        });
        const documentAmbiguity = attachmentContexts.length === 0
            ? detectStoredDocumentAmbiguity({
                detection: documentReference,
                ranked: selectedStoredDocuments.ranked,
                candidates: storedDocumentCandidateInputs,
            })
            : null;
        const rankedStoredDocumentIds = selectedStoredDocuments.selected.map((selection) => selection.uploadedFileId);
        const conversationMemoryFiles = rankedStoredDocumentIds
            .map((uploadedFileId) => rankableMemoryFiles.find((candidate) => candidate._id.toString() === uploadedFileId))
            .filter((uploadedFile): uploadedFile is Doc<'uploadedFiles'> => Boolean(uploadedFile));

        const availableDocumentContexts = [];
        for (const uploadedFile of conversationMemoryFiles) {
            const source = memorySourceByUploadedFileId.get(uploadedFile._id.toString()) ?? 'conversation_memory';
            const context = buildUploadedFileContext(uploadedFile, source);
            if (
                context &&
                (
                    context.chatContextText?.trim() ||
                    (uploadedFile.activeMemoryGenerationId && (uploadedFile.chunkCount ?? 0) > 0)
                )
            ) {
                availableDocumentContexts.push({
                    ...context,
                    documentChunks: await getRelevantDocumentChunkContexts(ctx, {
                        uploadedFileId: uploadedFile._id,
                        message: contextualFollowUpMessage,
                        detection: documentReference,
                        accessScope,
                    }),
                });
            }
        }

        return {
            turn,
            conversation,
            user,
            courtSettings,
            activeCase: safeActiveCase
                ? {
                    title: safeActiveCase.title,
                    description: safeActiveCase.description,
                    status: safeActiveCase.status,
                }
                : null,
            summaryDoc,
            caseGraphDoc,
            conversationDocumentState: documentState,
            activeLegalIssueState,
            documentAmbiguity,
            attachmentContexts,
            availableDocumentContexts,
            recentMessages: recentMessages.filter((m) => m.status !== 'deleted'),
        };
    },
});

/**
 * Load the unsummarized conversation segment at each six-turn boundary.
 * This is internal-only so durable memory cannot be written from caller data.
 */
export const getConversationMemoryWork = internalQuery({
    args: { turnId: v.id('chatTurns') },
    handler: async (ctx, args) => {
        const turn = await ctx.db.get(args.turnId);
        if (!turn || turn.turnNumber <= 0) {
            return null;
        }
        const forceCanonicalRebuild = turn.mode === 'edit' || turn.mode === 'retry';
        if (!forceCanonicalRebuild && turn.turnNumber % 6 !== 0) return null;

        const [conversation, summaryDoc] = await Promise.all([
            ctx.db.get(turn.conversationId),
            ctx.db
                .query('conversationSummaries')
                .withIndex('by_conversationId', (q) => q.eq('conversationId', turn.conversationId))
                .first(),
        ]);
        if (!conversation || conversation.userId !== turn.userId) return null;

        const previousTurnCount = summaryDoc?.turnCount ?? 0;
        if (!forceCanonicalRebuild && previousTurnCount >= turn.turnNumber) return null;

        return {
            conversationId: turn.conversationId,
            userId: turn.userId,
            turnCount: turn.turnNumber,
            fromTurnExclusive: forceCanonicalRebuild ? 0 : previousTurnCount,
            existingSummaryJson: forceCanonicalRebuild ? undefined : summaryDoc?.summary,
        };
    },
});

/**
 * Page canonical message history for durable-memory compaction. Keeping the
 * database read paginated prevents a retry in a long thread from collecting
 * the entire conversation into one Convex query result.
 */
export const getConversationMemoryPage = internalQuery({
    args: {
        turnId: v.id('chatTurns'),
        cursor: v.union(v.string(), v.null()),
    },
    handler: async (ctx, args) => {
        const turn = await ctx.db.get(args.turnId);
        if (!turn) return null;

        const page = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', turn.conversationId))
            .order('asc')
            .paginate({
                cursor: args.cursor,
                numItems: 24,
            });

        return {
            page: page.page.map((message) => ({
                role: message.role,
                content: compactConversationMemoryContent(message.content),
                status: message.status,
                turnNumber: message.turnNumber ?? 0,
                roleOrder: message.roleOrder ?? (message.role === 'user' ? 0 : 1),
            })),
            continueCursor: page.continueCursor,
            isDone: page.isDone,
        };
    },
});

/** Persist a model-generated compacted summary after verifying ownership. */
export const upsertConversationSummaryInternal = internalMutation({
    args: {
        conversationId: v.id('conversations'),
        userId: v.id('users'),
        summary: v.string(),
        turnCount: v.number(),
    },
    handler: async (ctx, args) => {
        const conversation = await ctx.db.get(args.conversationId);
        if (
            !conversation ||
            conversation.userId !== args.userId ||
            !Number.isInteger(args.turnCount) ||
            args.turnCount < 0
        ) {
            return null;
        }

        const existing = await ctx.db
            .query('conversationSummaries')
            .withIndex('by_conversationId', (q) => q.eq('conversationId', args.conversationId))
            .first();
        const value = {
            summary: args.summary.slice(0, 60_000),
            turnCount: args.turnCount,
            updatedAt: Date.now(),
        };

        if (existing) {
            if (existing.turnCount > args.turnCount) return existing._id;
            await ctx.db.patch(existing._id, value);
            return existing._id;
        }

        return await ctx.db.insert('conversationSummaries', {
            conversationId: args.conversationId,
            ...value,
        });
    },
});

export const upsertFocusedLegalIssue = internalMutation({
    args: {
        conversationId: v.id('conversations'),
        userId: v.id('users'),
        issueKey: v.string(),
        label: v.string(),
        routeMode: v.optional(routeModeValidator),
        userQuestion: v.string(),
        controllingConclusion: v.string(),
        issueTerms: v.array(v.string()),
        sourceAnchors: v.array(v.object({
            uploadedFileId: v.id('uploadedFiles'),
            pageStart: v.optional(v.number()),
            pageEnd: v.optional(v.number()),
        })),
    },
    handler: async (ctx, args) => {
        const conversation = await ctx.db.get(args.conversationId);
        if (!conversation || conversation.userId !== args.userId) return null;
        const now = Date.now();
        const focused = await ctx.db
            .query('conversationLegalIssueState')
            .withIndex('by_conversation_status', (q) => q.eq('conversationId', args.conversationId).eq('status', 'focused'))
            .collect();
        for (const issue of focused) {
            if (issue.issueKey !== args.issueKey) await ctx.db.patch(issue._id, { status: 'active', updatedAt: now });
        }
        const existing = await ctx.db
            .query('conversationLegalIssueState')
            .withIndex('by_conversation_issue', (q) => q.eq('conversationId', args.conversationId).eq('issueKey', args.issueKey))
            .first();
        const value = {
            status: 'focused' as const,
            label: args.label,
            routeMode: args.routeMode,
            userQuestion: args.userQuestion,
            controllingConclusion: args.controllingConclusion,
            issueTerms: args.issueTerms,
            sourceAnchors: args.sourceAnchors,
            updatedAt: now,
        };
        if (existing) {
            await ctx.db.patch(existing._id, value);
            return existing._id;
        }
        return ctx.db.insert('conversationLegalIssueState', {
            conversationId: args.conversationId,
            userId: args.userId,
            issueKey: args.issueKey,
            ...value,
            createdAt: now,
        });
    },
});

export const recordDocumentRetrievalAudit = internalMutation({
    args: {
        turnId: v.id('chatTurns'),
        detectionResultJson: v.string(),
        candidateUploadedFileIds: v.array(v.id('uploadedFiles')),
        selectedUploadedFileIds: v.array(v.id('uploadedFiles')),
        selectedChunkIds: v.optional(v.array(v.id('documentChunks'))),
        selectedContextCount: v.number(),
        retrievalReason: v.union(
            v.literal('current_turn_attachment'),
            v.literal('active_document'),
            v.literal('recent_reference'),
            v.literal('conversation_memory'),
            v.literal('case_memory'),
            v.literal('user_private_memory'),
            v.literal('shared_memory'),
            v.literal('document_analysis_route'),
            v.literal('ambiguous_document_selection')
        ),
    },
    handler: async (ctx, args) => {
        const turn = await ctx.db.get(args.turnId);
        if (!turn) return null;
        const [conversation, user] = await Promise.all([
            ctx.db.get(turn.conversationId),
            ctx.db.get(turn.userId),
        ]);
        if (!conversation || !user) return null;
        const now = Date.now();

        const selectedUploadedFileIds = uniqueRecentUploadedFileIds(args.selectedUploadedFileIds);
        const candidateUploadedFileIds = uniqueRecentUploadedFileIds(args.candidateUploadedFileIds);
        const selectedChunkIds = args.selectedChunkIds
            ? Array.from(new Set(args.selectedChunkIds.map((id) => id.toString())))
                .slice(0, 50)
                .map((id) => id as Id<'documentChunks'>)
            : undefined;

        await ctx.db.insert('documentRetrievalAudit', {
            conversationId: turn.conversationId,
            userId: turn.userId,
            caseId: conversation.caseId,
            turnId: turn._id,
            messagePreview: messagePreview(turn.message),
            detectionResultJson: args.detectionResultJson,
            candidateUploadedFileIds,
            selectedUploadedFileIds,
            selectedChunkIds,
            selectedContextCount: args.selectedContextCount,
            retrievalReason: args.retrievalReason,
            createdAt: now,
            expiresAt: now + DOCUMENT_RETRIEVAL_AUDIT_RETENTION_MS,
        });

        await upsertConversationDocumentState(ctx, {
            conversationId: turn.conversationId,
            userId: turn.userId,
            uploadedFileIds: selectedUploadedFileIds,
            turnId: turn._id,
            now,
        });

        return true;
    },
});

export const recordRetrievalRun = internalMutation({
    args: {
        turnId: v.id('chatTurns'),
        queryType: v.union(
            v.literal('quote'),
            v.literal('summary'),
            v.literal('comparison'),
            v.literal('interpretation'),
            v.literal('timeline'),
            v.literal('metadata'),
            v.literal('not_found')
        ),
        filtersJson: v.optional(v.string()),
        vectorResultCount: v.number(),
        keywordResultCount: v.number(),
        exactMatchResultCount: v.number(),
        finalContextChunkIds: v.array(v.id('documentChunks')),
        citationVerifierPassed: v.boolean(),
    },
    handler: async (ctx, args) => {
        const turn = await ctx.db.get(args.turnId);
        if (!turn) return null;
        const [conversation, user] = await Promise.all([
            ctx.db.get(turn.conversationId),
            ctx.db.get(turn.userId),
        ]);
        if (!conversation || !user?.clerkId) return null;

        const uniqueChunkIds = Array.from(new Set(args.finalContextChunkIds.map((id) => id.toString())))
            .slice(0, 50)
            .map((id) => id as Id<'documentChunks'>);
        const accessScope = {
            clerkUserId: user.clerkId,
            conversationId: turn.conversationId.toString(),
            caseId: conversation.caseId?.toString(),
            grantedUploadedFileIds: (await getActiveUserChatGrants(ctx, {
                clerkUserId: user.clerkId,
                caseId: conversation.caseId,
            })).map((grant) => grant.uploadedFileId.toString()),
        };
        let authorizationRecheckPassed = true;
        for (const chunkId of uniqueChunkIds) {
            const chunk = await ctx.db.get(chunkId);
            const uploadedFile = chunk ? await ctx.db.get(chunk.uploadedFileId) : null;
            if (
                !chunk ||
                !uploadedFile ||
                !chunkMatchesActiveDocumentMemory(chunk, uploadedFile) ||
                !canUseDocumentMemoryCandidate(uploadedFileAccessCandidate(uploadedFile), accessScope)
            ) {
                authorizationRecheckPassed = false;
                break;
            }
        }

        const now = Date.now();
        await ctx.db.insert('retrievalRuns', {
            clerkUserId: user.clerkId,
            userId: user._id,
            conversationId: turn.conversationId,
            caseId: conversation.caseId,
            turnId: turn._id,
            queryPreview: messagePreview(turn.message),
            queryType: args.queryType,
            filtersJson: args.filtersJson,
            vectorResultCount: args.vectorResultCount,
            keywordResultCount: args.keywordResultCount,
            exactMatchResultCount: args.exactMatchResultCount,
            finalContextChunkIds: uniqueChunkIds,
            authorizationRecheckPassed,
            citationVerifierPassed: args.citationVerifierPassed,
            createdAt: now,
            expiresAt: now + DOCUMENT_RETRIEVAL_AUDIT_RETENTION_MS,
        });

        return true;
    },
});

export const recordDocumentAnswerEvidence = internalMutation({
    args: {
        turnId: v.id('chatTurns'),
        assistantMessageId: v.id('messages'),
        answerId: v.optional(v.string()),
        sources: v.array(documentEvidenceSourceValidator),
        usedChunkIds: v.optional(v.array(v.id('documentChunks'))),
        verifiedCitations: v.optional(v.array(verifiedDocumentCitationValidator)),
    },
    handler: async (ctx, args) => {
        const turn = await ctx.db.get(args.turnId);
        const assistantMessage = await ctx.db.get(args.assistantMessageId);
        if (
            !turn ||
            !assistantMessage ||
            assistantMessage.turnId !== turn._id ||
            assistantMessage.conversationId !== turn.conversationId ||
            turn.assistantMessageId !== assistantMessage._id ||
            assistantMessage.role !== 'assistant'
        ) {
            return null;
        }

        const [conversation, user] = await Promise.all([
            ctx.db.get(turn.conversationId),
            ctx.db.get(turn.userId),
        ]);
        if (!conversation || !user?.clerkId) return null;

        const seenUploadedFileIds = new Set<string>();
        const verifiedSources = [];
        for (const source of args.sources) {
            const uploadedFileId = source.uploadedFileId.toString();
            if (seenUploadedFileIds.has(uploadedFileId)) continue;
            const uploadedFile = await ctx.db.get(source.uploadedFileId);
            const hasSharedGrant = uploadedFile && source.source === 'shared_memory'
                ? await hasActiveUserChatGrant(ctx, {
                    clerkUserId: user.clerkId,
                    uploadedFileId: uploadedFile._id,
                    caseId: conversation.caseId,
                })
                : false;
            if (
                !uploadedFile ||
                (uploadedFile.clerkUserId !== user.clerkId && !hasSharedGrant) ||
                (uploadedFile.status !== 'ready' && uploadedFile.status !== 'partial')
            ) {
                continue;
            }
            if (
                source.source === 'current_turn' &&
                !(await ctx.db
                    .query('messageAttachments')
                    .withIndex('by_turn', (q) => q.eq('turnId', turn._id))
                    .filter((q) => q.eq(q.field('uploadedFileId'), uploadedFile._id))
                    .first())
            ) {
                continue;
            }
            if (source.source === 'conversation_memory' && uploadedFile.conversationId !== turn.conversationId) {
                continue;
            }
            if (source.source === 'case_memory' && (!conversation.caseId || uploadedFile.caseId !== conversation.caseId)) {
                continue;
            }
            if (source.source === 'user_private_memory' && (uploadedFile.conversationId || uploadedFile.caseId)) {
                continue;
            }
            if (
                source.source === 'shared_memory' &&
                uploadedFile.clerkUserId !== user.clerkId &&
                !hasSharedGrant
            ) {
                continue;
            }

            seenUploadedFileIds.add(uploadedFileId);
            verifiedSources.push({
                uploadedFileId: uploadedFile._id,
                filename: uploadedFile.filename,
                source: source.source,
                status: uploadedFile.status,
                extractionMethod: uploadedFile.extractionMethod,
                contextCharCount: source.contextCharCount ?? uploadedFile.chatContextCharCount,
                contextTruncated: source.contextTruncated ?? uploadedFile.contextTruncated,
            });
        }

        if (verifiedSources.length === 0) return null;

        const now = Date.now();
        const usedUploadedFileIds = verifiedSources.map((source) => source.uploadedFileId);
        const allowedUploadedFileIds = new Set(usedUploadedFileIds.map((id) => id.toString()));
        const usedChunkIds: Id<'documentChunks'>[] = [];
        const verifiedChunks = new Map<string, {
            chunk: Doc<'documentChunks'>;
            uploadedFile: Doc<'uploadedFiles'>;
        }>();
        const seenChunkIds = new Set<string>();
        const chunkIdsToValidate = [
            ...(args.verifiedCitations ?? []).map((citation) => citation.chunkId),
            ...(args.usedChunkIds ?? []),
        ];
        for (const chunkId of chunkIdsToValidate) {
            const chunkIdString = chunkId.toString();
            if (seenChunkIds.has(chunkIdString) || seenChunkIds.size >= 50) continue;
            const chunk = await ctx.db.get(chunkId);
            const uploadedFile = chunk ? await ctx.db.get(chunk.uploadedFileId) : null;
            if (
                !chunk ||
                !uploadedFile ||
                chunk.clerkUserId !== uploadedFile.clerkUserId ||
                !allowedUploadedFileIds.has(chunk.uploadedFileId.toString()) ||
                !chunkMatchesActiveDocumentMemory(chunk, uploadedFile)
            ) {
                continue;
            }
            seenChunkIds.add(chunkIdString);
            usedChunkIds.push(chunk._id);
            verifiedChunks.set(chunkIdString, { chunk, uploadedFile });
        }
        const existing = await ctx.db
            .query('documentAnswerEvidence')
            .withIndex('by_turn', (q) => q.eq('turnId', turn._id))
            .first();

        if (existing) {
            await ctx.db.patch(existing._id, {
                assistantMessageId: assistantMessage._id,
                usedUploadedFileIds,
                usedChunkIds,
                sources: verifiedSources,
                updatedAt: now,
            });
        } else {
            await ctx.db.insert('documentAnswerEvidence', {
                conversationId: turn.conversationId,
                userId: turn.userId,
                caseId: conversation.caseId,
                turnId: turn._id,
                assistantMessageId: assistantMessage._id,
                usedUploadedFileIds,
                usedChunkIds,
                sources: verifiedSources,
                createdAt: now,
                updatedAt: now,
            });
        }

        await ctx.db.patch(assistantMessage._id, {
            metadata: {
                ...asMetadataObject(assistantMessage.metadata),
                uiKind: ASSISTANT_ANSWER_UI_KIND,
                sourceDisplayMode: 'collapsed',
                sourceCount: verifiedSources.length,
                citedPages: Array.from(new Set(
                    Array.from(verifiedChunks.values())
                        .map(({ chunk }) => chunk.pageStart)
                        .filter((page): page is number => typeof page === 'number')
                )).slice(0, 50),
                documentSources: verifiedSources.map((source) => ({
                    uploadedFileId: source.uploadedFileId.toString(),
                    filename: source.filename,
                    source: source.source,
                    status: source.status,
                    extractionMethod: source.extractionMethod,
                    contextCharCount: source.contextCharCount,
                    contextTruncated: source.contextTruncated,
                })),
                usedUploadedFileIds: usedUploadedFileIds.map((uploadedFileId) => uploadedFileId.toString()),
            },
            updatedAt: now,
        });

        if (args.verifiedCitations !== undefined) {
            if (args.verifiedCitations.length === 0 && usedChunkIds.length > 0) {
                const firstVerifiedChunk = verifiedChunks.get(usedChunkIds[0].toString());
                if (firstVerifiedChunk) {
                    await insertOpenReviewFlagOnce(ctx, {
                        orgId: firstVerifiedChunk.chunk.orgId,
                        accountId: firstVerifiedChunk.chunk.accountId,
                        matterId: firstVerifiedChunk.chunk.matterId,
                        clerkUserId: user.clerkId,
                        uploadedFileId: firstVerifiedChunk.uploadedFile._id,
                        memoryGenerationId: firstVerifiedChunk.chunk.memoryGenerationId,
                        caseId: conversation.caseId,
                        chunkId: firstVerifiedChunk.chunk._id,
                        flagType: 'missing_citation',
                        severity: 'high',
                        message: 'A document answer used selected document text, but no citations were verified. Review the answer before relying on it.',
                        createdAt: now,
                    });
                }
            }

            const existingAnswerSources = await ctx.db
                .query('chatAnswerSources')
                .withIndex('by_turn', (q) => q.eq('turnId', turn._id))
                .collect();
            for (const source of existingAnswerSources) {
                await ctx.db.delete(source._id);
            }

            const seenCitationKeys = new Set<string>();
            let partialCitationFlagInserted = false;
            for (const citation of args.verifiedCitations) {
                const citationKey = `${citation.sourceId}:${citation.chunkId.toString()}`;
                if (seenCitationKeys.has(citationKey) || seenCitationKeys.size >= 50) continue;
                const verified = verifiedChunks.get(citation.chunkId.toString());
                if (!verified) continue;
                seenCitationKeys.add(citationKey);
                await ctx.db.insert('chatAnswerSources', {
                    orgId: verified.chunk.orgId,
                    accountId: verified.chunk.accountId,
                    matterId: verified.chunk.matterId,
                    clerkUserId: user.clerkId,
                    conversationId: turn.conversationId,
                    caseId: conversation.caseId,
                    turnId: turn._id,
                    messageId: assistantMessage._id,
                    answerId: args.answerId,
                    uploadedFileId: verified.uploadedFile._id,
                    memoryGenerationId: verified.chunk.memoryGenerationId,
                    chunkId: verified.chunk._id,
                    pageStart: verified.chunk.pageStart,
                    pageEnd: verified.chunk.pageEnd,
                    blockIds: verified.chunk.blockIds ?? [],
                    quotedText: citation.quotedText.slice(0, 2_000),
                    relevanceScore: undefined,
                    rerankScore: undefined,
                    citationVerifierStatus: citation.citationVerifierStatus,
                    createdAt: now,
                });
                if (citation.citationVerifierStatus === 'partial' && !partialCitationFlagInserted) {
                    partialCitationFlagInserted = true;
                    await insertOpenReviewFlagOnce(ctx, {
                        orgId: verified.chunk.orgId,
                        accountId: verified.chunk.accountId,
                        matterId: verified.chunk.matterId,
                        clerkUserId: user.clerkId,
                        uploadedFileId: verified.uploadedFile._id,
                        memoryGenerationId: verified.chunk.memoryGenerationId,
                        caseId: conversation.caseId,
                        chunkId: verified.chunk._id,
                        flagType: 'low_confidence_ocr',
                        severity: 'medium',
                        message: 'An answer citation was verified only partially because the source confidence is below the high-confidence threshold. Verify the original page before relying on this answer.',
                        createdAt: now,
                    });
                }
            }
        }

        return { sourceCount: verifiedSources.length };
    },
});

export const deleteExpiredDocumentRetrievalAudits = internalMutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const expiredAudits = await ctx.db
            .query('documentRetrievalAudit')
            .withIndex('by_expiresAt')
            .filter((q) => q.lt(q.field('expiresAt'), now))
            .take(DOCUMENT_RETRIEVAL_AUDIT_CLEANUP_BATCH_SIZE);
        const expiredRuns = await ctx.db
            .query('retrievalRuns')
            .withIndex('by_expiresAt')
            .filter((q) => q.lt(q.field('expiresAt'), now))
            .take(DOCUMENT_RETRIEVAL_AUDIT_CLEANUP_BATCH_SIZE);

        for (const audit of expiredAudits) {
            await ctx.db.delete(audit._id);
        }
        for (const run of expiredRuns) {
            await ctx.db.delete(run._id);
        }

        if (
            expiredAudits.length === DOCUMENT_RETRIEVAL_AUDIT_CLEANUP_BATCH_SIZE ||
            expiredRuns.length === DOCUMENT_RETRIEVAL_AUDIT_CLEANUP_BATCH_SIZE
        ) {
            await ctx.scheduler.runAfter(0, internal.chatTurns.deleteExpiredDocumentRetrievalAudits, {});
        }

        return { deletedAudits: expiredAudits.length, deletedRuns: expiredRuns.length };
    },
});

/** Save or update a draft assistant message while the provider is streaming. */
export const saveAssistantDraft = internalMutation({
    args: {
        jobId: v.id('chatGenerationJobs'),
        leaseOwner: v.string(),
        content: v.string(),
        metadataJson: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const job = await ctx.db.get(args.jobId);
        if (!job || job.leaseOwner !== args.leaseOwner || job.status !== 'running') return null;

        const turn = await ctx.db.get(job.turnId);
        if (!turn) return null;
        const unsafeDraft = looksLikeInternalStructuredPayload(args.content);
        const metadata = {
            ...metadataFromJson(args.metadataJson),
            draft: true,
            ...(unsafeDraft
                ? {
                    uiKind: ANALYSIS_STATUS_UI_KIND,
                    phase: 'preparing_answer',
                    redactedInternalDraft: true,
                }
                : {}),
        };
        const content = unsafeDraft ? SAFE_ANALYSIS_DRAFT_MESSAGE : args.content;

        if (turn.assistantDraftMessageId) {
            await ctx.db.patch(turn.assistantDraftMessageId, {
                content,
                status: 'draft',
                metadata: {
                    ...asMetadataObject((await ctx.db.get(turn.assistantDraftMessageId))?.metadata),
                    ...metadata,
                },
                updatedAt: now,
            });
        } else {
            const draftId = await ctx.db.insert('messages', {
                conversationId: turn.conversationId,
                userId: turn.userId,
                turnId: turn._id,
                role: 'assistant',
                content,
                status: 'draft',
                turnNumber: turn.turnNumber,
                roleOrder: 1,
                version: 1,
                requestId: `${turn.requestId}-assistant-draft`,
                metadata,
                createdAt: now,
                updatedAt: now,
                mode: turn.routeMode,
            });
            await ctx.db.patch(turn._id, {
                assistantDraftMessageId: draftId,
                status: 'assistant_draft_saved',
                updatedAt: now,
            });
        }

        await ctx.db.patch(args.jobId, {
            leaseExpiresAt: now + JOB_LEASE_TTL_MS,
            updatedAt: now,
        });
        return true;
    },
});

/** One-time maintenance helper for replacing previously leaked assistant JSON drafts. */
export const redactLeakedAssistantMessages = internalMutation({
    args: {
        conversationId: v.optional(v.id('conversations')),
        limit: v.optional(v.number()),
        cursor: v.optional(v.union(v.string(), v.null())),
        dryRun: v.optional(v.boolean()),
    },
    handler: async (ctx, args) => {
        const limit = Math.min(Math.max(Math.floor(args.limit ?? 100), 1), 500);
        const page = args.conversationId
            ? await ctx.db
                .query('messages')
                .withIndex('by_conversation', (q) => q.eq('conversationId', args.conversationId!))
                .paginate({ cursor: args.cursor ?? null, numItems: limit })
            : await ctx.db
                .query('messages')
                .paginate({ cursor: args.cursor ?? null, numItems: limit });
        const rows = page.page;

        let scanned = 0;
        let matched = 0;
        let redacted = 0;
        const now = Date.now();

        for (const message of rows) {
            scanned += 1;
            const unsafeContent = looksLikeInternalStructuredPayload(message.content);
            const unsafeArtifacts = typeof message.artifactsJson === 'string' &&
                looksLikeInternalStructuredPayload(message.artifactsJson);
            if (message.role !== 'assistant' || (!unsafeContent && !unsafeArtifacts)) {
                continue;
            }
            matched += 1;
            if (args.dryRun) continue;

            await ctx.db.patch(message._id, {
                content: message.status === 'draft'
                    ? SAFE_ANALYSIS_DRAFT_MESSAGE
                    : 'Analysis was interrupted. Please regenerate this answer.',
                metadata: {
                    ...asMetadataObject(message.metadata),
                    redactedExistingInternalLeak: true,
                    redactedArtifactsJson: unsafeArtifacts || undefined,
                    uiKind: message.status === 'draft' ? ANALYSIS_STATUS_UI_KIND : ASSISTANT_ANSWER_UI_KIND,
                },
                artifactsJson: undefined,
                updatedAt: now,
            });
            redacted += 1;
        }

        return {
            scanned,
            matched,
            redacted,
            dryRun: args.dryRun ?? false,
            cursor: page.continueCursor,
            isDone: page.isDone,
        };
    },
});

/** Finalize a turn with a committed or degraded assistant message. */
export const completeAssistant = internalMutation({
    args: {
        jobId: v.id('chatGenerationJobs'),
        leaseOwner: v.string(),
        content: v.string(),
        artifactsJson: v.optional(v.string()),
        providerResponseId: v.optional(v.string()),
        degraded: v.optional(v.boolean()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        metadataJson: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const now = Date.now();
        const job = await ctx.db.get(args.jobId);
        if (!job || job.leaseOwner !== args.leaseOwner) return null;
        const turn = await ctx.db.get(job.turnId);
        if (!turn) return null;

        const messageStatus = args.degraded ? 'degraded' : 'committed';
        const unsafeContent = looksLikeInternalStructuredPayload(args.content);
        const content = unsafeContent
            ? 'I couldn\'t display that response correctly. Please retry it.'
            : args.content;
        const artifactsJson = unsafeContent ? undefined : args.artifactsJson;
        const metadata = {
            ...metadataFromJson(args.metadataJson),
            degraded: args.degraded ?? false,
            errorCode: args.errorCode,
            errorMessage: args.errorMessage,
            redactedInternalContent: unsafeContent || undefined,
        };
        let assistantMessageId = turn.assistantMessageId;
        let shouldIncrementMessageCount = false;

        if (assistantMessageId) {
            await ctx.db.patch(assistantMessageId, {
                content,
                status: messageStatus,
                artifactsJson,
                metadata,
                updatedAt: now,
            });
        } else if (turn.assistantDraftMessageId) {
            assistantMessageId = turn.assistantDraftMessageId;
            shouldIncrementMessageCount = true;
            await ctx.db.patch(turn.assistantDraftMessageId, {
                content,
                status: messageStatus,
                artifactsJson,
                requestId: assistantRequestId(turn.requestId),
                metadata,
                updatedAt: now,
            });
        } else {
            shouldIncrementMessageCount = true;
            assistantMessageId = await ctx.db.insert('messages', {
                conversationId: turn.conversationId,
                userId: turn.userId,
                turnId: turn._id,
                role: 'assistant',
                content,
                status: messageStatus,
                turnNumber: turn.turnNumber,
                roleOrder: 1,
                version: 1,
                artifactsJson,
                requestId: assistantRequestId(turn.requestId),
                metadata,
                createdAt: now,
                updatedAt: now,
                mode: turn.routeMode,
            });
        }

        await ctx.db.patch(turn._id, {
            status: args.degraded ? 'degraded_saved' : 'assistant_saved',
            assistantMessageId,
            providerResponseId: args.providerResponseId,
            errorCode: args.errorCode,
            errorMessage: args.errorMessage,
            errorRetryable: args.degraded ? true : undefined,
            completedAt: now,
            updatedAt: now,
        });

        await ctx.db.patch(args.jobId, {
            status: 'completed',
            completedAt: now,
            errorCode: args.errorCode,
            errorMessage: args.errorMessage,
            updatedAt: now,
        });

        const [conversation, user] = await Promise.all([
            ctx.db.get(turn.conversationId),
            ctx.db.get(turn.userId),
        ]);
        if (conversation) {
            await ctx.db.patch(turn.conversationId, {
                activeTurnRequestId: conversation.activeTurnRequestId === turn.requestId ? undefined : conversation.activeTurnRequestId,
                activeTurnStartedAt: conversation.activeTurnRequestId === turn.requestId ? undefined : conversation.activeTurnStartedAt,
                openaiLastResponseId: args.providerResponseId ?? conversation.openaiLastResponseId,
                lastMessageAt: now,
                messageCount: shouldIncrementMessageCount
                    ? (conversation.messageCount ?? 0) + 1
                    : conversation.messageCount,
            });
        }

        if (conversation && user?.clerkId) {
            await insertChatAuditEvent(ctx, {
                eventType: 'chat_answer_generated',
                user,
                conversationId: turn.conversationId,
                caseId: conversation.caseId,
                turnId: turn._id,
                messageId: assistantMessageId,
                metadataRedacted: {
                    requestId: turn.requestId,
                    routeMode: turn.routeMode,
                    model: turn.model,
                    degraded: args.degraded ?? false,
                    errorCode: args.errorCode,
                    errorCategory: args.errorCode ? 'provider_or_worker_error' : 'none',
                    messageStatus,
                },
            });
        }

        const nextJob = await ctx.db
            .query('chatGenerationJobs')
            .withIndex('by_conversation_status', (q) =>
                q.eq('conversationId', turn.conversationId).eq('status', 'queued')
            )
            .first();
        if (nextJob) {
            await ctx.scheduler.runAfter(0, internal.chatWorker.processChatGenerationJob, { jobId: nextJob._id });
        }

        return { assistantMessageId };
    },
});

/** Requeue or degrade expired jobs so conversations never stay stuck active. */
export const recoverStaleJobs = internalMutation({
    args: {},
    handler: async (ctx) => {
        const now = Date.now();
        const running = await ctx.db
            .query('chatGenerationJobs')
            .withIndex('by_status', (q) => q.eq('status', 'running'))
            .take(50);

        let recovered = 0;
        for (const job of running) {
            if (!job.leaseExpiresAt || job.leaseExpiresAt > now) continue;
            const turn = await ctx.db.get(job.turnId);
            if (!turn) continue;

            if (job.attempt + 1 < job.maxAttempts) {
                await ctx.db.patch(job._id, {
                    status: 'queued',
                    attempt: job.attempt + 1,
                    leaseOwner: undefined,
                    leaseExpiresAt: undefined,
                    leaseAvailableAt: now + JOB_RETRY_DELAY_MS,
                    errorCode: 'job_lease_expired',
                    updatedAt: now,
                });
                await ctx.db.patch(turn._id, {
                    status: 'queued',
                    errorCode: 'job_lease_expired',
                    errorRetryable: true,
                    updatedAt: now,
                });
                await ctx.scheduler.runAfter(JOB_RETRY_DELAY_MS, internal.chatWorker.processChatGenerationJob, {
                    jobId: job._id,
                });
            } else {
                const errorMessage = 'Chat generation worker lease expired before completion.';
                await saveDegradedAssistantForTurn(ctx, turn, now, 'job_lease_expired', errorMessage);
                await ctx.db.patch(job._id, {
                    status: 'failed_final',
                    errorCode: 'job_lease_expired',
                    errorMessage,
                    completedAt: now,
                    updatedAt: now,
                });
            }

            const conversation = await ctx.db.get(job.conversationId);
            if (conversation?.activeTurnRequestId === job.requestId) {
                await ctx.db.patch(job.conversationId, {
                    activeTurnRequestId: undefined,
                    activeTurnStartedAt: undefined,
                });
            }
            recovered++;
        }

        const failedFinal = await ctx.db
            .query('chatGenerationJobs')
            .withIndex('by_status', (q) => q.eq('status', 'failed_final'))
            .take(50);

        for (const job of failedFinal) {
            const turn = await ctx.db.get(job.turnId);
            if (!turn || turn.status === 'assistant_saved' || turn.status === 'degraded_saved' || turn.status === 'cancelled') {
                continue;
            }

            await saveDegradedAssistantForTurn(
                ctx,
                turn,
                now,
                job.errorCode ?? 'chat_generation_failed',
                job.errorMessage ?? 'Chat generation failed before completion.'
            );
            recovered++;
        }

        return { recovered };
    },
});
