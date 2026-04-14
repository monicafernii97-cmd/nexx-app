/**
 * UI Intelligence — barrel export for all types, panel library,
 * presentation rules, action routing, and dual output logic.
 */

// Types
export type {
  ResponseIntent,
  PanelType,
  PanelTone,
  PanelData,
  SaveType,
  ActionType,
  ActionTier,
  SaveSuggestion,
  EligibilityFlags,
  ResponsePresentation,
  AssistantResponseViewModel,
  CaseContextChip,
  PinnableClass,
  PinnedItem,
  AnalysisStepStatus,
  AnalysisStep,
  RiskSubtype,
  StrengthSubtype,
  PatternType,
  DetectedPattern,
  LocalProcedureInfo,
  PanelInteraction,
  PanelUsageEvent,
} from './types';

// Panel Library
export { PANEL_TITLES, PANEL_TONES, getPanelTitle, getPanelTone } from './panel-library';

// Presentation Rules
export { buildPresentation, getPanelOrder } from './presentation-rules';

// Action Routing
export {
  ACTION_LABELS,
  ACTION_ICONS,
  getActionTier,
  getActionLabel,
  getActionIcon,
  filterActionsByTier,
} from './action-routing';

// Dual Output
export { isWorkProduct, splitGuidanceAndWorkProduct } from './dual-output';

// Panel Audit
export type { PanelEngagement, PanelAction, PanelRecommendation } from './panel-audit';
export { computePanelEngagement, buildPanelRecommendations } from './panel-audit';

// UI Self-Audit
export type { AuditSeverity, AuditArea, UiAuditFinding, UiLibraryAudit } from './ui-audit';
export { buildUiLibraryAudit } from './ui-audit';

// Feedback Loop
export type { SignalType, SignalConfidence, FeedbackSignal } from './feedback-loop';
export { buildFeedbackSignals } from './feedback-loop';
