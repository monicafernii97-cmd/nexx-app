/**
 * Export Types — Request schemas, configs, mapped section outputs,
 *                prompt profiles, and review layer types.
 *
 * This file defines the contract between:
 * - Export modals (UI) → export request
 * - Mapping engine → mapped sections
 * - Review UI → user overrides
 * - Rendering pipeline → final output
 */

import type { SentenceType } from './classification';
import type { NarrativeSection, PatternSection } from './narrative';

// ═══════════════════════════════════════════════════════════════════════════
// Export Path + Source
// ═══════════════════════════════════════════════════════════════════════════

/** The three first-class export lanes. */
export type ExportPath = 'case_summary' | 'court_document' | 'exhibit_document';

/**
 * Where the document structure comes from:
 * - summary_default:       Built-in summary layout
 * - court_prompt_profile:  Court-aware prompt profile (existing documentDrafter)
 * - exhibit_prompt_profile: Exhibit-specific prompt profile
 * - saved_template:        User-saved custom template (via templateId)
 */
export type StructureSource =
    | 'summary_default'
    | 'court_prompt_profile'
    | 'exhibit_prompt_profile'
    | 'saved_template';

/** Supported output formats. */
export type OutputFormat = 'pdf' | 'docx' | 'html';

// ═══════════════════════════════════════════════════════════════════════════
// Prompt Profile
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PromptProfile — Controls document structure/style for a given export path.
 *
 * Export path controls *intent*. Prompt profile controls *structure*.
 * Template controls *final formatting*.
 */
export interface PromptProfile {
    id: string;
    name: string;
    category: ExportPath;
    systemInstructions: string;
    requiredSections?: string[];
    forbiddenSections?: string[];
    titleRules?: { pattern: string; description: string }[];
    formattingRules?: { rule: string; description: string }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Config Types Per Path
// ═══════════════════════════════════════════════════════════════════════════

/** Case Summary Report configuration. */
export interface SummaryConfig {
    audience: 'internal' | 'attorney' | 'client';
    detailLevel: 'concise' | 'standard' | 'detailed';
    organization: 'chronological' | 'issue_based' | 'topic_based';
    includeTimeline: boolean;
    includeEvidenceAppendix: boolean;
    includeRecommendations: boolean;
    outputFormat: OutputFormat;
}

/** Court Document configuration. */
export interface CourtConfig {
    documentType:
        | 'motion'
        | 'response'
        | 'notice'
        | 'declaration'
        | 'affidavit'
        | 'petition'
        | 'proposed_order'
        | 'objection';
    jurisdictionId?: string;
    partyRole?: 'petitioner' | 'respondent' | 'movant' | 'nonmovant';
    tone: 'neutral' | 'assertive' | 'judge_friendly' | 'detailed_advocacy';
    includeCaption: boolean;
    includeLegalStandard: boolean;
    includePrayer: boolean;
    includeCertificateOfService: boolean;
    includeProposedOrder: boolean;
    linkedExhibitIds?: string[];
    outputFormat: OutputFormat;
}

/** Exhibit Document configuration. */
export interface ExhibitConfig {
    /** Administrative = internal packet; Court-structured = filing-ready */
    exhibitMode: 'administrative' | 'court_structured';
    packetType:
        | 'index_only'
        | 'packet_only'
        | 'packet_with_index'
        | 'packet_with_covers'
        | 'hearing_binder'
        | 'mediation_binder';
    organization: 'chronological' | 'issue_based' | 'witness_based' | 'source_based';
    labelStyle: 'alpha' | 'numeric' | 'party_numeric';
    includeCoverSheets: boolean;
    includeSummaries: boolean;
    includeBatesNumbers: boolean;
    includeSourceMetadata: boolean;
    includeDividerPages: boolean;
    includeConfidentialNotes: boolean;
    mergedOutput: boolean;
    outputFormat: OutputFormat;
}

// ═══════════════════════════════════════════════════════════════════════════
// Export Request
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ExportRequest — The unified request object sent from an export modal
 * to the assembly engine.
 */
export interface ExportRequest {
    path: ExportPath;
    structureSource: StructureSource;
    promptProfileId?: string;
    templateId?: string;
    title?: string;
    selectedNodeIds: string[];
    selectedEvidenceIds: string[];
    selectedTimelineIds: string[];
    config: SummaryConfig | CourtConfig | ExhibitConfig;
    /**
     * Optional companion documents to generate alongside the primary export.
     * e.g., "Also generate matching exhibit packet" → ['exhibit_document']
     */
    companionOutputs?: ExportPath[];
}

// ═══════════════════════════════════════════════════════════════════════════
// Mapped Section Outputs — What each mapper produces
// ═══════════════════════════════════════════════════════════════════════════

/** Summary export mapped sections. */
export interface SummaryMappedSections {
    /** ISO timestamp of generation */
    generatedAt: string;
    /** Matter overview / executive summary */
    overview?: string;
    /** Party names and roles */
    parties?: string;
    /** Key legal issues identified */
    keyIssues: string[];
    /** Dedicated incident section (important incidents) */
    incidents: NarrativeSection[];
    /** Chronological factual timeline */
    timelineSummary: NarrativeSection[];
    /** Linked evidence references */
    evidenceOverview: string[];
    /** Detected patterns with supporting evidence */
    patternSummary: PatternSection[];
    /** Risks, contradictions, missing evidence */
    gapsOrOpenQuestions: string[];
    /** AI-suggested next steps */
    recommendedNextSteps: string[];
    /** All node IDs that contributed to this export */
    supportingNodeIds: string[];
}

/** Court document mapped sections. */
export interface CourtMappedSections {
    generatedAt: string;
    /** Court caption data for header generation */
    captionData?: {
        courtName?: string;
        county?: string;
        state?: string;
        causeNumber?: string;
        caseStyle?: string;
        partyRoles?: string[];
    };
    /** Filing title (e.g., "Respondent's Motion to Modify") */
    title?: string;
    /** Opening introduction paragraph */
    introduction?: string;
    /** Factual background sections (chronological) */
    factualBackground: NarrativeSection[];
    /** Legal standard / grounds sections */
    legalGrounds: NarrativeSection[];
    /** Argument sections */
    argumentSections: NarrativeSection[];
    /** Requested relief items */
    requestedRelief: string[];
    /** Exhibit references with labels */
    exhibitReferences: {
        label: string;
        description: string;
        linkedEvidenceId: string;
    }[];
    /** Procedure-related notes */
    procedureNotes: string[];
    /** Hints for signature block generation */
    signatureBlockHints?: string[];
    /** Hints for certificate of service generation */
    certificateOfServiceHints?: string[];
    /** All node IDs that contributed to this export */
    supportingNodeIds: string[];
}

/** Single exhibit item in a packet. */
export interface ExhibitMappedItem {
    label: string;
    title: string;
    date?: string;
    source?: string;
    summary?: string;
    relevance?: string;
    linkedEvidenceId: string;
    linkedNodeIds: string[];
    issueTags: string[];
}

/** Exhibit document mapped sections. */
export interface ExhibitMappedSections {
    generatedAt: string;
    /** Packet title (e.g., "Respondent's Exhibit Packet") */
    packetTitle?: string;
    /** Flat exhibit index entries */
    indexEntries: ExhibitMappedItem[];
    /** Grouped exhibits by chosen organization method */
    groupedExhibits: {
        groupName: string;
        items: ExhibitMappedItem[];
    }[];
    /** Cover sheet summaries with supporting issues */
    coverSheetSummaries: {
        label: string;
        heading: string;
        summary: string;
        supportingIssues: string[];
    }[];
    /** All node IDs that contributed to this export */
    supportingNodeIds: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// UI Review Layer
// ═══════════════════════════════════════════════════════════════════════════

/**
 * MappingReviewItem — One item in the pre-export review screen.
 *
 * Users can reclassify, move sections, exclude, edit, or re-link evidence
 * before finalizing the export.
 */
export interface MappingReviewItem {
    nodeId: string;
    originalText: string;
    dominantType: SentenceType;
    confidence: number;
    suggestedSections: string[];
    transformedCourtSafeText?: string;
    includedInExport: boolean;
    userOverride?: {
        /** Force reclassify to a different type */
        forceType?: SentenceType;
        /** Force into a specific document section */
        forceSection?: string;
        /** Exclude from export entirely */
        exclude?: boolean;
        /** User-edited version of the transformed text */
        editedText?: string;
        /** Override evidence linkage */
        linkedEvidenceOverride?: string[];
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════════════════

export type ValidationSeverity = 'warning' | 'error';

export interface ExportValidationIssue {
    severity: ValidationSeverity;
    message: string;
    /** Which nodes triggered this warning */
    affectedNodeIds?: string[];
}
