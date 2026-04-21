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
        status: v.union(v.literal('active'), v.literal('archived')),
        messageCount: v.optional(v.number()),
        lastMessageAt: v.number(),
        createdAt: v.number(),
        // ── NEW: Responses API + Conversations API state ──
        openaiConversationId: v.optional(v.string()),
        openaiLastResponseId: v.optional(v.string()),
        vectorStoreId: v.optional(v.string()),
        routeMode: v.optional(v.union(
            v.literal('adaptive_chat'),
            v.literal('direct_legal_answer'),
            v.literal('local_procedure'),
            v.literal('document_analysis'),
            v.literal('judge_lens_strategy'),
            v.literal('court_ready_drafting'),
            v.literal('pattern_analysis'),
            v.literal('support_grounding'),
            v.literal('safety_escalation')
        )),
        // ── Case Scoping (Sprint 5) ──
        caseId: v.optional(v.id('cases')),
    })
        .index('by_user', ['userId'])
        .index('by_user_status', ['userId', 'status'])
        .index('by_user_case', ['userId', 'caseId']),

    // ═══ Messages ═══
    messages: defineTable({
        conversationId: v.id('conversations'),
        role: v.union(v.literal('user'), v.literal('assistant')),
        content: v.string(),
        metadata: v.optional(v.any()),
        /** Client-generated ID for idempotent persistence (prevents duplicate inserts on retry). */
        requestId: v.optional(v.string()),
        createdAt: v.number(),
        // ── NEW: Route mode + structured artifact storage ──
        mode: v.optional(v.union(
            v.literal('adaptive_chat'),
            v.literal('direct_legal_answer'),
            v.literal('local_procedure'),
            v.literal('document_analysis'),
            v.literal('judge_lens_strategy'),
            v.literal('court_ready_drafting'),
            v.literal('pattern_analysis'),
            v.literal('support_grounding'),
            v.literal('safety_escalation')
        )),
        artifactsJson: v.optional(v.string()),
    })
        .index('by_conversation', ['conversationId'])
        .index('by_conversation_requestId', ['conversationId', 'requestId']),

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
        clerkUserId: v.string(),
        conversationId: v.optional(v.id('conversations')),
        filename: v.string(),
        mimeType: v.string(),
        openaiFileId: v.optional(v.string()),
        vectorStoreId: v.optional(v.string()),
        status: v.union(
            v.literal('uploaded'),
            v.literal('processing'),
            v.literal('ready'),
            v.literal('failed')
        ),
        createdAt: v.number(),
    }).index('by_clerkUserId', ['clerkUserId'])
      .index('by_conversationId', ['conversationId']),

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
});
