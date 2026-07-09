export type LitigationNavigationAnswerType = 'litigation_navigation';

export type LitigationNavigationResponse = {
  answerType: LitigationNavigationAnswerType;
  supportiveSummary: string;
  immediatePriority: {
    priority: string;
    whyItMatters: string;
    whatToDoNow: string;
  };
  issueBreakdown: Array<{
    issue: string;
    priority: 'urgent' | 'high' | 'medium' | 'later';
    whatItMeans: string;
    nextStep: string;
  }>;
  courtPosture: {
    whatWeKnow: string[];
    whatWeNeed: string[];
    possibleFilingOrResponse:
      | 'answer'
      | 'response_to_motion'
      | 'counterpetition'
      | 'declaration'
      | 'motion_to_modify'
      | 'motion_to_enforce'
      | 'temporary_orders_response'
      | 'unknown';
    deadlineNote: string | null;
    hearingNote: string | null;
  };
  coParentResponse: {
    needed: boolean;
    strategy: string;
    neutralDraft: string | null;
    firmerDraft: string | null;
    whatNotToSay: string[];
  };
  evidencePlan: {
    timelineItems: string[];
    evidenceToSave: string[];
    neutralFraming: string[];
    exhibitIdeas: string[];
  };
  proSeAssessment: {
    possibleProSe: boolean;
    practicalRead: string;
    tasksLikelyDoableProSe: string[];
    tasksHigherRiskWithoutAttorney: string[];
    limitedScopeHelpRecommendedFor: string[];
  };
  costOverview: {
    proSeCostCategories: string[];
    attorneyCostCategories: string[];
    exactCostsRequireLocalLookup: boolean;
    costExplanation: string;
  };
  resourcePlan: {
    stateNeeded: boolean;
    countyNeeded: boolean;
    resourceTypesToFind: string[];
    suggestedSearchTargets: string[];
  };
  judgeExplanation: {
    simpleTheory: string;
    judgeReadyStructure: string[];
    sampleOpening: string | null;
  };
  filingPlan: {
    likelyNextDocument: string | null;
    filingReadinessChecklist: string[];
    nextInfoNeededBeforeDrafting: string[];
  };
  nextSteps: string[];
};

const POSSIBLE_FILING_OR_RESPONSE_VALUES = new Set([
  'answer',
  'response_to_motion',
  'counterpetition',
  'declaration',
  'motion_to_modify',
  'motion_to_enforce',
  'temporary_orders_response',
  'unknown',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isOptionalString(value: unknown) {
  return value === null || typeof value === 'string';
}

function hasStringFields(value: unknown, fields: string[]) {
  if (!isObject(value)) return false;
  return fields.every((field) => typeof value[field] === 'string');
}

export function validateLitigationNavigationResponseShape(value: unknown): value is LitigationNavigationResponse {
  if (!isObject(value)) return false;
  if (value.answerType !== 'litigation_navigation') return false;
  if (typeof value.supportiveSummary !== 'string') return false;
  if (!hasStringFields(value.immediatePriority, ['priority', 'whyItMatters', 'whatToDoNow'])) return false;

  if (!Array.isArray(value.issueBreakdown)) return false;
  if (!value.issueBreakdown.every((item) => (
    isObject(item) &&
    typeof item.issue === 'string' &&
    ['urgent', 'high', 'medium', 'later'].includes(String(item.priority)) &&
    typeof item.whatItMeans === 'string' &&
    typeof item.nextStep === 'string'
  ))) return false;

  if (!isObject(value.courtPosture)) return false;
  if (!isStringArray(value.courtPosture.whatWeKnow)) return false;
  if (!isStringArray(value.courtPosture.whatWeNeed)) return false;
  if (!POSSIBLE_FILING_OR_RESPONSE_VALUES.has(String(value.courtPosture.possibleFilingOrResponse))) return false;
  if (!isOptionalString(value.courtPosture.deadlineNote)) return false;
  if (!isOptionalString(value.courtPosture.hearingNote)) return false;

  if (!isObject(value.coParentResponse)) return false;
  if (typeof value.coParentResponse.needed !== 'boolean') return false;
  if (typeof value.coParentResponse.strategy !== 'string') return false;
  if (!isOptionalString(value.coParentResponse.neutralDraft)) return false;
  if (!isOptionalString(value.coParentResponse.firmerDraft)) return false;
  if (!isStringArray(value.coParentResponse.whatNotToSay)) return false;

  if (!isObject(value.evidencePlan)) return false;
  if (!isStringArray(value.evidencePlan.timelineItems)) return false;
  if (!isStringArray(value.evidencePlan.evidenceToSave)) return false;
  if (!isStringArray(value.evidencePlan.neutralFraming)) return false;
  if (!isStringArray(value.evidencePlan.exhibitIdeas)) return false;

  if (!isObject(value.proSeAssessment)) return false;
  if (typeof value.proSeAssessment.possibleProSe !== 'boolean') return false;
  if (typeof value.proSeAssessment.practicalRead !== 'string') return false;
  if (!isStringArray(value.proSeAssessment.tasksLikelyDoableProSe)) return false;
  if (!isStringArray(value.proSeAssessment.tasksHigherRiskWithoutAttorney)) return false;
  if (!isStringArray(value.proSeAssessment.limitedScopeHelpRecommendedFor)) return false;

  if (!isObject(value.costOverview)) return false;
  if (!isStringArray(value.costOverview.proSeCostCategories)) return false;
  if (!isStringArray(value.costOverview.attorneyCostCategories)) return false;
  if (typeof value.costOverview.exactCostsRequireLocalLookup !== 'boolean') return false;
  if (typeof value.costOverview.costExplanation !== 'string') return false;

  if (!isObject(value.resourcePlan)) return false;
  if (typeof value.resourcePlan.stateNeeded !== 'boolean') return false;
  if (typeof value.resourcePlan.countyNeeded !== 'boolean') return false;
  if (!isStringArray(value.resourcePlan.resourceTypesToFind)) return false;
  if (!isStringArray(value.resourcePlan.suggestedSearchTargets)) return false;

  if (!isObject(value.judgeExplanation)) return false;
  if (typeof value.judgeExplanation.simpleTheory !== 'string') return false;
  if (!isStringArray(value.judgeExplanation.judgeReadyStructure)) return false;
  if (!isOptionalString(value.judgeExplanation.sampleOpening)) return false;

  if (!isObject(value.filingPlan)) return false;
  if (!isOptionalString(value.filingPlan.likelyNextDocument)) return false;
  if (!isStringArray(value.filingPlan.filingReadinessChecklist)) return false;
  if (!isStringArray(value.filingPlan.nextInfoNeededBeforeDrafting)) return false;

  return isStringArray(value.nextSteps);
}
