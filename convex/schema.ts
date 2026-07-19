import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';
import { routeModeValidator } from './lib/routeModeValidator';

const confidentialityLevelValidator = v.union(
    v.literal('normal'),
    v.literal('sensitive'),
    v.literal('sealed'),
    v.literal('privileged'),
    v.literal('attorney_client'),
    v.literal('restricted')
);

const documentMemoryGenerationStatusValidator = v.union(
    v.literal('building'),
    v.literal('validating'),
    v.literal('active'),
    v.literal('retired'),
    v.literal('failed'),
    v.literal('cancelled')
);

const documentMemoryGenerationReasonValidator = v.union(
    v.literal('initial_upload'),
    v.literal('manual_reprocess'),
    v.literal('ocr_upgrade'),
    v.literal('chunking_upgrade'),
    v.literal('embedding_upgrade'),
    v.literal('migration')
);

const documentBlockTypeValidator = v.union(
    v.literal('title'),
    v.literal('text'),
    v.literal('list'),
    v.literal('table'),
    v.literal('image'),
    v.literal('caption'),
    v.literal('header'),
    v.literal('footer'),
    v.literal('signature'),
    v.literal('equation'),
    v.literal('aside_text'),
    v.literal('references'),
    v.literal('other')
);

const documentCanonicalSourceValidator = v.union(
    v.literal('native'),
    v.literal('ocr'),
    v.literal('hybrid'),
    v.literal('manual')
);

const documentArtifactSourceValidator = v.union(
    v.literal('native'),
    v.literal('mistral_ocr_4'),
    v.literal('hybrid'),
    v.literal('manual')
);

const documentRetrievalMetadataValidator = v.object({
    containsTable: v.boolean(),
    containsSignature: v.boolean(),
    containsDate: v.boolean(),
    containsDeadline: v.boolean(),
    containsMoney: v.boolean(),
    containsPartyName: v.boolean(),
    containsOrderLanguage: v.boolean(),
});

const extractionAttemptStatusValidator = v.union(
    v.literal('started'),
    v.literal('succeeded'),
    v.literal('empty'),
    v.literal('failed'),
    v.literal('cancelled')
);

const providerUsageStatusValidator = v.union(
    v.literal('started'),
    v.literal('succeeded'),
    v.literal('failed')
);

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
        /** @deprecated Use children[] instead */
        childrenCount: v.optional(v.number()),
        /** @deprecated Use children[] instead */
        childrenAges: v.optional(v.array(v.number())),
        /** @deprecated Use children[] instead */
        childrenNames: v.optional(v.array(v.string())),
        /** Consolidated children info — each entry bundles name + age */
        children: v.optional(v.array(v.object({
            name: v.string(),
            age: v.number(),
        }))),
        courtCaseNumber: v.optional(v.string()),
        custodyType: v.optional(
            v.union(
                v.literal('sole'),
                v.literal('joint'),
                v.literal('split'),
                v.literal('visitation'),
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
        tonePreference: v.optional(
            v.union(
                v.literal('direct'),
                v.literal('gentle'),
                v.literal('strategic'),
                v.literal('clinical')
            )
        ),
        emotionalState: v.optional(
            v.union(
                v.literal('calm'),
                v.literal('anxious'),
                v.literal('angry'),
                v.literal('overwhelmed'),
                v.literal('numb')
            )
        ),
        subscriptionTier: v.optional(v.union(
            v.literal('free'),
            v.literal('pro'),
            v.literal('premium'),
            v.literal('executive')
        )),
        // ── Stripe billing fields ──
        stripeCustomerId: v.optional(v.string()),
        stripeSubscriptionId: v.optional(v.string()),
        stripePriceId: v.optional(v.string()),
        subscriptionStatus: v.optional(v.union(
            v.literal('active'),
            v.literal('canceled'),
            v.literal('past_due'),
            v.literal('trialing'),
            v.literal('incomplete'),
            v.literal('incomplete_expired'),
            v.literal('unpaid'),
            v.literal('paused')
        )),
        onboardingComplete: v.boolean(),
        /** Dashboard guided tour has been seen or dismissed by this user. */
        dashboardTourCompletedAt: v.optional(v.number()),
        primaryGoals: v.optional(v.array(v.string())),
        createdAt: v.number(),
    }).index('by_clerk', ['clerkId']),

    // ═══ NEX Profiles ═══
    nexProfiles: defineTable({
        userId: v.id('users'),
        nickname: v.optional(v.string()),
        relationship: v.optional(v.string()),
        /** Full legal name of the opposing party as it appears on court documents */
        legalName: v.optional(v.string()),
        /** Court-appropriate designations (multi-select): e.g. ["Child's Father", "Ex-Husband"] */
        legalRelation: v.optional(v.array(v.string())),
        /** Whether the opposing party is the Petitioner or Respondent in the case */
        partyRole: v.optional(v.union(v.literal('petitioner'), v.literal('respondent'))),
        behaviors: v.array(v.string()),
        description: v.optional(v.string()),
        communicationStyle: v.optional(v.union(v.array(v.string()), v.string())),
        manipulationTactics: v.optional(v.array(v.string())),
        triggerPatterns: v.optional(v.array(v.string())),
        // AI-enriched fields
        aiInsights: v.optional(v.string()),
        dangerLevel: v.optional(v.number()),
        detectedPatterns: v.optional(v.array(v.string())),
        lastAnalyzedAt: v.optional(v.number()),
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
        status: v.union(
            v.literal('active'),
            v.literal('archived'),
            v.literal('draft_uploading'),
            v.literal('failed_upload')
        ),
        messageCount: v.optional(v.number()),
        lastMessageAt: v.number(),
        createdAt: v.number(),
        // ── NEW: Responses API + Conversations API state ──
        openaiConversationId: v.optional(v.string()),
        openaiLastResponseId: v.optional(v.string()),
        vectorStoreId: v.optional(v.string()),
        activeTurnRequestId: v.optional(v.string()),
        activeTurnStartedAt: v.optional(v.number()),
        nextTurnNumber: v.optional(v.number()),
        routeMode: v.optional(routeModeValidator),
        // ── Case Scoping (Sprint 5) ──
        caseId: v.optional(v.id('cases')),
    })
        .index('by_user', ['userId'])
        .index('by_user_status', ['userId', 'status'])
        .index('by_user_case', ['userId', 'caseId'])
        .index('by_status_lastMessage', ['status', 'lastMessageAt']),

    // ═══ Messages ═══
    messages: defineTable({
        conversationId: v.id('conversations'),
        userId: v.optional(v.id('users')),
        turnId: v.optional(v.id('chatTurns')),
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
        status: v.optional(v.union(
            v.literal('draft'),
            v.literal('committed'),
            v.literal('degraded'),
            v.literal('failed'),
            v.literal('deleted')
        )),
        turnNumber: v.optional(v.number()),
        roleOrder: v.optional(v.number()),
        version: v.optional(v.number()),
        retryOfMessageId: v.optional(v.id('messages')),
        supersededByMessageId: v.optional(v.id('messages')),
        metadata: v.optional(v.any()),
        /** Client-generated ID for idempotent persistence (prevents duplicate inserts on retry). */
        requestId: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.optional(v.number()),
        deletedAt: v.optional(v.number()),
        // ── NEW: Route mode + structured artifact storage ──
        mode: v.optional(routeModeValidator),
        artifactsJson: v.optional(v.string()),
    })
        .index('by_conversation', ['conversationId'])
        .index('by_conversation_requestId', ['conversationId', 'requestId'])
        .index('by_conversation_turn', ['conversationId', 'turnNumber', 'roleOrder'])
        .index('by_turn', ['turnId']),

    chatTurns: defineTable({
        conversationId: v.id('conversations'),
        userId: v.id('users'),
        requestId: v.string(),
        message: v.string(),
        turnNumber: v.number(),
        mode: v.union(v.literal('send'), v.literal('retry'), v.literal('edit')),
        status: v.union(
            v.literal('accepted'),
            v.literal('queued'),
            v.literal('user_saved'),
            v.literal('generating'),
            v.literal('streaming'),
            v.literal('assistant_draft_saved'),
            v.literal('assistant_saved'),
            v.literal('degraded_saved'),
            v.literal('failed_retryable'),
            v.literal('failed_final'),
            v.literal('cancelled')
        ),
        routeMode: v.optional(routeModeValidator),
        userMessageId: v.optional(v.id('messages')),
        assistantMessageId: v.optional(v.id('messages')),
        assistantDraftMessageId: v.optional(v.id('messages')),
        retryOfTurnId: v.optional(v.id('chatTurns')),
        retryOfAssistantMessageId: v.optional(v.id('messages')),
        editOfUserMessageId: v.optional(v.id('messages')),
        attempt: v.number(),
        maxAttempts: v.number(),
        provider: v.optional(v.string()),
        model: v.optional(v.string()),
        temperature: v.optional(v.number()),
        providerResponseId: v.optional(v.string()),
        userContextJson: v.optional(v.string()),
        attachmentRefsJson: v.optional(v.string()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        errorRetryable: v.optional(v.boolean()),
        finalEventSentAt: v.optional(v.number()),
        clientAckedAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
        startedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
    })
        .index('by_conversation', ['conversationId'])
        .index('by_request', ['conversationId', 'requestId'])
        .index('by_status', ['status'])
        .index('by_conversation_turn', ['conversationId', 'turnNumber']),

    chatGenerationJobs: defineTable({
        turnId: v.id('chatTurns'),
        conversationId: v.id('conversations'),
        userId: v.id('users'),
        requestId: v.string(),
        status: v.union(
            v.literal('queued'),
            v.literal('leased'),
            v.literal('running'),
            v.literal('completed'),
            v.literal('failed_retryable'),
            v.literal('failed_final'),
            v.literal('cancelled')
        ),
        attempt: v.number(),
        maxAttempts: v.number(),
        leaseOwner: v.optional(v.string()),
        leaseExpiresAt: v.optional(v.number()),
        leaseAvailableAt: v.optional(v.number()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
        startedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
    })
        .index('by_turn', ['turnId'])
        .index('by_request', ['conversationId', 'requestId'])
        .index('by_status', ['status'])
        .index('by_conversation_status', ['conversationId', 'status']),

    chatUploadSessions: defineTable({
        clerkUserId: v.string(),
        caseId: v.optional(v.id('cases')),
        conversationId: v.optional(v.id('conversations')),
        clientUploadKey: v.string(),
        intent: v.union(v.literal('attachment'), v.literal('court_order')),
        filename: v.string(),
        mimeType: v.string(),
        extension: v.string(),
        byteSize: v.number(),
        storageId: v.optional(v.id('_storage')),
        storageSha256: v.optional(v.string()),
        storageContentType: v.optional(v.string()),
        storageSize: v.optional(v.number()),
        detectedType: v.optional(v.string()),
        extractionWarnings: v.optional(v.array(v.string())),
        uploadedFileId: v.optional(v.id('uploadedFiles')),
        currentAttemptId: v.optional(v.id('chatUploadAttempts')),
        attemptNo: v.optional(v.number()),
        lastClientEventAt: v.optional(v.number()),
        lastProgressBytes: v.optional(v.number()),
        lastProgressTotalBytes: v.optional(v.number()),
        lastFailureKind: v.optional(v.string()),
        lastFailureMessageSafe: v.optional(v.string()),
        lastFailureDiagnostics: v.optional(v.any()),
        status: v.union(
            v.literal('awaiting_storage_upload'),
            v.literal('uploading_to_storage'),
            v.literal('stored'),
            v.literal('processing_queued'),
            v.literal('processing'),
            v.literal('ready'),
            v.literal('partial'),
            v.literal('failed_storage_upload'),
            v.literal('failed_processing'),
            v.literal('failed_empty_extraction'),
            v.literal('stalled'),
            v.literal('cancelled')
        ),
        uploadUrlIssuedAt: v.number(),
        uploadUrlExpiresAt: v.number(),
        processingAttempt: v.number(),
        processingLockId: v.optional(v.string()),
        processingStartedAt: v.optional(v.number()),
        processingFinishedAt: v.optional(v.number()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        retryable: v.boolean(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_user_created', ['clerkUserId', 'createdAt'])
        .index('by_user_client_key', ['clerkUserId', 'clientUploadKey'])
        .index('by_conversation', ['conversationId'])
        .index('by_storage', ['storageId'])
        .index('by_status_updated', ['status', 'updatedAt']),

    chatUploadAttempts: defineTable({
        uploadSessionId: v.id('chatUploadSessions'),
        clerkUserId: v.string(),
        attemptNo: v.number(),
        status: v.union(
            v.literal('created'),
            v.literal('posting'),
            v.literal('failed'),
            v.literal('storage_returned'),
            v.literal('attached')
        ),
        uploadUrlHost: v.optional(v.string()),
        uploadUrlProtocol: v.optional(v.string()),
        uploadUrlIssuedAt: v.number(),
        uploadUrlExpiresAt: v.number(),
        startedAt: v.optional(v.number()),
        completedAt: v.optional(v.number()),
        failureKind: v.optional(v.string()),
        failureMessageSafe: v.optional(v.string()),
        elapsedMs: v.optional(v.number()),
        loadedBytes: v.optional(v.number()),
        totalBytes: v.optional(v.number()),
        readyState: v.optional(v.number()),
        httpStatus: v.optional(v.number()),
        browserOnline: v.optional(v.boolean()),
        effectiveType: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_session', ['uploadSessionId'])
        .index('by_user_created', ['clerkUserId', 'createdAt'])
        .index('by_status_updated', ['status', 'updatedAt']),

    messageAttachments: defineTable({
        messageId: v.optional(v.id('messages')),
        turnId: v.optional(v.id('chatTurns')),
        conversationId: v.id('conversations'),
        uploadedFileId: v.id('uploadedFiles'),
        uploadSessionId: v.id('chatUploadSessions'),
        filename: v.string(),
        mimeType: v.string(),
        byteSize: v.number(),
        status: v.union(v.literal('ready'), v.literal('partial'), v.literal('failed')),
        createdAt: v.number(),
    })
        .index('by_message', ['messageId'])
        .index('by_turn', ['turnId'])
        .index('by_conversation', ['conversationId']),

    conversationDocumentState: defineTable({
        conversationId: v.id('conversations'),
        userId: v.id('users'),
        activeUploadedFileId: v.optional(v.id('uploadedFiles')),
        lastReferencedUploadedFileIds: v.array(v.id('uploadedFiles')),
        pinnedUploadedFileIds: v.array(v.id('uploadedFiles')),
        lastDocumentAnalysisTurnId: v.optional(v.id('chatTurns')),
        lastDocumentReferenceAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_conversation', ['conversationId'])
        .index('by_user_updated', ['userId', 'updatedAt']),

    conversationLegalIssueState: defineTable({
        conversationId: v.id('conversations'),
        userId: v.id('users'),
        issueKey: v.string(),
        status: v.union(v.literal('focused'), v.literal('active'), v.literal('dormant')),
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
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_conversation_status', ['conversationId', 'status'])
        .index('by_conversation_issue', ['conversationId', 'issueKey'])
        .index('by_user_updated', ['userId', 'updatedAt']),

    documentRetrievalAudit: defineTable({
        conversationId: v.id('conversations'),
        userId: v.id('users'),
        caseId: v.optional(v.id('cases')),
        turnId: v.id('chatTurns'),
        messagePreview: v.string(),
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
        createdAt: v.number(),
        expiresAt: v.number(),
    })
        .index('by_conversation', ['conversationId'])
        .index('by_turn', ['turnId'])
        .index('by_user_created', ['userId', 'createdAt'])
        .index('by_expiresAt', ['expiresAt']),

    documentAnswerEvidence: defineTable({
        conversationId: v.id('conversations'),
        userId: v.id('users'),
        caseId: v.optional(v.id('cases')),
        turnId: v.id('chatTurns'),
        assistantMessageId: v.id('messages'),
        usedUploadedFileIds: v.array(v.id('uploadedFiles')),
        usedChunkIds: v.array(v.id('documentChunks')),
        sources: v.array(v.object({
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
        })),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_turn', ['turnId'])
        .index('by_assistant_message', ['assistantMessageId'])
        .index('by_conversation_created', ['conversationId', 'createdAt']),

    chatAnswerSources: defineTable({
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        clerkUserId: v.string(),
        conversationId: v.id('conversations'),
        caseId: v.optional(v.id('cases')),
        turnId: v.id('chatTurns'),
        messageId: v.optional(v.id('messages')),
        answerId: v.optional(v.string()),
        uploadedFileId: v.id('uploadedFiles'),
        memoryGenerationId: v.optional(v.id('documentMemoryGenerations')),
        chunkId: v.id('documentChunks'),
        pageStart: v.optional(v.number()),
        pageEnd: v.optional(v.number()),
        blockIds: v.array(v.id('documentBlocks')),
        quotedText: v.string(),
        quotedTextHash: v.optional(v.string()),
        relevanceScore: v.optional(v.number()),
        rerankScore: v.optional(v.number()),
        citationVerifierStatus: v.union(
            v.literal('verified'),
            v.literal('partial'),
            v.literal('failed')
        ),
        createdAt: v.number(),
    })
        .index('by_turn', ['turnId'])
        .index('by_message', ['messageId'])
        .index('by_file_generation', ['uploadedFileId', 'memoryGenerationId'])
        .index('by_conversation_created', ['conversationId', 'createdAt'])
        .index('by_clerk_created', ['clerkUserId', 'createdAt']),

    retrievalRuns: defineTable({
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        clerkUserId: v.string(),
        userId: v.id('users'),
        conversationId: v.optional(v.id('conversations')),
        caseId: v.optional(v.id('cases')),
        turnId: v.optional(v.id('chatTurns')),
        messageId: v.optional(v.id('messages')),
        queryPreview: v.string(),
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
        authorizationRecheckPassed: v.boolean(),
        citationVerifierPassed: v.boolean(),
        createdAt: v.number(),
        expiresAt: v.number(),
    })
        .index('by_turn', ['turnId'])
        .index('by_message', ['messageId'])
        .index('by_user_created', ['userId', 'createdAt'])
        .index('by_conversation_created', ['conversationId', 'createdAt'])
        .index('by_case_created', ['caseId', 'createdAt'])
        .index('by_expiresAt', ['expiresAt']),

    auditEvents: defineTable({
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        actorUserId: v.optional(v.id('users')),
        clerkUserId: v.optional(v.string()),
        eventType: v.union(
            v.literal('file_uploaded'),
            v.literal('file_viewed'),
            v.literal('file_downloaded'),
            v.literal('file_deleted'),
            v.literal('ocr_started'),
            v.literal('ocr_completed'),
            v.literal('ocr_failed'),
            v.literal('generation_created'),
            v.literal('generation_validated'),
            v.literal('generation_activated'),
            v.literal('generation_failed'),
            v.literal('chat_question_asked'),
            v.literal('chat_answer_generated'),
            v.literal('citation_opened'),
            v.literal('access_denied'),
            v.literal('permission_changed')
        ),
        uploadedFileId: v.optional(v.id('uploadedFiles')),
        memoryGenerationId: v.optional(v.id('documentMemoryGenerations')),
        conversationId: v.optional(v.id('conversations')),
        caseId: v.optional(v.id('cases')),
        turnId: v.optional(v.id('chatTurns')),
        messageId: v.optional(v.id('messages')),
        ipAddress: v.optional(v.string()),
        userAgent: v.optional(v.string()),
        metadataRedacted: v.optional(v.any()),
        createdAt: v.number(),
    })
        .index('by_file_created', ['uploadedFileId', 'createdAt'])
        .index('by_generation_created', ['memoryGenerationId', 'createdAt'])
        .index('by_actor_created', ['actorUserId', 'createdAt'])
        .index('by_clerk_created', ['clerkUserId', 'createdAt'])
        .index('by_case_created', ['caseId', 'createdAt'])
        .index('by_event_created', ['eventType', 'createdAt'])
        .index('by_org_created', ['orgId', 'createdAt']),

    providerUsageEvents: defineTable({
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        clerkUserId: v.optional(v.string()),
        uploadedFileId: v.optional(v.id('uploadedFiles')),
        memoryGenerationId: v.optional(v.id('documentMemoryGenerations')),
        caseId: v.optional(v.id('cases')),
        provider: v.union(
            v.literal('mistral'),
            v.literal('openai'),
            v.literal('anthropic'),
            v.literal('internal')
        ),
        endpoint: v.union(
            v.literal('ocr'),
            v.literal('embeddings'),
            v.literal('chat'),
            v.literal('rerank')
        ),
        model: v.string(),
        payloadClassification: confidentialityLevelValidator,
        zdrRequired: v.boolean(),
        zdrConfirmed: v.boolean(),
        inputTokens: v.optional(v.number()),
        outputTokens: v.optional(v.number()),
        pagesProcessed: v.optional(v.number()),
        bytesProcessed: v.optional(v.number()),
        estimatedCostUsd: v.optional(v.number()),
        status: providerUsageStatusValidator,
        providerRequestId: v.optional(v.string()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index('by_file_created', ['uploadedFileId', 'createdAt'])
        .index('by_generation_created', ['memoryGenerationId', 'createdAt'])
        .index('by_clerk_created', ['clerkUserId', 'createdAt'])
        .index('by_case_created', ['caseId', 'createdAt'])
        .index('by_provider_created', ['provider', 'createdAt'])
        .index('by_org_created', ['orgId', 'createdAt']),

    reviewFlags: defineTable({
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        clerkUserId: v.string(),
        uploadedFileId: v.optional(v.id('uploadedFiles')),
        memoryGenerationId: v.optional(v.id('documentMemoryGenerations')),
        caseId: v.optional(v.id('cases')),
        pageId: v.optional(v.id('documentPages')),
        chunkId: v.optional(v.id('documentChunks')),
        flagType: v.union(
            v.literal('low_confidence_ocr'),
            v.literal('missing_citation'),
            v.literal('provider_policy_blocked'),
            v.literal('manual_review_required'),
            v.literal('generation_validation_failed')
        ),
        severity: v.union(v.literal('low'), v.literal('medium'), v.literal('high')),
        message: v.string(),
        resolvedAt: v.optional(v.number()),
        createdAt: v.number(),
    })
        .index('by_file_created', ['uploadedFileId', 'createdAt'])
        .index('by_generation_created', ['memoryGenerationId', 'createdAt'])
        .index('by_clerk_created', ['clerkUserId', 'createdAt'])
        .index('by_clerk_resolved_created', ['clerkUserId', 'resolvedAt', 'createdAt'])
        .index('by_case_created', ['caseId', 'createdAt'])
        .index('by_type_created', ['flagType', 'createdAt']),

    documentReprocessJobs: defineTable({
        uploadedFileId: v.id('uploadedFiles'),
        requestedByUserId: v.id('users'),
        clerkUserId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        caseId: v.optional(v.id('cases')),
        reason: v.union(
            v.literal('user_requested'),
            v.literal('partial_extraction'),
            v.literal('failed_pages'),
            v.literal('parser_upgrade'),
            v.literal('ocr_upgrade'),
            v.literal('embedding_upgrade'),
            v.literal('admin_requested')
        ),
        status: v.union(
            v.literal('queued'),
            v.literal('running'),
            v.literal('succeeded'),
            v.literal('failed'),
            v.literal('cancelled')
        ),
        attempt: v.number(),
        maxAttempts: v.number(),
        sourceExtractionVersion: v.optional(v.string()),
        sourceChunkingVersion: v.optional(v.string()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
        startedAt: v.optional(v.number()),
        finishedAt: v.optional(v.number()),
    })
        .index('by_uploaded_file', ['uploadedFileId'])
        .index('by_user_created', ['requestedByUserId', 'createdAt'])
        .index('by_status_updated', ['status', 'updatedAt']),

    documentMemoryGenerations: defineTable({
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        clerkUserId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        caseId: v.optional(v.id('cases')),
        uploadedFileId: v.id('uploadedFiles'),
        generationNumber: v.number(),
        status: documentMemoryGenerationStatusValidator,
        sourceFileHash: v.optional(v.string()),
        reason: documentMemoryGenerationReasonValidator,
        extractionPlan: v.object({
            nativeExtraction: v.boolean(),
            mistralOcr: v.boolean(),
            ocrModel: v.optional(v.string()),
            includeBlocks: v.optional(v.boolean()),
            tableFormat: v.optional(v.union(v.literal('html'), v.literal('markdown'))),
            confidenceGranularity: v.optional(v.union(v.literal('page'), v.literal('word'))),
        }),
        counts: v.object({
            pagesExpected: v.optional(v.number()),
            pagesStored: v.optional(v.number()),
            blocksStored: v.optional(v.number()),
            chunksStored: v.optional(v.number()),
            embeddingsStored: v.optional(v.number()),
        }),
        qualitySummary: v.object({
            averageConfidence: v.optional(v.number()),
            minConfidence: v.optional(v.number()),
            lowConfidencePageCount: v.optional(v.number()),
            warnings: v.array(v.string()),
        }),
        validation: v.object({
            passed: v.boolean(),
            checks: v.array(v.string()),
            failedChecks: v.array(v.string()),
        }),
        createdByUserId: v.optional(v.id('users')),
        createdAt: v.number(),
        activatedAt: v.optional(v.number()),
        retiredAt: v.optional(v.number()),
        failedAt: v.optional(v.number()),
        failedReason: v.optional(v.string()),
    })
        .index('by_file_status', ['uploadedFileId', 'status'])
        .index('by_file_generation', ['uploadedFileId', 'generationNumber'])
        .index('by_clerk_status', ['clerkUserId', 'status'])
        .index('by_case_status', ['caseId', 'status'])
        .index('by_org_status', ['orgId', 'status']),

    documentExtractionAttempts: defineTable({
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        clerkUserId: v.string(),
        caseId: v.optional(v.id('cases')),
        uploadedFileId: v.id('uploadedFiles'),
        memoryGenerationId: v.id('documentMemoryGenerations'),
        extractor: v.union(
            v.literal('native_pdf'),
            v.literal('native_docx'),
            v.literal('native_txt'),
            v.literal('mistral_ocr_4'),
            v.literal('manual_upload'),
            v.literal('migration')
        ),
        extractorVersion: v.optional(v.string()),
        provider: v.optional(v.union(v.literal('internal'), v.literal('mistral'))),
        modelId: v.optional(v.string()),
        modelVersion: v.optional(v.string()),
        status: extractionAttemptStatusValidator,
        startedAt: v.number(),
        finishedAt: v.optional(v.number()),
        pageCountAttempted: v.number(),
        pageCountSucceeded: v.number(),
        averageConfidence: v.optional(v.number()),
        minConfidence: v.optional(v.number()),
        warnings: v.array(v.string()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        providerRequestId: v.optional(v.string()),
        usagePages: v.optional(v.number()),
        usageBytes: v.optional(v.number()),
        estimatedCostUsd: v.optional(v.number()),
        requestConfigRedacted: v.optional(v.any()),
        createdAt: v.number(),
    })
        .index('by_generation', ['memoryGenerationId'])
        .index('by_file_created', ['uploadedFileId', 'createdAt'])
        .index('by_status_created', ['status', 'createdAt'])
        .index('by_clerk_created', ['clerkUserId', 'createdAt']),

    fileAccessGrants: defineTable({
        orgId: v.optional(v.string()),
        clerkUserId: v.string(),
        caseId: v.optional(v.id('cases')),
        uploadedFileId: v.id('uploadedFiles'),
        subjectType: v.union(
            v.literal('user'),
            v.literal('role'),
            v.literal('team'),
            v.literal('org')
        ),
        subjectId: v.string(),
        permissions: v.object({
            view: v.boolean(),
            chat: v.boolean(),
            download: v.boolean(),
            reprocess: v.boolean(),
            delete: v.boolean(),
            share: v.boolean(),
        }),
        grantedByUserId: v.optional(v.id('users')),
        expiresAt: v.optional(v.number()),
        revokedAt: v.optional(v.number()),
        createdAt: v.number(),
    })
        .index('by_file', ['uploadedFileId'])
        .index('by_subject', ['subjectType', 'subjectId'])
        .index('by_clerk_file', ['clerkUserId', 'uploadedFileId'])
        .index('by_org_file', ['orgId', 'uploadedFileId']),

    documentPages: defineTable({
        uploadedFileId: v.id('uploadedFiles'),
        memoryGenerationId: v.optional(v.id('documentMemoryGenerations')),
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        clerkUserId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        caseId: v.optional(v.id('cases')),
        pageNumber: v.number(),
        sourcePageIndex: v.optional(v.number()),
        startChar: v.optional(v.number()),
        endChar: v.optional(v.number()),
        text: v.string(),
        nativeText: v.optional(v.string()),
        ocrMarkdown: v.optional(v.string()),
        canonicalText: v.optional(v.string()),
        canonicalSource: v.optional(documentCanonicalSourceValidator),
        headerText: v.optional(v.string()),
        footerText: v.optional(v.string()),
        textLength: v.number(),
        dimensions: v.optional(v.object({
            width: v.number(),
            height: v.number(),
            dpi: v.optional(v.number()),
        })),
        extractionMethod: v.optional(v.string()),
        ocrConfidence: v.optional(v.number()),
        confidence: v.optional(v.object({
            average: v.optional(v.number()),
            minimum: v.optional(v.number()),
        })),
        warnings: v.array(v.string()),
        isSynthetic: v.boolean(),
        textHash: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index('by_uploaded_file_page', ['uploadedFileId', 'pageNumber'])
        .index('by_generation_page', ['memoryGenerationId', 'pageNumber'])
        .index('by_file_generation', ['uploadedFileId', 'memoryGenerationId'])
        .index('by_conversation', ['conversationId'])
        .index('by_case', ['caseId']),

    documentBlocks: defineTable({
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        clerkUserId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        caseId: v.optional(v.id('cases')),
        uploadedFileId: v.id('uploadedFiles'),
        memoryGenerationId: v.id('documentMemoryGenerations'),
        pageId: v.id('documentPages'),
        pageNumber: v.number(),
        blockIndex: v.number(),
        type: documentBlockTypeValidator,
        text: v.string(),
        normalizedText: v.string(),
        startChar: v.optional(v.number()),
        endChar: v.optional(v.number()),
        bbox: v.optional(v.object({
            topLeftX: v.number(),
            topLeftY: v.number(),
            bottomRightX: v.number(),
            bottomRightY: v.number(),
        })),
        confidence: v.optional(v.number()),
        source: documentArtifactSourceValidator,
        isSubstantive: v.boolean(),
        sectionHeading: v.optional(v.string()),
        paragraphNumber: v.optional(v.string()),
        tableIndex: v.optional(v.number()),
        tableId: v.optional(v.id('documentTables')),
        retrievalMetadata: v.optional(documentRetrievalMetadataValidator),
        warnings: v.optional(v.array(v.string())),
        textHash: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index('by_generation_page_block', ['memoryGenerationId', 'pageNumber', 'blockIndex'])
        .index('by_file_generation', ['uploadedFileId', 'memoryGenerationId'])
        .index('by_page', ['pageId'])
        .index('by_case', ['caseId']),

    documentTables: defineTable({
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        clerkUserId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        caseId: v.optional(v.id('cases')),
        uploadedFileId: v.id('uploadedFiles'),
        memoryGenerationId: v.id('documentMemoryGenerations'),
        pageId: v.id('documentPages'),
        blockId: v.optional(v.id('documentBlocks')),
        pageNumber: v.number(),
        tableIndex: v.number(),
        html: v.optional(v.string()),
        markdown: v.optional(v.string()),
        plainText: v.string(),
        rowCount: v.optional(v.number()),
        columnCount: v.optional(v.number()),
        bbox: v.optional(v.object({
            topLeftX: v.number(),
            topLeftY: v.number(),
            bottomRightX: v.number(),
            bottomRightY: v.number(),
        })),
        confidence: v.optional(v.number()),
        warnings: v.array(v.string()),
        createdAt: v.number(),
    })
        .index('by_generation_page_table', ['memoryGenerationId', 'pageNumber', 'tableIndex'])
        .index('by_file_generation', ['uploadedFileId', 'memoryGenerationId'])
        .index('by_page', ['pageId'])
        .index('by_case', ['caseId']),

    documentChunks: defineTable({
        uploadedFileId: v.id('uploadedFiles'),
        memoryGenerationId: v.optional(v.id('documentMemoryGenerations')),
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        clerkUserId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        caseId: v.optional(v.id('cases')),
        pageStart: v.optional(v.number()),
        pageEnd: v.optional(v.number()),
        blockIds: v.optional(v.array(v.id('documentBlocks'))),
        tableIds: v.optional(v.array(v.id('documentTables'))),
        sectionHeading: v.optional(v.string()),
        paragraphRange: v.optional(v.string()),
        citationLabel: v.optional(v.string()),
        chunkIndex: v.number(),
        text: v.string(),
        chunkText: v.optional(v.string()),
        normalizedText: v.optional(v.string()),
        searchText: v.optional(v.string()),
        textLength: v.number(),
        startChar: v.number(),
        endChar: v.number(),
        tokenCount: v.optional(v.number()),
        extractionMethod: v.optional(v.string()),
        ocrConfidence: v.optional(v.number()),
        warnings: v.array(v.string()),
        embeddingId: v.optional(v.string()),
        embedding: v.optional(v.array(v.number())),
        embeddingModel: v.optional(v.string()),
        embeddingVersion: v.optional(v.string()),
        textHash: v.optional(v.string()),
        retrievalMetadata: v.optional(documentRetrievalMetadataValidator),
        createdAt: v.number(),
    })
        .index('by_uploaded_file_chunk', ['uploadedFileId', 'chunkIndex'])
        .index('by_generation_chunk', ['memoryGenerationId', 'chunkIndex'])
        .index('by_file_generation', ['uploadedFileId', 'memoryGenerationId'])
        .index('by_conversation', ['conversationId'])
        .index('by_case', ['caseId'])
        .searchIndex('by_search_text', {
            searchField: 'searchText',
            filterFields: ['clerkUserId', 'caseId', 'uploadedFileId', 'memoryGenerationId'],
        }),

    documentLegalMetadata: defineTable({
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        clerkUserId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        caseId: v.optional(v.id('cases')),
        uploadedFileId: v.id('uploadedFiles'),
        memoryGenerationId: v.id('documentMemoryGenerations'),
        documentType: v.union(
            v.literal('order'),
            v.literal('judgment'),
            v.literal('motion'),
            v.literal('notice'),
            v.literal('petition'),
            v.literal('exhibit'),
            v.literal('transcript'),
            v.literal('agreement'),
            v.literal('unknown')
        ),
        courtName: v.optional(v.string()),
        jurisdiction: v.optional(v.string()),
        county: v.optional(v.string()),
        state: v.optional(v.string()),
        caseNumber: v.optional(v.string()),
        judge: v.optional(v.string()),
        clerk: v.optional(v.string()),
        parties: v.array(v.object({
            name: v.string(),
            role: v.optional(v.string()),
        })),
        dateFiled: v.optional(v.string()),
        dateEntered: v.optional(v.string()),
        dateSigned: v.optional(v.string()),
        hearingDates: v.optional(v.array(v.string())),
        deadlines: v.optional(v.array(v.object({
            label: v.string(),
            date: v.optional(v.string()),
            sourcePage: v.number(),
            sourceBlockIds: v.array(v.id('documentBlocks')),
            confidence: v.number(),
        }))),
        orderSummary: v.optional(v.object({
            granted: v.optional(v.array(v.string())),
            denied: v.optional(v.array(v.string())),
            obligations: v.optional(v.array(v.string())),
            restrictions: v.optional(v.array(v.string())),
        })),
        containsSignature: v.boolean(),
        containsSeal: v.boolean(),
        containsHandwriting: v.boolean(),
        containsTables: v.boolean(),
        containsRedactions: v.boolean(),
        containsLowConfidenceText: v.boolean(),
        extractedBy: v.union(v.literal('rules'), v.literal('ai'), v.literal('hybrid')),
        confidence: v.number(),
        sourceBlockIds: v.array(v.id('documentBlocks')),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_uploaded_file', ['uploadedFileId'])
        .index('by_generation', ['memoryGenerationId'])
        .index('by_case', ['caseId'])
        .index('by_document_type', ['clerkUserId', 'documentType']),

    documentAliases: defineTable({
        uploadedFileId: v.id('uploadedFiles'),
        clerkUserId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        caseId: v.optional(v.id('cases')),
        alias: v.string(),
        normalizedAlias: v.string(),
        source: v.union(
            v.literal('filename'),
            v.literal('document_type'),
            v.literal('assistant_reference'),
            v.literal('system_generated')
        ),
        createdAt: v.number(),
    })
        .index('by_uploaded_file', ['uploadedFileId'])
        .index('by_conversation_alias', ['conversationId', 'normalizedAlias'])
        .index('by_case_alias', ['caseId', 'normalizedAlias'])
        .index('by_user_alias', ['clerkUserId', 'normalizedAlias']),

    chatRateLimitWindows: defineTable({
        userId: v.id('users'),
        key: v.string(),
        windowStartMs: v.number(),
        windowMs: v.number(),
        count: v.number(),
        limit: v.number(),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_user_key', ['userId', 'key'])
        .index('by_updatedAt', ['updatedAt']),

    // ═══ Incidents (DocuVault) ═══
    incidents: defineTable({
        userId: v.id('users'),
        narrative: v.string(),
        courtSummary: v.optional(v.string()),
        category: v.optional(
            v.union(
                v.literal('emotional_abuse'),
                v.literal('financial_abuse'),
                v.literal('parental_alienation'),
                v.literal('custody_violation'),
                v.literal('harassment'),
                v.literal('threats'),
                v.literal('manipulation'),
                v.literal('neglect'),
                v.literal('other')
            )
        ),
        tags: v.optional(v.array(v.string())),
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
        // ── Case Scoping (Sprint 5) ──
        caseId: v.optional(v.id('cases')),
    })
        .index('by_user', ['userId'])
        .index('by_user_date', ['userId', 'date'])
        .index('by_user_case', ['userId', 'caseId']),

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
        // ── Case Scoping (Sprint 5) ──
        caseId: v.optional(v.id('cases')),
    })
        .index('by_user', ['userId'])
        .index('by_user_type', ['userId', 'type'])
        .index('by_user_case', ['userId', 'caseId']),

    // ═══ User Court Settings (Legal Document System) ═══
    userCourtSettings: defineTable({
        userId: v.id('users'),
        state: v.string(),
        county: v.string(),
        courtName: v.optional(v.string()),
        judicialDistrict: v.optional(v.string()),
        assignedJudge: v.optional(v.string()),
        causeNumber: v.optional(v.string()),
        /** Case title format for document captions */
        caseTitleFormat: v.optional(v.union(
            v.literal('name_v_name'),
            v.literal('in_interest_of'),
            v.literal('in_matter_of_marriage'),
            v.literal('in_re_marriage'),
            v.literal('custom')
        )),
        /** Custom case title (used when caseTitleFormat is 'custom') */
        caseTitleCustom: v.optional(v.string()),
        /** Opposing party's legal name as shown on court documents.
         *  Named "respondent" historically but may be petitioner if the user is the respondent.
         *  The UI label reads "Opposing Party Legal Name". */
        respondentLegalName: v.optional(v.string()),
        /** Your (filing party) legal name as it appears on court documents */
        petitionerLegalName: v.optional(v.string()),
        /** Your role in the case: petitioner or respondent */
        petitionerRole: v.optional(v.union(v.literal('petitioner'), v.literal('respondent'))),
        /** @deprecated Use children[] instead */
        childName: v.optional(v.string()),
        /** @deprecated Use children[] instead */
        childrenCount: v.optional(v.number()),
        /** @deprecated Use children[] instead */
        childrenNames: v.optional(v.array(v.string())),
        /** @deprecated Use children[] instead */
        childrenAges: v.optional(v.array(v.number())),
        /** Consolidated children info — each entry bundles name + age */
        children: v.optional(v.array(v.object({
            name: v.string(),
            age: v.number(),
        }))),
        /** User-verified formatting overrides (merged on top of state/county defaults) */
        formattingOverrides: v.optional(v.any()),
        /** Explicit jurisdiction profile key (e.g. "tx-fort-bend-387th"). When set, wins over inferred match. */
        profileKey: v.optional(v.string()),
        /** Profile version for audit trail */
        profileVersion: v.optional(v.string()),
        /** Typed formatting overrides (preferred over legacy formattingOverrides) */
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
        /** Whether the user has verified these settings via AI lookup */
        aiVerified: v.optional(v.boolean()),
        aiVerifiedAt: v.optional(v.number()),
        /** Server-side consent for AI compliance checking (timestamp when granted) */
        complianceConsentGrantedAt: v.optional(v.number()),
        createdAt: v.number(),
        updatedAt: v.number(),
    }).index('by_user', ['userId']),

    // ═══ Generated Documents (Legal Document System) ═══
    generatedDocuments: defineTable({
        userId: v.id('users'),
        /** Reference to the case this document belongs to */
        caseId: v.optional(v.id('cases')),
        templateId: v.string(),
        templateTitle: v.string(),
        caseType: v.string(),
        /** Reference to user's court settings at generation time */
        courtSettingsId: v.optional(v.id('userCourtSettings')),
        /** Convex storage ID for the generated PDF */
        storageId: v.optional(v.id('_storage')),

        // ── Status lifecycle (expanded for pipeline) ──
        status: v.union(
            v.literal('draft'),
            v.literal('drafting'),
            v.literal('preflight'),
            v.literal('rendering'),
            v.literal('saving'),
            v.literal('completed'),
            v.literal('failed'),
            v.literal('final'),
            v.literal('filed')
        ),

        // ── Run identity ──
        /** Client-generated run ID for deduplication + traceability */
        runId: v.optional(v.string()),
        /** If this export is a retry, reference to the original */
        retryOfExportId: v.optional(v.id('generatedDocuments')),

        /** Snapshot of the court settings used for this document */
        courtState: v.string(),
        courtCounty: v.string(),
        /** Caption data used */
        causeNumber: v.optional(v.string()),
        petitionerName: v.string(),
        respondentName: v.optional(v.string()),

        // ── File metadata ──
        /** Generated PDF filename */
        filename: v.optional(v.string()),
        /** PDF MIME type */
        mimeType: v.optional(v.string()),
        /** PDF file size in bytes */
        byteSize: v.optional(v.number()),
        /** SHA-256 hash of the PDF for integrity verification */
        sha256: v.optional(v.string()),
        /** Export path (court_document, case_summary, exhibit_document, quick_generate) */
        exportPath: v.optional(v.string()),

        // ── Counts ──
        sectionCount: v.optional(v.number()),
        aiDraftedCount: v.optional(v.number()),
        lockedCount: v.optional(v.number()),

        // ── Validation ──
        /** Compliance check results (if run) */
        complianceStatus: v.optional(v.union(
            v.literal('pass'),
            v.literal('warning'),
            v.literal('fail'),
            v.literal('error'),
            v.literal('unchecked')
        )),
        complianceCheckedAt: v.optional(v.number()),
        /** Preflight result JSON (versioned) */
        preflightJson: v.optional(v.string()),

        // ── Snapshots (versioned) ──
        /** Pipeline draft output (JSON blob) */
        draftOutputJson: v.optional(v.string()),
        /** Snapshot of the assembly result at generation time (JSON blob) */
        assemblySnapshotJson: v.optional(v.string()),
        /** Snapshot of the export request config at generation time (JSON blob) */
        exportConfigJson: v.optional(v.string()),
        /** Schema version for draft output JSON */
        draftSchemaVersion: v.optional(v.number()),
        /** Schema version for preflight JSON */
        preflightSchemaVersion: v.optional(v.number()),

        // ── Observability ──
        /** GPT model used for drafting */
        model: v.optional(v.string()),
        /** Pipeline version identifier */
        pipelineVersion: v.optional(v.string()),
        /** Links to a courtDocumentDrafts.documentId when exported from the Review Hub */
        reviewHubDocumentId: v.optional(v.string()),
        /** Draft version number at time of export (for audit trail) */
        draftVersion: v.optional(v.number()),
        /** When pipeline execution started */
        startedAt: v.optional(v.number()),
        /** When pipeline execution completed */
        completedAt: v.optional(v.number()),
        /** Pipeline duration in milliseconds */
        durationMs: v.optional(v.number()),

        // ── Error tracking ──
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),

        // ── Versioning + Lineage ──
        /** Sequential version number within a lineage chain (1, 2, 3…) */
        version: v.optional(v.number()),
        /** Root export ID — the first export in a version lineage chain */
        rootExportId: v.optional(v.id('generatedDocuments')),
        /** Parent export ID — the direct predecessor in a version chain */
        parentExportId: v.optional(v.id('generatedDocuments')),

        // ── Stage Tracking (for retry scoping) ──
        /** The last pipeline stage that completed successfully */
        currentStage: v.optional(v.union(
            v.literal('draft'),
            v.literal('preflight'),
            v.literal('render'),
            v.literal('upload'),
            v.literal('finalize')
        )),

        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_user', ['userId'])
        .index('by_user_status', ['userId', 'status'])
        .index('by_case', ['caseId'])
        .index('by_run', ['runId'])
        .index('by_root_export', ['rootExportId']),

    // ═══ Court Rules Cache (Legal Document System) ═══
    courtRulesCache: defineTable({
        state: v.string(),
        county: v.string(),
        /** AI-discovered formatting rules (stored as JSON) */
        discoveredRules: v.any(),
        /** Source URLs from Tavily search */
        sources: v.optional(v.array(v.string())),
        /** AI confidence score (0-1) */
        confidence: v.optional(v.number()),
        /** Cache expiration timestamp */
        expiresAt: v.number(),
        createdAt: v.number(),
    }).index('by_state_county', ['state', 'county']),

    // ═══ Resources Cache (Dynamic Resource Hub) ═══
    resourcesCache: defineTable({
        /** State name (e.g. "Texas") */
        state: v.string(),
        /** County name without "County" suffix (e.g. "Harris") */
        county: v.string(),
        /** AI-discovered resources structured by category */
        resources: v.object({
            courtClerk: v.optional(v.object({
                name: v.string(),
                description: v.optional(v.string()),
                url: v.optional(v.string()),
                phone: v.optional(v.string()),
                address: v.optional(v.string()),
            })),
            courtsWebsite: v.optional(v.object({
                name: v.string(),
                description: v.optional(v.string()),
                url: v.optional(v.string()),
            })),
            familyDivision: v.optional(v.object({
                name: v.string(),
                description: v.optional(v.string()),
                url: v.optional(v.string()),
                address: v.optional(v.string()),
            })),
            localRules: v.optional(v.object({
                name: v.string(),
                description: v.optional(v.string()),
                url: v.optional(v.string()),
            })),
            stateFamilyCode: v.optional(v.object({
                name: v.string(),
                description: v.optional(v.string()),
                url: v.optional(v.string()),
            })),
            legalAid: v.optional(v.array(v.object({
                name: v.string(),
                description: v.optional(v.string()),
                url: v.optional(v.string()),
                phone: v.optional(v.string()),
            }))),
            nonprofits: v.optional(v.array(v.object({
                name: v.string(),
                description: v.optional(v.string()),
                url: v.optional(v.string()),
                phone: v.optional(v.string()),
            }))),
            /** Public case search portal for this county */
            caseSearch: v.optional(v.object({
                name: v.string(),
                description: v.optional(v.string()),
                url: v.optional(v.string()),
            })),
            /** eFiling portal for this county (e.g., eFileTexas, TurboCourt) */
            eFilingPortal: v.optional(v.object({
                name: v.string(),
                description: v.optional(v.string()),
                url: v.optional(v.string()),
                provider: v.optional(v.string()),
            })),
        }),
        /** URLs the AI referenced when discovering these resources */
        sources: v.optional(v.array(v.string())),
        createdAt: v.number(),
        updatedAt: v.number(),
    }).index('by_state_county', ['state', 'county']),

    // ═══ NEW: Conversation Summaries (compacted memory) ═══
    conversationSummaries: defineTable({
        conversationId: v.id('conversations'),
        summary: v.string(),
        turnCount: v.number(),
        updatedAt: v.number(),
    }).index('by_conversationId', ['conversationId']),

    // ═══ NEW: Case Graphs (structured case intelligence) ═══
    caseGraphs: defineTable({
        userId: v.id('users'),
        graphJson: v.string(),
        updatedAt: v.number(),
    }).index('by_userId', ['userId']),

    // ═══ NEW: User Style Profiles (learned preferences) ═══
    userStyleProfiles: defineTable({
        userId: v.id('users'),
        prefersJudgeLens: v.optional(v.boolean()),
        prefersCourtReadyDefault: v.optional(v.boolean()),
        prefersDetailedResponses: v.optional(v.boolean()),
        prefersStepByStepProcess: v.optional(v.boolean()),
        tonePreference: v.optional(v.string()),
        updatedAt: v.number(),
    }).index('by_userId', ['userId']),

    // ═══ NEW: Debug Traces (auditability for every AI call) ═══
    debugTraces: defineTable({
        traceId: v.string(),
        route: v.string(),
        routeMode: v.string(),
        clerkUserId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        debugJson: v.string(),
        createdAt: v.number(),
    }).index('by_traceId', ['traceId'])
      .index('by_conversationId', ['conversationId'])
      .index('by_clerkUserId', ['clerkUserId']),

    // ═══ NEW: Uploaded Files (metadata for user-uploaded documents) ═══
    uploadedFiles: defineTable({
        orgId: v.optional(v.string()),
        accountId: v.optional(v.string()),
        matterId: v.optional(v.string()),
        clerkUserId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        caseId: v.optional(v.id('cases')),
        uploadSessionId: v.optional(v.id('chatUploadSessions')),
        filename: v.string(),
        displayFileName: v.optional(v.string()),
        mimeType: v.string(),
        extension: v.optional(v.string()),
        byteSize: v.optional(v.number()),
        sha256Hash: v.optional(v.string()),
        storageProvider: v.optional(v.union(
            v.literal('convex'),
            v.literal('s3'),
            v.literal('r2'),
            v.literal('gcs')
        )),
        storageKey: v.optional(v.string()),
        storageRegion: v.optional(v.string()),
        encryptionKeyId: v.optional(v.string()),
        storageId: v.optional(v.id('_storage')),
        storageSha256: v.optional(v.string()),
        confidentialityLevel: v.optional(confidentialityLevelValidator),
        directUrlAllowed: v.optional(v.boolean()),
        detectedType: v.optional(v.string()),
        documentTypeHint: v.optional(v.string()),
        uploadSource: v.optional(v.union(
            v.literal('user'),
            v.literal('admin'),
            v.literal('api'),
            v.literal('migration')
        )),
        extractionMethod: v.optional(v.string()),
        extractionWarnings: v.optional(v.array(v.string())),
        extractionVersion: v.optional(v.string()),
        extractionCharCount: v.optional(v.number()),
        chatContextText: v.optional(v.string()),
        chatContextCharCount: v.optional(v.number()),
        contextTruncated: v.optional(v.boolean()),
        pageCount: v.optional(v.number()),
        chunkCount: v.optional(v.number()),
        chunkingVersion: v.optional(v.string()),
        memoryIndexedAt: v.optional(v.number()),
        fullTextStorageId: v.optional(v.id('_storage')),
        fullTextSha256: v.optional(v.string()),
        openaiFileId: v.optional(v.string()),
        openaiTextFileId: v.optional(v.string()),
        vectorStoreId: v.optional(v.string()),
        activeMemoryGenerationId: v.optional(v.id('documentMemoryGenerations')),
        latestGenerationNumber: v.optional(v.number()),
        extractionError: v.optional(v.string()),
        indexingError: v.optional(v.string()),
        ocrAttempted: v.optional(v.boolean()),
        pagesOcrProcessed: v.optional(v.number()),
        pagesTotal: v.optional(v.number()),
        status: v.union(
            v.literal('uploaded'),
            v.literal('processing'),
            v.literal('ready'),
            v.literal('partial'),
            v.literal('failed'),
            v.literal('quarantined'),
            v.literal('deleted')
        ),
        createdAt: v.number(),
        updatedAt: v.optional(v.number()),
        deletedAt: v.optional(v.number()),
    }).index('by_clerkUserId', ['clerkUserId'])
      .index('by_conversationId', ['conversationId'])
      .index('by_clerk_case', ['clerkUserId', 'caseId'])
      .index('by_clerk_private_scope', ['clerkUserId', 'conversationId', 'caseId'])
      .index('by_upload_session', ['uploadSessionId'])
      .index('by_storage', ['storageId'])
      .index('by_active_generation', ['activeMemoryGenerationId'])
      .index('by_org_hash', ['orgId', 'sha256Hash'])
      .index('by_org_matter_status', ['orgId', 'matterId', 'status']),

    // ═══ NEW: Retrieved Sources (legal sources retrieved per conversation) ═══
    retrievedSources: defineTable({
        conversationId: v.id('conversations'),
        title: v.string(),
        url: v.string(),
        sourceType: v.string(),
        snippet: v.string(),
        createdAt: v.number(),
    }).index('by_conversationId', ['conversationId']),

    // ═══ NEW: Tool Runs (audit trail for tool executions) ═══
    toolRuns: defineTable({
        conversationId: v.id('conversations'),
        toolType: v.string(),
        inputJson: v.string(),
        outputJson: v.optional(v.string()),
        createdAt: v.number(),
        expiresAt: v.optional(v.number()),
    }).index('by_conversationId', ['conversationId']),

    // ═══ NEW: Cases (multi-case support) ═══
    cases: defineTable({
        userId: v.id('users'),
        title: v.string(),
        description: v.string(),
        status: v.union(v.literal('active'), v.literal('archived')),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_userId', ['userId']),

    // ═══ NEW: Case Pins (workspace pinned items) ═══
    casePins: defineTable({
        userId: v.id('users'),
        /** Optional case scoping — backwards-compatible with pre-case data */
        caseId: v.optional(v.id('cases')),
        /** The pinnable classification */
        type: v.union(
            v.literal('key_fact'),
            v.literal('strategy_point'),
            v.literal('good_faith_point'),
            v.literal('strength_highlight'),
            v.literal('risk_concern'),
            v.literal('hearing_prep_point'),
            v.literal('draft_snippet'),
            v.literal('question_to_verify'),
            v.literal('timeline_anchor')
        ),
        title: v.string(),
        content: v.string(),
        /** Source message that generated this pin */
        sourceMessageId: v.optional(v.id('messages')),
        sourceConversationId: v.optional(v.id('conversations')),
        /** Idempotency key to prevent duplicate pins */
        requestId: v.optional(v.string()),
        /** Sort order within user's pin rail */
        sortOrder: v.optional(v.number()),
        /** Original unformatted source text (pre-AI cleanup) for traceability */
        rawSourceText: v.optional(v.string()),
        /** AI confidence level in the autofill quality */
        confidence: v.optional(v.union(
            v.literal('low'),
            v.literal('medium'),
            v.literal('high')
        )),
        /** Detected date from source text (ISO string), null if unclear */
        detectedDate: v.optional(v.string()),
        /** AI formatter version for traceability (e.g. 'pin-autofill-v1') */
        aiVersion: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index('by_userId', ['userId'])
        .index('by_userId_type', ['userId', 'type'])
        .index('by_userId_requestId', ['userId', 'requestId'])
        .index('by_caseId', ['caseId']),

    // ═══ NEW: Case Memory (saved strategy/analysis items) ═══
    caseMemory: defineTable({
        userId: v.id('users'),
        /** Optional case scoping — backwards-compatible with pre-case data */
        caseId: v.optional(v.id('cases')),
        /** Save classification */
        type: v.union(
            v.literal('case_note'),
            v.literal('key_fact'),
            v.literal('strategy_point'),
            v.literal('risk_concern'),
            v.literal('strength_highlight'),
            v.literal('good_faith_point'),
            v.literal('draft_snippet'),
            v.literal('hearing_prep_point'),
            v.literal('timeline_candidate'),
            v.literal('incident_note'),
            v.literal('exhibit_note'),
            v.literal('procedure_note'),
            v.literal('question_to_verify'),
            v.literal('pattern_analysis'),
            v.literal('narrative_synthesis')
        ),
        title: v.string(),
        content: v.string(),
        /** Optional JSON metadata (artifacts, linked items, etc.) */
        metadataJson: v.optional(v.string()),
        /** Source message/conversation for traceability */
        sourceMessageId: v.optional(v.id('messages')),
        sourceConversationId: v.optional(v.id('conversations')),
        /** Idempotency key */
        requestId: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_userId', ['userId'])
        .index('by_userId_type', ['userId', 'type'])
        .index('by_userId_requestId', ['userId', 'requestId'])
        .index('by_caseId', ['caseId']),

    // ═══ NEW: Timeline Candidates (AI-suggested timeline entries) ═══
    timelineCandidates: defineTable({
        userId: v.id('users'),
        /** Optional case scoping — backwards-compatible with pre-case data */
        caseId: v.optional(v.id('cases')),
        /** Status: candidate (AI-suggested) or confirmed (user-approved) */
        status: v.union(v.literal('candidate'), v.literal('confirmed')),
        title: v.string(),
        description: v.string(),
        /** ISO date string for the event */
        eventDate: v.optional(v.string()),
        /** Tags: incident, communication, medical, school, court, etc. */
        tags: v.optional(v.array(v.string())),
        /** Source traceability */
        sourceMessageId: v.optional(v.id('messages')),
        sourceConversationId: v.optional(v.id('conversations')),
        /** Linked incident if converted from incident flow */
        linkedIncidentId: v.optional(v.id('incidents')),
        /** Idempotency key */
        requestId: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_userId', ['userId'])
        .index('by_userId_status', ['userId', 'status'])
        .index('by_userId_requestId', ['userId', 'requestId'])
        .index('by_caseId', ['caseId']),

    // ═══ NEW: Detected Patterns (evidence-based behavioral patterns) ═══
    // Strict rules enforced before insert:
    //   • 3+ supporting events required
    //   • 2+ distinct dates required
    //   • All events source-backed against real Convex records
    //   • No emotional labeling — neutral observable categories only
    //   • Score < 5 (low confidence) → never stored
    detectedPatterns: defineTable({
        userId: v.id('users'),
        caseId: v.id('cases'),
        /** Pattern title (neutral, observable behavior label) */
        title: v.string(),
        /** AI-generated summary of the pattern */
        summary: v.string(),
        /** Neutral behavior category from BEHAVIOR_CATEGORIES */
        category: v.string(),
        /** Supporting events with source traceability — JSON: PatternEvent[] */
        eventsJson: v.string(),
        /** Number of supporting events (denormalized for queries) */
        eventCount: v.number(),
        /** Number of distinct dates (denormalized for queries) */
        distinctDates: v.number(),
        /** Confidence score (0-10, only 5+ stored) */
        score: v.number(),
        /** Confidence band — only medium/high are persisted */
        confidence: v.union(
            v.literal('medium'),
            v.literal('high')
        ),
        /** Idempotency key (prevents duplicate runs) */
        requestId: v.string(),
        generatedAt: v.number(),
        createdAt: v.number(),
    })
        .index('by_caseId', ['caseId'])
        .index('by_userId', ['userId'])
        .index('by_caseId_category', ['caseId', 'category'])
        .index('by_requestId', ['requestId']),

    // ═══ Export Overrides (Review-Centered Assembly) ═══
    // Persists human edits, section locks, and item overrides per case/export path.
    // Scoped per-case so users retain their review decisions across sessions.
    exportOverrides: defineTable({
        userId: v.id('users'),
        caseId: v.optional(v.id('cases')),
        /** Which export path these overrides apply to */
        exportPath: v.union(
            v.literal('case_summary'),
            v.literal('court_document'),
            v.literal('exhibit_document'),
        ),
        /** Section-level overrides (lock state, item ordering) */
        sectionOverrides: v.array(v.object({
            sectionId: v.string(),
            /** When true, this section is frozen — regeneration skips it */
            isLocked: v.boolean(),
            /** User-defined item order within this section (node IDs) */
            itemOrder: v.optional(v.array(v.string())),
        })),
        /** Item-level overrides (text edits, section reassignment, exclusion) */
        itemOverrides: v.array(v.object({
            nodeId: v.string(),
            /** User-edited replacement text */
            editedText: v.optional(v.string()),
            /** Force this item into a different section */
            forcedSection: v.optional(v.string()),
            /** Exclude this item from the export entirely */
            excluded: v.optional(v.boolean()),
        })),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_userId', ['userId'])
        .index('by_userId_case', ['userId', 'caseId'])
        .index('by_userId_case_path', ['userId', 'caseId', 'exportPath']),

    // ═══ Export Sessions (Crash Recovery + Auto-Save) ═══
    // Stores in-progress assembly state so users never lose work.
    // Auto-saved every 30 seconds during the review phase.
    exportSessions: defineTable({
        userId: v.id('users'),
        caseId: v.optional(v.id('cases')),
        /** Current pipeline phase */
        phase: v.union(
            v.literal('configuring'),
            v.literal('assembling'),
            v.literal('reviewing'),
            v.literal('drafting'),
            v.literal('completed'),
        ),
        /** Serialized ExportRequest */
        exportRequestJson: v.string(),
        /** Serialized AssemblyResult (after assembly completes) */
        assemblyResultJson: v.optional(v.string()),
        /** Serialized draft output (after GPT drafting completes) */
        draftOutputJson: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_userId', ['userId'])
        .index('by_userId_case', ['userId', 'caseId']),

    // ═══ Export Runs (Idempotency + Duplicate Prevention) ═══
    // Tracks export run fingerprints to prevent duplicate generation.
    // Fingerprint = caseId:exportPath:payloadHash (SHA-256).
    exportRuns: defineTable({
        /** Deterministic fingerprint for duplicate detection. */
        fingerprint: v.string(),
        /** User who initiated the run. */
        userId: v.id('users'),
        /** Case this run belongs to. */
        caseId: v.optional(v.id('cases')),
        /** Export path (court_document, case_summary, etc.). */
        exportPath: v.string(),
        /** Run lifecycle status. */
        status: v.union(
            v.literal('in_progress'),
            v.literal('completed'),
            v.literal('failed'),
        ),
        /** Linked export document (set on completion). */
        exportId: v.optional(v.id('generatedDocuments')),
        /** Error code (set on failure). */
        errorCode: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_fingerprint', ['fingerprint'])
        .index('by_userId', ['userId'])
        .index('by_status', ['status'])
        .index('by_createdAt', ['createdAt']),

    // ═══ Export Jobs (Queue Admission Control) ═══
    // Tracks active export jobs for concurrency gating and lifecycle management.
    // The SSE route checks this table before starting execution.
    exportJobs: defineTable({
        /** User who initiated the export. */
        userId: v.id('users'),
        /** Case this job belongs to. */
        caseId: v.optional(v.id('cases')),
        /** Export path (court_document, case_summary, etc.). */
        exportPath: v.string(),
        /** Links to the exportRuns fingerprint for correlation. */
        fingerprint: v.string(),
        /** Job lifecycle status. */
        status: v.union(
            v.literal('queued'),
            v.literal('running'),
            v.literal('completed'),
            v.literal('failed'),
            v.literal('timeout'),
        ),
        /** Priority: 0 = normal, 1 = retry. */
        priority: v.number(),
        createdAt: v.number(),
        /** When execution started. */
        startedAt: v.optional(v.number()),
        /** When execution finished (completed/failed/timeout). */
        completedAt: v.optional(v.number()),
        /** Error code on failure. */
        errorCode: v.optional(v.string()),
        /** Auto-expire timestamp — jobs past this are reaped. */
        timeoutAt: v.number(),
    })
        .index('by_userId_status', ['userId', 'status'])
        .index('by_status_createdAt', ['status', 'createdAt'])
        .index('by_status_timeoutAt', ['status', 'timeoutAt'])
        .index('by_createdAt', ['createdAt'])
        .index('by_fingerprint', ['fingerprint'])
        .index('by_fingerprint_userId', ['fingerprint', 'userId']),

    // ═══ Court Document Drafts (Review Hub — Document Shell) ═══
    // Stores the document metadata shell. Sections stored separately.
    courtDocumentDrafts: defineTable({
        userId: v.id('users'),
        caseId: v.optional(v.id('cases')),
        documentId: v.string(),
        documentType: v.string(),
        title: v.optional(v.string()),
        status: v.union(
            v.literal('drafting'),
            v.literal('preflight'),
            v.literal('ready_to_export'),
            v.literal('exported'),
            v.literal('abandoned'),
        ),
        /** Schema version for forward-compatible migrations */
        schemaVersion: v.number(),
        /** Incremented on each save */
        version: v.number(),
        completionPct: v.optional(v.number()),
        sectionCount: v.optional(v.number()),
        /** Jurisdiction context (serialized) */
        jurisdictionJson: v.optional(v.string()),
        /** Source of initial content */
        source: v.optional(v.union(
            v.literal('parsed_input'),
            v.literal('manual_start'),
            v.literal('ai_generated'),
        )),
        createdAt: v.number(),
        updatedAt: v.number(),
        lastOpenedAt: v.optional(v.number()),
    })
        .index('by_user', ['userId'])
        .index('by_user_status', ['userId', 'status'])
        .index('by_case', ['caseId'])
        .index('by_documentId', ['documentId']),

    // ═══ Court Document Sections (Review Hub — One Row Per Section) ═══
    // Individual section storage for section-level autosave.
    courtDocumentSections: defineTable({
        documentId: v.string(),
        userId: v.id('users'),
        caseId: v.optional(v.id('cases')),
        sectionId: v.string(),
        heading: v.string(),
        order: v.number(),
        content: v.string(),
        status: v.union(
            v.literal('empty'),
            v.literal('drafted'),
            v.literal('court_ready'),
            v.literal('locked'),
        ),
        source: v.union(
            v.literal('blank_template'),
            v.literal('parsed_input'),
            v.literal('user_edit'),
            v.literal('ai_draft'),
            v.literal('ai_rewrite'),
        ),
        required: v.boolean(),
        /** Feedback notes for AI rewrite instructions */
        feedbackNotesJson: v.optional(v.string()),
        createdAt: v.number(),
        updatedAt: v.number(),
    })
        .index('by_document', ['documentId'])
        .index('by_document_section', ['documentId', 'sectionId'])
        .index('by_case', ['caseId']),

    // ═══ Court Document Revisions (Review Hub — Audit Trail) ═══
    // Stores revision history separately so large drafts don't bloat sections.
    courtDocumentRevisions: defineTable({
        documentId: v.string(),
        sectionId: v.string(),
        userId: v.id('users'),
        before: v.string(),
        after: v.string(),
        /** JSON-encoded DiffSegment[] */
        diffJson: v.optional(v.string()),
        source: v.union(
            v.literal('user_edit'),
            v.literal('ai_draft'),
            v.literal('ai_rewrite'),
        ),
        note: v.optional(v.string()),
        createdAt: v.number(),
    })
        .index('by_document', ['documentId'])
        .index('by_section', ['documentId', 'sectionId']),
});
