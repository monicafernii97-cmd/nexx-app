/**
 * Classification Types — Sentence-level and node-level classification schemas.
 *
 * The classification engine works in two stages:
 * 1. Sentence-level: Split text → classify each sentence → extract signals/entities
 * 2. Node-level: Aggregate sentence scores → determine dominant type → score relevance
 *
 * All scoring is deterministic (keyword/phrase rules, not LLM).
 */

import type { WorkspaceNodeType } from './workspace';

// ---------------------------------------------------------------------------
// Content Types — The 11 categories every sentence/node is scored against
// ---------------------------------------------------------------------------

export type SentenceType =
    | 'fact'
    | 'argument'
    | 'request'
    | 'emotion'
    | 'opinion'
    | 'procedure'
    | 'evidence_reference'
    | 'timeline_event'
    | 'issue'
    | 'risk'
    | 'unknown';

/** All valid sentence types as array for iteration. */
export const SENTENCE_TYPES: SentenceType[] = [
    'fact', 'argument', 'request', 'emotion', 'opinion',
    'procedure', 'evidence_reference', 'timeline_event',
    'issue', 'risk', 'unknown',
];

// ---------------------------------------------------------------------------
// Extracted Signals — Boolean flags from keyword/phrase detection
// ---------------------------------------------------------------------------

export interface ExtractedSignals {
    hasDate: boolean;
    hasTime: boolean;
    hasNamedPerson: boolean;
    hasCourtTerm: boolean;
    hasReliefVerb: boolean;
    hasEmotionWord: boolean;
    hasReasoningPhrase: boolean;
    hasSourceReference: boolean;
    hasSpeculationLanguage: boolean;
    hasCharacterJudgment: boolean;
    hasSweepingGeneralization: boolean;
    hasEventVerb: boolean;
    hasChronologicalLanguage: boolean;
    hasBestInterestFraming: boolean;
    hasStatuteOrRule: boolean;
}

// ---------------------------------------------------------------------------
// Extracted Entities — Named entities pulled from text
// ---------------------------------------------------------------------------

export interface ExtractedEntities {
    people: string[];
    dates: string[];
    locations: string[];
    courts: string[];
    filings: string[];
    exhibits: string[];
    statutesOrRules: string[];
}

/** Create an empty ExtractedEntities. */
export function emptyEntities(): ExtractedEntities {
    return {
        people: [],
        dates: [],
        locations: [],
        courts: [],
        filings: [],
        exhibits: [],
        statutesOrRules: [],
    };
}

// ---------------------------------------------------------------------------
// Sentence-Level Classification
// ---------------------------------------------------------------------------

export interface SentenceClassification {
    /** The classified sentence text */
    sentence: string;
    /** Start character index in original text */
    startIndex: number;
    /** End character index in original text */
    endIndex: number;
    /** Scores per content type (0-1, additive, capped at 1.0) */
    scores: Record<SentenceType, number>;
    /** Highest-scoring type after tie-break rules */
    dominantType: SentenceType;
    /** Confidence in the dominant classification (0-1) */
    confidence: number;
    /** Boolean signal flags from keyword detection */
    extractedSignals: ExtractedSignals;
    /** Named entities extracted from the sentence */
    extractedEntities: ExtractedEntities;
}

// ---------------------------------------------------------------------------
// Node-Level Scores
// ---------------------------------------------------------------------------

/** Content scores per type — aggregate of all sentence scores in a node. */
export type ContentScoreSet = Record<SentenceType, number>;

/** Create zero-initialized content scores. */
export function emptyScores(): ContentScoreSet {
    const scores = {} as ContentScoreSet;
    for (const t of SENTENCE_TYPES) scores[t] = 0;
    return scores;
}

/** Export relevance scores — how relevant is this node to each export path. */
export interface ExportRelevanceScoreSet {
    case_summary: number;
    court_document: number;
    exhibit_document: number;
}

// ---------------------------------------------------------------------------
// Classified Node — Full classification output for a workspace node
// ---------------------------------------------------------------------------

export interface ClassifiedNode {
    /** Original workspace node ID */
    nodeId: string;
    /** Original node type */
    nodeType: WorkspaceNodeType;
    /** Original raw text */
    rawText: string;
    /** Cleaned text (trimmed, normalized whitespace) */
    cleanedText: string;

    // ── Sentence-Level Detail ──
    /** Individual sentence classifications */
    sentenceClassifications: SentenceClassification[];

    // ── Aggregate Scores ──
    /** Aggregated content scores across all sentences */
    scores: ContentScoreSet;
    /** Dominant content type for the whole node */
    dominantType: SentenceType;
    /** Overall confidence (0-1) */
    confidence: number;

    // ── Tags ──
    /** General content tags */
    tags: string[];
    /** Issue-specific tags (e.g., 'electronic_communication', 'school_stability') */
    issueTags: string[];
    /** Pattern tags (e.g., 'flexibility_reversion', 'delay_tactics') */
    patternTags: string[];

    // ── Entities ──
    /** Merged entities from all sentences */
    extractedEntities: ExtractedEntities;

    // ── Relevance ──
    /** How relevant this node is to each export path (0-1) */
    exportRelevance: ExportRelevanceScoreSet;
    /** Suggested destination sections per export path */
    suggestedSections: {
        case_summary: string[];
        court_document: string[];
        exhibit_document: string[];
    };

    // ── Transformed Text ──
    /** Export-safe versions of the text */
    transformedText: {
        /** For case summary: emotional context compressed, readable */
        summarySafe?: string;
        /** For court document: emotion stripped/transformed, fact/argument only */
        courtSafe?: string;
        /** For exhibit summaries: fact + evidence focus */
        exhibitSummarySafe?: string;
    };

    // ── Source Traceability ──
    /** Provenance tracking for every classified node */
    provenance: {
        sourceDocumentId?: string;
        sourceMessageId?: string;
        sourceConversationId?: string;
        linkedEvidenceIds: string[];
        linkedTimelineIds: string[];
        /** The original WorkspaceNode.id this was classified from */
        originatingNodeId: string;
    };
}

// ---------------------------------------------------------------------------
// Convenience Helpers
// ---------------------------------------------------------------------------

/** Filter sentences by dominant type from a classified node. */
export function filterSentences(
    node: ClassifiedNode,
    type: SentenceType,
): SentenceClassification[] {
    return node.sentenceClassifications.filter(s => s.dominantType === type);
}

/** Get fact sentences from a classified node. */
export function getFactSentences(node: ClassifiedNode): SentenceClassification[] {
    return filterSentences(node, 'fact');
}

/** Get argument sentences from a classified node. */
export function getArgumentSentences(node: ClassifiedNode): SentenceClassification[] {
    return filterSentences(node, 'argument');
}

/** Get emotion sentences from a classified node. */
export function getEmotionSentences(node: ClassifiedNode): SentenceClassification[] {
    return filterSentences(node, 'emotion');
}
