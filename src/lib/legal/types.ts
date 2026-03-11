/**
 * Legal Document Generation — Core Types
 *
 * Types for court formatting rules, document templates,
 * exhibit components, and the document generation pipeline.
 */

// ═══════════════════════════════════════════════════════════════
// Court Formatting Rules
// ═══════════════════════════════════════════════════════════════

/** Physical page and typography settings derived from court rules */
export interface CourtFormattingRules {
  // ── Page Setup ──
  paperWidth: number;        // inches (8.5 standard)
  paperHeight: number;       // inches (11 standard)
  marginTop: number;         // inches
  marginBottom: number;      // inches
  marginLeft: number;        // inches
  marginRight: number;       // inches

  // ── Typography ──
  fontFamily: string;        // 'Times New Roman' | 'Arial' | etc.
  fontSize: number;          // points (12 standard)
  lineSpacing: number;       // multiplier (1.5 = 18pt for 12pt font)
  footnoteFontSize: number;  // points
  bodyAlignment: 'left' | 'justify';

  // ── Caption Style ──
  captionStyle: 'section-symbol' | 'versus' | 'centered';
  captionColumnWidths: {
    left: number;   // inches
    center: number; // inches (§ column)
    right: number;  // inches
  };
  causeNumberPosition: 'centered-above' | 'top-right' | 'inline';

  // ── Page Structure ──
  pageNumbering: boolean;
  pageNumberPosition: 'bottom-center' | 'bottom-right' | 'footer-split';
  pageNumberFormat: 'simple' | 'x-of-y';
  footerEnabled: boolean;
  footerFontSize: number;    // points (10 standard for footers)

  // ── Paragraph & Heading Formatting ──
  paragraphIndent: number;   // inches (0.5 standard)
  sectionHeadingStyle: 'bold-caps' | 'bold-titlecase' | 'underline';
  titleStyle: 'bold-caps-centered';
  spacingBeforeHeading: number; // blank lines
  spacingBetweenParagraphs: number; // blank lines

  // ── Required Sections ──
  requiresCertificateOfService: boolean;
  requiresSignatureBlock: boolean;
  requiresVerification: boolean;
  requiresCivilCaseInfoSheet: boolean;

  // ── E-Filing ──
  eFilingMandatory: boolean;
  eFilingPortal?: string;
  redactionRequired: boolean;

  // ── State/Local Notes ──
  notes: string[];
}

// ═══════════════════════════════════════════════════════════════
// Document Templates
// ═══════════════════════════════════════════════════════════════

/** Categories for organizing document types */
export type DocumentCategory =
  | 'petition'
  | 'motion_temporary'
  | 'motion_procedure'
  | 'motion_custody'
  | 'motion_enforcement'
  | 'motion_discovery'
  | 'motion_resolution'
  | 'response'
  | 'counter_filing'
  | 'notice_hearing'
  | 'notice_filing'
  | 'notice_case_status'
  | 'notice_parenting'
  | 'declaration'
  | 'order'
  | 'certificate'
  | 'exhibit'
  | 'other';

/** Case type determines caption format and required sections */
export type CaseType =
  | 'divorce_with_children'
  | 'divorce_without_children'
  | 'custody_establishment'
  | 'custody_modification'
  | 'child_support'
  | 'child_support_modification'
  | 'paternity'
  | 'protective_order'
  | 'enforcement'
  | 'termination'
  | 'sapcr'           // Suit Affecting Parent-Child Relationship
  | 'relocation'
  | 'visitation'
  | 'other';

/** Represents a single document template in the library */
export interface DocumentTemplate {
  id: string;
  title: string;                    // e.g., "Motion for Temporary Orders"
  category: DocumentCategory;
  caseTypes: CaseType[];            // which case types this template applies to
  description: string;
  /** Which sections this document template includes */
  sections: DocumentSection[];
  /** Whether this requires a supporting declaration */
  requiresDeclaration: boolean;
  /** Whether a proposed order should accompany this filing */
  requiresProposedOrder: boolean;
  /** Whether exhibits are commonly attached */
  supportsExhibits: boolean;
  /** States where this template name differs */
  stateVariants?: Record<string, string>; // e.g., { 'CA': 'Complaint for...' }
}

/** A section within a document template */
export interface DocumentSection {
  id: string;
  type: SectionType;
  title?: string;          // e.g., "I. Background"
  required: boolean;
  /** Placeholder content / guidance for the AI drafter */
  guidance?: string;
}

export type SectionType =
  | 'caption'
  | 'title'
  | 'court_address'       // "TO THE HONORABLE JUDGE OF SAID COURT:"
  | 'introduction'
  | 'body_numbered'        // Numbered paragraphs
  | 'body_sections'        // Roman-numeral headed sections (I., II., III.)
  | 'prayer_for_relief'
  | 'signature_block'
  | 'certificate_of_service'
  | 'verification'
  | 'judge_signature'
  | 'approval_line'
  | 'notary_block'
  | 'exhibit_index'
  | 'horizontal_rule';

// ═══════════════════════════════════════════════════════════════
// Caption / Header Data
// ═══════════════════════════════════════════════════════════════

/** Data needed to populate the caption block */
export interface CaptionData {
  causeNumber: string;
  /** Left column lines (case style) */
  leftLines: string[];         // e.g., ["IN THE INTEREST OF", "AMELIA SOFIA...", "A CHILD"]
  /** Right column lines (court info) */
  rightLines: string[];        // e.g., ["IN THE DISTRICT COURT", "387TH JUDICIAL DISTRICT", "FORT BEND COUNTY, TEXAS"]
  /** Caption style (TX uses §, most others use "v.") */
  style: 'section-symbol' | 'versus';
}

/** Data for populating the versus-style caption (most states outside TX) */
export interface VersusCaption {
  causeNumber: string;
  plaintiff: string;
  plaintiffRole: string;       // "Petitioner" | "Plaintiff"
  defendant: string;
  defendantRole: string;       // "Respondent" | "Defendant"
  courtName: string;
  division?: string;
}

// ═══════════════════════════════════════════════════════════════
// Exhibit Types
// ═══════════════════════════════════════════════════════════════

/** Exhibit labeling system */
export type ExhibitLabelType = 'numeric' | 'alpha';

/** A single exhibit in a filing */
export interface ExhibitEntry {
  label: string;                 // "Exhibit 1" or "Exhibit A"
  title: string;                 // Short description
  category?: ExhibitCategory;
  pageCount?: number;
  batesStart?: string;           // e.g., "FERNANDEZ 001"
  batesEnd?: string;             // e.g., "FERNANDEZ 015"
  /** Summary text for the cover page */
  summary?: string;
  /** Authentication language */
  authentication?: string;
}

export type ExhibitCategory =
  | 'court_document'
  | 'communication'
  | 'medical'
  | 'financial'
  | 'school'
  | 'safety'
  | 'photo_video'
  | 'other';

/** Text message exhibit with highlighted key points */
export interface TextExcerptExhibit {
  exhibitLabel: string;
  title: string;
  platform: string;              // "AppClose", "iMessage", "WhatsApp", etc.
  dateRange: string;             // "January–March 2026"
  /** Summary points shown on the cover page */
  summaryPoints: string[];
  /** Timeline entries */
  timeline: TimelineEntry[];
  /** Key point highlight boxes */
  keyPoints: KeyPointBox[];
}

export interface TimelineEntry {
  date: string;
  description: string;
  exhibitReference?: string;     // e.g., "See Exhibit 4, Bates FERNANDEZ 042"
}

export interface KeyPointBox {
  type: 'key_point' | 'records_reflect' | 'pattern';
  content: string;
  pageReference?: string;
}

// ═══════════════════════════════════════════════════════════════
// Signature Blocks
// ═══════════════════════════════════════════════════════════════

export interface SignatureBlockData {
  type: 'party' | 'judge' | 'notary' | 'approval';
  name: string;
  role: string;                  // "Petitioner Pro Se", "Attorney for Petitioner", etc.
  address?: string;
  phone?: string;
  email?: string;
  barNumber?: string;
  /** Whether to use /s/ electronic signature */
  electronicSignature: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Document Generation Request / Response
// ═══════════════════════════════════════════════════════════════

/** Request to generate a legal document */
export interface DocumentGenerationRequest {
  templateId: string;
  caseType: CaseType;
  /** User's court settings (state, county, court, etc.) */
  courtSettings: {
    state: string;
    county: string;
    courtName?: string;
    judicialDistrict?: string;
    assignedJudge?: string;
  };
  /** Caption data */
  caption: CaptionData;
  /** Party info for signature blocks */
  petitioner: SignatureBlockData;
  respondent?: { name: string };
  /** Children (for SAPCR / custody cases) */
  children?: { name: string; age?: number }[];
  /** AI-generated body content (structured sections) */
  bodyContent: GeneratedSection[];
  /** Exhibits to include */
  exhibits?: ExhibitEntry[];
  /** Formatting overrides (user's verified settings) */
  formattingOverrides?: Partial<CourtFormattingRules>;
}

/** A section of AI-generated content */
export interface GeneratedSection {
  /** Must match the DocumentSection.id in the template for correct rendering order */
  sectionId?: string;
  sectionType: SectionType;
  heading?: string;
  content: string;               // HTML content
  numberedItems?: string[];      // For numbered paragraph sections
}

/** Result of document generation */
export interface DocumentGenerationResult {
  success: boolean;
  pdfBuffer?: ArrayBuffer;
  htmlPreview?: string;
  complianceReport?: ComplianceReport;
  errors?: string[];
}

// ═══════════════════════════════════════════════════════════════
// AI Compliance Check
// ═══════════════════════════════════════════════════════════════

export interface ComplianceReport {
  overallStatus: 'pass' | 'warning' | 'fail';
  checks: ComplianceCheck[];
  suggestions: string[];
}

export interface ComplianceCheck {
  rule: string;
  status: 'pass' | 'warning' | 'fail';
  detail: string;
  fix?: string;
}
