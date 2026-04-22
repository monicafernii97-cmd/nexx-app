/**
 * Canonical Export Document Model
 *
 * The single structural contract for all export rendering paths.
 * Every drafted export — court document, case summary, exhibit packet,
 * timeline summary, incident report — MUST be shaped into this model
 * before reaching any renderer.
 *
 * Renderers accept CanonicalExportDocument + ExportJurisdictionProfile.
 * They never reconstruct structure from raw drafted content.
 */

// ═══════════════════════════════════════════════════════════════
// Export Path
// ═══════════════════════════════════════════════════════════════

/** The five first-class export output families. */
export type ExportPath =
  | 'court_document'
  | 'case_summary'
  | 'exhibit_document'
  | 'timeline_summary'
  | 'incident_report';

// ═══════════════════════════════════════════════════════════════
// Canonical Export Document
// ═══════════════════════════════════════════════════════════════

/**
 * The canonical export document — source of truth for all renderers.
 *
 * Built by `adaptDraftedToCanonicalExport()` after the drafting +
 * review + override pipeline completes. No renderer should reference
 * raw `DraftedSection[]` or reconstruct structure.
 */
export type CanonicalExportDocument = {
  /** Which export path this document follows. Determines renderer selection. */
  path: ExportPath;
  /** Document title (uppercase by convention for court documents). */
  title: string;
  /** Optional subtitle or motion descriptor. */
  subtitle?: string;

  /** Jurisdiction and case metadata. */
  metadata: {
    caseId?: string;
    causeNumber?: string;
    jurisdiction?: {
      country?: string;
      state?: string;
      county?: string;
      courtName?: string;
      courtType?: string;
      district?: string;
      division?: string;
    };
    partyRole?: string;
    documentType?: string;
  };

  /** Court-style caption block (null = not applicable for this path). */
  caption?: ExportCaption | null;

  /** Body sections — discriminated union based on export path. */
  sections: ExportSection[];

  /** Signature block (court documents). */
  signature?: ExportSignatureBlock | null;
  /** Certificate of Service (court documents). */
  certificate?: ExportCertificateBlock | null;
  /** Verification / sworn statement. */
  verification?: ExportVerificationBlock | null;

  /** Exhibit packet configuration (exhibit_document only). */
  exhibitPacket?: ExhibitPacketData | null;
  /** Timeline visual data (timeline_summary / incident_report only). */
  timelineVisual?: TimelineVisualData | null;
};

// ═══════════════════════════════════════════════════════════════
// Caption
// ═══════════════════════════════════════════════════════════════

/** Court-style caption block with jurisdiction-specific layout. */
export type ExportCaption = {
  style:
    | 'texas_pleading'
    | 'federal_caption'
    | 'generic_state_caption'
    | 'in_re_caption';
  causeLine?: string;
  leftLines: string[];
  centerLines: string[];
  rightLines: string[];
};

// ═══════════════════════════════════════════════════════════════
// Sections (Discriminated Union)
// ═══════════════════════════════════════════════════════════════

/** All possible section types a renderer may encounter. */
export type ExportSection =
  | CourtSection
  | SummarySection
  | ExhibitIndexSection
  | ExhibitCoverSection
  | ExhibitContentSection
  | ExhibitImageSection
  | ExhibitChartSection
  | TimelineSection;

/** A body section in a court document (factual background, argument, prayer, etc.). */
export type CourtSection = {
  kind: 'court_section';
  id: string;
  heading?: string;
  paragraphs?: string[];
  numberedItems?: string[];
  bulletItems?: string[];
};

/** A section in a case/workspace summary report. */
export type SummarySection = {
  kind: 'summary_section';
  id: string;
  heading: string;
  paragraphs?: string[];
  bulletItems?: string[];
};

/** Exhibit index table (list of all exhibits with labels + descriptions). */
export type ExhibitIndexSection = {
  kind: 'exhibit_index';
  id: string;
  heading: string;
  entries: ExhibitIndexEntry[];
};

/** Single entry in the exhibit index. */
export type ExhibitIndexEntry = {
  label: string;
  description: string;
};

/** Exhibit cover sheet (one per exhibit). */
export type ExhibitCoverSection = {
  kind: 'exhibit_cover';
  id: string;
  heading: string;
  exhibitLabel: string;
  summaryLines: string[];
  sourceType?: string;
  dateRange?: string;
};

/** Text content section of an exhibit. */
export type ExhibitContentSection = {
  kind: 'exhibit_content';
  id: string;
  exhibitLabel: string;
  heading?: string;
  paragraphs?: string[];
  imageRefs?: string[];
  sourceType?: string;
  stampedTitle?: string;
};

/** Image/screenshot exhibit page. */
export type ExhibitImageSection = {
  kind: 'exhibit_image';
  id: string;
  exhibitLabel: string;
  heading?: string;
  imagePath: string;
  caption?: string;
  sourceType?: string;
  stampedTitle?: string;
  date?: string;
};

/** Chart/graph exhibit page. */
export type ExhibitChartSection = {
  kind: 'exhibit_chart';
  id: string;
  exhibitLabel: string;
  heading?: string;
  imagePath: string;
  caption?: string;
  sourceType?: string;
  stampedTitle?: string;
  date?: string;
};

/** Chronological timeline section with display-ready events. */
export type TimelineSection = {
  kind: 'timeline_section';
  id: string;
  heading: string;
  events: TimelineEventDisplay[];
};

// ═══════════════════════════════════════════════════════════════
// Closing Blocks
// ═══════════════════════════════════════════════════════════════

/** Signature block for court documents. */
export type ExportSignatureBlock = {
  intro?: string;
  signerLines: string[];
};

/** Certificate of Service block. */
export type ExportCertificateBlock = {
  heading: string;
  bodyLines: string[];
  signerLines: string[];
};

/** Verification / sworn statement block. */
export type ExportVerificationBlock = {
  heading?: string;
  bodyLines: string[];
  signerLines: string[];
};

// ═══════════════════════════════════════════════════════════════
// Exhibit Packet Configuration
// ═══════════════════════════════════════════════════════════════

/** Configuration for how an exhibit packet is assembled and labeled. */
export type ExhibitPacketData = {
  packetTitle: string;
  organizationMode:
    | 'chronological'
    | 'issue_based'
    | 'witness_based'
    | 'source_based';
  labelStyle: 'alpha' | 'numeric' | 'party_numeric';
  bates?: {
    enabled: boolean;
    prefix?: string;
    startNumber?: number;
  };
};

// ═══════════════════════════════════════════════════════════════
// Timeline Visual Data
// ═══════════════════════════════════════════════════════════════

/** Configuration for timeline/incident visual rendering. */
export type TimelineVisualData = {
  mode: 'summary' | 'exhibit';
  title: string;
  events: TimelineEventDisplay[];
};

/** A single display-ready timeline event. */
export type TimelineEventDisplay = {
  date?: string;
  title: string;
  description?: string;
  sourceRefs?: string[];
};
