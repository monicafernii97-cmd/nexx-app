/**
 * Export Request Builder — Converts modal form state into a typed ExportRequest.
 *
 * Shared by all 3 export modals (Summary, Court, Exhibit).
 * Normalizes user selections into the ExportRequest contract that
 * the orchestrator and assembly engine expect.
 *
 * Usage:
 * ```typescript
 * import { buildSummaryRequest, buildCourtRequest, buildExhibitRequest } from './exportRequestBuilder';
 *
 * const request = buildCourtRequest({
 *     documentType: 'motion',
 *     tone: 'judge_friendly',
 *     includeCaption: true,
 *     ...
 * }, selectedNodeIds, selectedTimelineIds);
 * ```
 */

import type {
    ExportRequest,
    SummaryConfig,
    CourtConfig,
    ExhibitConfig,
    OutputFormat,
} from '../types/exports';

// ---------------------------------------------------------------------------
// Summary Request Builder
// ---------------------------------------------------------------------------

/** Form state from the Summary Export Modal. */
export interface SummaryFormState {
    audience: 'internal' | 'attorney' | 'client';
    detailLevel: 'concise' | 'standard' | 'detailed';
    organization: 'chronological' | 'issue_based' | 'topic_based';
    includeTimeline: boolean;
    includeEvidenceAppendix: boolean;
    includeRecommendations: boolean;
    outputFormat: OutputFormat;
    title?: string;
}

/** Default values for the Summary Export Modal. */
export const SUMMARY_DEFAULTS: SummaryFormState = {
    audience: 'internal',
    detailLevel: 'standard',
    organization: 'chronological',
    includeTimeline: true,
    includeEvidenceAppendix: true,
    includeRecommendations: true,
    outputFormat: 'pdf',
};

/** Build an ExportRequest for the case_summary path. */
export function buildSummaryRequest(
    form: SummaryFormState,
    selectedNodeIds: string[],
    selectedEvidenceIds: string[],
    selectedTimelineIds: string[],
): ExportRequest {
    const config: SummaryConfig = {
        audience: form.audience,
        detailLevel: form.detailLevel,
        organization: form.organization,
        includeTimeline: form.includeTimeline,
        includeEvidenceAppendix: form.includeEvidenceAppendix,
        includeRecommendations: form.includeRecommendations,
        outputFormat: form.outputFormat,
    };

    return {
        path: 'case_summary',
        structureSource: 'summary_default',
        title: form.title,
        selectedNodeIds,
        selectedEvidenceIds,
        selectedTimelineIds,
        config,
    };
}

// ---------------------------------------------------------------------------
// Court Request Builder
// ---------------------------------------------------------------------------

/** Form state from the Court Export Modal. */
export interface CourtFormState {
    documentType: CourtConfig['documentType'];
    tone: CourtConfig['tone'];
    partyRole?: CourtConfig['partyRole'];
    includeCaption: boolean;
    includeLegalStandard: boolean;
    includePrayer: boolean;
    includeCertificateOfService: boolean;
    includeProposedOrder: boolean;
    linkedExhibitIds?: string[];
    outputFormat: OutputFormat;
    title?: string;
    jurisdictionId?: string;
}

/** Default values for the Court Export Modal. */
export const COURT_DEFAULTS: CourtFormState = {
    documentType: 'motion',
    tone: 'judge_friendly',
    includeCaption: true,
    includeLegalStandard: true,
    includePrayer: true,
    includeCertificateOfService: true,
    includeProposedOrder: false,
    outputFormat: 'pdf',
};

/** Build an ExportRequest for the court_document path. */
export function buildCourtRequest(
    form: CourtFormState,
    selectedNodeIds: string[],
    selectedEvidenceIds: string[],
    selectedTimelineIds: string[],
): ExportRequest {
    const config: CourtConfig = {
        documentType: form.documentType,
        tone: form.tone,
        partyRole: form.partyRole,
        includeCaption: form.includeCaption,
        includeLegalStandard: form.includeLegalStandard,
        includePrayer: form.includePrayer,
        includeCertificateOfService: form.includeCertificateOfService,
        includeProposedOrder: form.includeProposedOrder,
        linkedExhibitIds: form.linkedExhibitIds,
        jurisdictionId: form.jurisdictionId,
        outputFormat: form.outputFormat,
    };

    return {
        path: 'court_document',
        structureSource: 'court_prompt_profile',
        title: form.title,
        selectedNodeIds,
        selectedEvidenceIds,
        selectedTimelineIds,
        config,
    };
}

// ---------------------------------------------------------------------------
// Exhibit Request Builder
// ---------------------------------------------------------------------------

/** Form state from the Exhibit Export Modal. */
export interface ExhibitFormState {
    exhibitMode: ExhibitConfig['exhibitMode'];
    packetType: ExhibitConfig['packetType'];
    organization: ExhibitConfig['organization'];
    labelStyle: ExhibitConfig['labelStyle'];
    includeCoverSheets: boolean;
    includeSummaries: boolean;
    includeBatesNumbers: boolean;
    includeSourceMetadata: boolean;
    includeDividerPages: boolean;
    includeConfidentialNotes: boolean;
    mergedOutput: boolean;
    outputFormat: OutputFormat;
    title?: string;
}

/** Default values for the Exhibit Export Modal. */
export const EXHIBIT_DEFAULTS: ExhibitFormState = {
    exhibitMode: 'court_structured',
    packetType: 'packet_with_index',
    organization: 'chronological',
    labelStyle: 'alpha',
    includeCoverSheets: true,
    includeSummaries: true,
    includeBatesNumbers: false,
    includeSourceMetadata: true,
    includeDividerPages: true,
    includeConfidentialNotes: false,
    mergedOutput: true,
    outputFormat: 'pdf',
};

/** Build an ExportRequest for the exhibit_document path. */
export function buildExhibitRequest(
    form: ExhibitFormState,
    selectedNodeIds: string[],
    selectedEvidenceIds: string[],
    selectedTimelineIds: string[],
): ExportRequest {
    const config: ExhibitConfig = {
        exhibitMode: form.exhibitMode,
        packetType: form.packetType,
        organization: form.organization,
        labelStyle: form.labelStyle,
        includeCoverSheets: form.includeCoverSheets,
        includeSummaries: form.includeSummaries,
        includeBatesNumbers: form.includeBatesNumbers,
        includeSourceMetadata: form.includeSourceMetadata,
        includeDividerPages: form.includeDividerPages,
        includeConfidentialNotes: form.includeConfidentialNotes,
        mergedOutput: form.mergedOutput,
        outputFormat: form.outputFormat,
    };

    return {
        path: 'exhibit_document',
        structureSource: 'exhibit_prompt_profile',
        title: form.title,
        selectedNodeIds,
        selectedEvidenceIds,
        selectedTimelineIds,
        config,
    };
}
