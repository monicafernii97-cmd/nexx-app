/**
 * Legal Document Generation System — Barrel Export
 *
 * Single entry point for all legal document generation utilities.
 */

// ── Types ──
export type {
  CourtFormattingRules,
  DocumentTemplate,
  DocumentSection,
  DocumentCategory,
  CaseType,
  SectionType,
  CaptionData,
  VersusCaption,
  ExhibitEntry,
  ExhibitCategory,
  ExhibitLabelType,
  TextExcerptExhibit,
  TimelineEntry,
  KeyPointBox,
  SignatureBlockData,
  DocumentGenerationRequest,
  DocumentGenerationResult,
  GeneratedSection,
  ComplianceReport,
  ComplianceCheck,
} from './types';

// ── Court Rules ──
export {
  NEXX_DEFAULTS,
  TEXAS_RULES,
  FORT_BEND_COUNTY_TX,
  STATE_RULES,
  COUNTY_OVERRIDES,
  getMergedRules,
  getCountyRequirements,
} from './courtRules';
export type { CountyOverrides } from './courtRules';

// ── Templates ──
export {
  TEMPLATE_LIBRARY,
  TEMPLATE_CATEGORY_LABELS,
  getTemplate,
  getTemplatesByCategory,
  getTemplatesForCaseType,
  searchTemplates,
} from './templates';

// ── HTML Template Renderer ──
export {
  renderDocumentHTML,
  renderExhibitCover,
  renderExhibitIndex,
  renderTextExcerptExhibit,
} from './templateRenderer';
export type { RenderDocumentOptions } from './templateRenderer';
