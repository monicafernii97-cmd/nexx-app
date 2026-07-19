/**
 * Shared types for the NEXX application
 */

import type { DocumentReferenceDetection } from './nexx/documentReferenceDetection';
import type { LegalInterpretationAnswer } from './nexx/legal-engine/legalInterpretationSchema';
import type { LitigationNavigationResponse } from './nexx/legal-engine/litigationNavigationSchema';
import type { DeadlineAnalysis } from './nexx/legal-engine/deadlineEngine';
import type { LegalBasis } from './nexx/legal-engine/legalAuthority';
import type { LegalAuthoritiesEnvelope } from './nexx/legal-engine/legalAuthoritySchema';
import type { ResolvedOrderVersion } from './nexx/legal-engine/orderVersionResolver';
import type { ProSeDraftingReadiness } from './nexx/legal-engine/proSeDraftingFlow';
import type { LocalLegalResourceLookup } from './nexx/legal-engine/resourceLookupSchema';
import type { LegalDocumentAnswer } from './nexx/legalDocumentAnswer';

// Re-export shared content bus types for convenience
export type {
  TimelineEvent,
  PatternSummary,
  DraftContent,
  ExhibitIndex,
} from './nexx/sharedTypes';

// Re-export CaseGraph for convenience
export type { CaseGraph } from './nexx/caseGraph';
export type { DocumentReferenceDetection } from './nexx/documentReferenceDetection';

// ---------------------------------------------------------------------------
// Route Mode — the modes the router can classify a turn into
// ---------------------------------------------------------------------------

export type RouteMode =
  | 'adaptive_chat'
  | 'direct_legal_answer'
  | 'local_procedure'
  | 'document_analysis'
  | 'order_interpretation'
  | 'possession_access_schedule'
  | 'party_message_draft'
  | 'supportive_strategy'
  | 'co_parent_response'
  | 'documentation_strategy'
  | 'deescalation_response'
  | 'packed_case_intake'
  | 'litigation_navigation'
  | 'court_response_planning'
  | 'pro_se_guidance'
  | 'attorney_resource_guidance'
  | 'court_narrative_builder'
  | 'filing_walkthrough'
  | 'judge_lens_strategy'
  | 'court_ready_drafting'
  | 'pattern_analysis'
  | 'support_grounding'
  | 'safety_escalation';

export type LegalIntent =
  | 'direct_order_interpretation'
  | 'possession_access_schedule'
  | 'rights_obligations_question'
  | 'deadline_or_timing_question'
  | 'procedure_question'
  | 'draft_response_to_other_party'
  | 'court_filing_draft'
  | 'evidence_strategy'
  | 'general_summary'
  | 'emotional_legal_support'
  | 'co_parent_response_strategy'
  | 'pressure_or_manipulation_response'
  | 'documentation_guidance'
  | 'deescalation_support'
  | 'packed_case_intake'
  | 'new_court_filing_received'
  | 'court_response_deadline'
  | 'court_response_planning'
  | 'pro_se_feasibility'
  | 'attorney_cost_question'
  | 'legal_aid_resource_request'
  | 'judge_explanation_strategy'
  | 'court_response_drafting'
  | 'filing_walkthrough'
  | 'evidence_timeline_strategy';

export type MultiIntentResult = {
  primaryIntent: LegalIntent;
  secondaryIntents: LegalIntent[];
  urgency: 'low' | 'medium' | 'high' | 'urgent';
  requiresDocumentReview: boolean;
  requiresCourtDeadlineCheck: boolean;
  requiresCoParentDraft: boolean;
  requiresResourceLookup: boolean;
  requiresFilingPlanning: boolean;
};

export type FollowUpIntent =
  | 'same_issue_yes_no'
  | 'same_issue_what_to_say'
  | 'same_issue_next_step'
  | 'same_issue_rights_check'
  | 'new_issue';

// ---------------------------------------------------------------------------
// Tool Plan — output of the router, tells the chat route which tools to wire
// ---------------------------------------------------------------------------

export interface ToolPlan {
  useFileSearch: boolean;
  useWebSearch: boolean;
  useCodeInterpreter: boolean;
  useLocalCourtRetriever: boolean;
  needsClarification: boolean;
}

// ---------------------------------------------------------------------------
// Router Result — full output of the router
// ---------------------------------------------------------------------------

export interface RouterResult {
  mode: RouteMode;
  toolPlan: ToolPlan;
  temperature: number;
  legalIntent?: LegalIntent;
  multiIntent?: MultiIntentResult;
  documentReference?: DocumentReferenceDetection;
  requiresDocumentRetrieval?: boolean;
  requiresClarification?: boolean;
}

// ---------------------------------------------------------------------------
// Artifacts — structured work-product attached to assistant responses
// ---------------------------------------------------------------------------

export interface NexxArtifacts {
  draftReady: Record<string, unknown> | null;
  timelineReady: Record<string, unknown> | null;
  exhibitReady: Record<string, unknown> | null;
  judgeSimulation: JudgeSimulationResult | null;
  oppositionSimulation: OppositionSimulationResult | null;
  confidence: LegalConfidence | null;
}

// ---------------------------------------------------------------------------
// Nexx Assistant Response — the structured JSON returned by responses.create
// ---------------------------------------------------------------------------

export interface NexxAssistantResponse {
  message: string;
  artifacts: NexxArtifacts;
  documentAnswer: LegalDocumentAnswer | null;
  legalInterpretation: LegalInterpretationAnswer | null;
  litigationNavigation: LitigationNavigationResponse | null;
  localResourceLookup: LocalLegalResourceLookup | null;
  legalAuthorities: LegalAuthoritiesEnvelope | null;
  proSeDraftingReadiness: ProSeDraftingReadiness | null;
  orderVersion: ResolvedOrderVersion | null;
  legalBasis: LegalBasis[];
  deadlineAnalysis: DeadlineAnalysis | null;
  responseCompositionTrace?: {
    renderMode: string;
    canonicalDirectAnswerFingerprint: string | null;
    selectedSourceRoles: Array<{ sourceId: string; role: string; pages: number[] }>;
    clauseRoleResults: Array<{ label: string; relationship: string; sourceIds: string[] }>;
    followUpContextApplied: boolean;
    activeIssueTerms: string[];
    operativeClauseValidationPassed: boolean;
    answerPropositionValidationPassed: boolean;
    draftPropositionValidationPassed: boolean;
    extractionDebrisRejected: boolean;
    initialErrors: string[];
    repairedErrors: string[];
    repairCount: number;
    fallbackStage: 'none' | 'repair' | 'minimal';
    semanticDuplicateCount: number;
    lengthTruncated: boolean;
    finalPassed: boolean;
    finalLength: number;
  };
}

// ---------------------------------------------------------------------------
// File Attachment — metadata for a file attached to a message
// ---------------------------------------------------------------------------

export interface FileAttachment {
  filename: string;
  mimeType: string;
  openaiFileId?: string;
  openaiTextFileId?: string;
  vectorStoreId?: string;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
}

// ---------------------------------------------------------------------------
// Recovery Result — output of the recovery pipeline
// ---------------------------------------------------------------------------

export interface RecoveryResult {
  data: NexxAssistantResponse;
  stage: 'initial_parse' | 'extract_json' | 'retry' | 'fallback';
}

// ---------------------------------------------------------------------------
// Conversation Summary — compacted memory
// ---------------------------------------------------------------------------

export interface ConversationSummary {
  decisions: string[];
  keyFacts: string[];
  dates: string[];
  goals: string[];
  unresolvedQuestions: string[];
  turnCount: number;
}

// ---------------------------------------------------------------------------
// Parsed Legal Document — structured metadata extracted from uploaded docs
// ---------------------------------------------------------------------------

export interface ParsedLegalDocument {
  title?: string;
  docType?: 'final_order' | 'temporary_order' | 'motion' | 'notice' |
            'declaration' | 'message_thread' | 'record';
  signedDate?: string;
  keyClauses?: string[];
  deadlines?: string[];
  obligations?: string[];
  custodyTerms?: string[];
  communicationTerms?: string[];
}

// ---------------------------------------------------------------------------
// Local Court Source — a legal source retrieved by the legal retriever
// ---------------------------------------------------------------------------

export interface LocalCourtSource {
  title: string;
  url: string;
  sourceType: string;
  snippet: string;
  jurisdiction?: string;
  citation?: string;
  retrievedAt: string;
}

// ---------------------------------------------------------------------------
// Vector Store Filter — metadata filters for vector store queries
// ---------------------------------------------------------------------------

export interface VectorStoreFilter {
  caseId?: string;
  conversationId?: string;
  docType?: ParsedLegalDocument['docType'];
  jurisdiction?: string;
  childInitials?: string;
  dateRange?: { start: string; end: string };
  source?: 'user_upload' | 'extracted_text' | 'legal_retriever' | 'template_library';
  originalFilename?: string;
}

// ---------------------------------------------------------------------------
// Judge Simulation Result — judge perspective scoring
// ---------------------------------------------------------------------------

export interface JudgeSimulationResult {
  credibilityScore: number;       // 1-10
  neutralityScore: number;        // 1-10
  clarityScore: number;           // 1-10
  strengths: string[];
  weaknesses: string[];
  likelyCourtInterpretation: string;
  improvementSuggestions: string[];
}

// ---------------------------------------------------------------------------
// Opposition Simulation Result — opposition attack-point analysis
// ---------------------------------------------------------------------------

export interface OppositionSimulationResult {
  likelyAttackPoints: string[];
  framingRisks: string[];
  whatNeedsTightening: string[];
  preemptionSuggestions: string[];
}

// ---------------------------------------------------------------------------
// Evidence Packet — retrieval re-rank/compress output
// ---------------------------------------------------------------------------

export interface EvidencePacket {
  keyPassages: Array<{
    sourceTitle: string;
    excerpt: string;
    reasonRelevant: string;
  }>;
  unresolvedGaps: string[];
}

// ---------------------------------------------------------------------------
// Legal Confidence — response confidence assessment
// Note: Uses "moderate" (not "medium") — intentionally different from
// CourtRuleProvenance.confidence which uses "medium" for source reliability
// ---------------------------------------------------------------------------

export interface LegalConfidence {
  confidence: 'high' | 'moderate' | 'low';
  basis: string;
  evidenceSufficiency: string;
  missingSupport: string[];
}

// ---------------------------------------------------------------------------
// Court Rule Provenance — source-backed court rule normalization
// Note: Uses "medium" (not "moderate") — measures source reliability,
// not response adequacy like LegalConfidence
// ---------------------------------------------------------------------------

export interface CourtRuleProvenance {
  field: string;
  value: string;
  sourceUrl: string;
  sourceSnippet: string;
  confidence: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Template Draft Plan — template fact requirements + gap analysis
// ---------------------------------------------------------------------------

export interface TemplateDraftPlan {
  templateId: string;
  requiredFacts: string[];
  optionalFacts: string[];
  missingFacts: string[];
  draftContent?: Array<{
    sectionId: string;
    heading: string;
    body: string;
    numberedItems?: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Debug Trace — NexxTrace structure
// ---------------------------------------------------------------------------

export interface NexxTrace {
  traceId: string;
  request: {
    route: string;
    routeMode: string;
    model: string;
    temperature: number;
    conversationId: string;
    userId: string;
    userMessage: string;
  };
  generation?: {
    rawResponseText: string;
    parsedJson?: unknown;
    parseSuccess: boolean;
    parseError?: string;
  };
  validation?: {
    responseValid: boolean;
    draftValid: boolean;
    timelineValid: boolean;
    exhibitValid: boolean;
    judgeSimValid: boolean;
    oppositionSimValid: boolean;
    confidenceValid: boolean;
  };
  artifacts?: {
    draftReady: unknown;
    timelineReady: unknown;
    exhibitReady: unknown;
    judgeSimulation: unknown;
    oppositionSimulation: unknown;
    confidence: unknown;
  };
  recovery?: {
    used: boolean;
    stage: string;
  };
  performance?: {
    latencyMs: number;
    tokenUsage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    vectorStoreHits?: number;
    localSourceHits?: number;
  };
  outcome: { success: boolean };
}

// ---------------------------------------------------------------------------
// Existing Types (preserved)
// ---------------------------------------------------------------------------

/** Context about the user and their NEX passed from the chat UI to the API route */
export interface UserContext {
    userName?: string;
    state?: string;
    county?: string;
    custodyType?: string;
    nexBehaviors?: string[];
    tonePreference?: string;
    emotionalState?: string;
    /** @deprecated Use children[] instead */
    childrenNames?: string[];
    /** @deprecated Use children[] instead */
    childrenAges?: number[];
    /** Consolidated children info */
    children?: { name: string; age: number }[];
    courtCaseNumber?: string;
    hasAttorney?: boolean;
    hasTherapist?: boolean;
    nexNickname?: string;
    nexCommunicationStyle?: string;
    nexManipulationTactics?: string[];
    nexTriggerPatterns?: string[];
    nexAiInsights?: string;
    nexDangerLevel?: number;
    nexDetectedPatterns?: string[];
    /** When true, full PII (children names, case numbers) is included in the prompt for drafting flows */
    isDraftingMode?: boolean;
    /** NEW — linked vector store for file search */
    vectorStoreId?: string;
    /** NEW — OpenAI Conversations API handle */
    openaiConversationId?: string;
}

/** A single legal statute search result from Tavily */
export interface LegalSearchResult {
    title: string;
    url: string;
    snippet: string;
}

/** Extended context passed to buildSystemPrompt — composes UserContext with server-side fields */
export interface BuildSystemPromptContext extends UserContext {
    conversationMode?: string;
    legalContext?: LegalSearchResult[];
}

