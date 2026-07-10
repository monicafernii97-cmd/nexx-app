import type { LitigationNavigationResponse } from './litigationNavigationSchema';

export type LitigationNavigationVerification = {
  passed: boolean;
  errors: string[];
  checks: {
    acknowledgedUserOverwhelm: boolean;
    identifiedUrgentPriority: boolean;
    addressedCourtPosture: boolean;
    addressedDeadlineOrAskedForServiceDate: boolean;
    addressedCoParentResponseIfAsked: boolean;
    addressedEvidenceDocumentation: boolean;
    addressedProSeQuestionIfAsked: boolean;
    addressedCostQuestionIfAsked: boolean;
    avoidedInventedLocalCostsOrRules: boolean;
    offeredResourceLookupIfCountyNeeded: boolean;
    addressedJudgeExplanationIfAsked: boolean;
    gaveNextSteps: boolean;
    noBackendArtifacts: boolean;
    noInflammatoryLabels: boolean;
    noGenericAttorneyOnlyAnswer: boolean;
  };
};

const BACKEND_PATTERN =
  /\b(OCR|retrieval|verifier|sourceId|chunkId|memoryGenerationId|source packet|confidence label|backend|documentAnswer|legalInterpretation|retrievalBuckets|retrievalReasons|filingRetrievalBuckets)\b/i;

const INFLAMMATORY_LABEL_PATTERN =
  /\b(narcissist|gaslighting|gaslighter|abuser|abusive|psycho|crazy)\b/i;

const INVENTED_COST_PATTERN =
  /\$\s?\d+|\b\d{2,}\s*dollars\b/i;

function collectText(response: LitigationNavigationResponse) {
  return JSON.stringify(response);
}

export function verifyLitigationNavigationResponse(
  response: LitigationNavigationResponse | null | undefined,
  options: {
    userMessage: string;
  }
): LitigationNavigationVerification {
  const errors: string[] = [];
  const message = options.userMessage;
  const text = response ? collectText(response) : '';
  const userAskedCourt = /\b(court|served|filed|motion|petition|hearing|judge|deadline)\b/i.test(message);
  const userAskedCoParent = /\b(what\s+(?:do|should)\s+i\s+(?:say|respond)|how do i respond|text back|message him|message her|appclose|ourfamilywizard)\b/i.test(message);
  const userAskedProSe = /\b(pro se|do this myself|without (?:a|an) attorney|can'?t afford|cannot afford|no money)\b/i.test(message);
  const userAskedCost = /\b(cost|how much|fee|retainer|attorney price|filing fee)\b/i.test(message);
  const userAskedJudge = /\b(judge|explain myself|explain this|show the court|what do i say in court)\b/i.test(message);
  const userOverwhelmed = /\b(overwhelmed|freaking out|scared|afraid|confused|panicking|stressed|don'?t know what to do)\b/i.test(message);
  const countyNeeded = Boolean(response?.resourcePlan.countyNeeded || response?.resourcePlan.stateNeeded);

  const checks: LitigationNavigationVerification['checks'] = {
    acknowledgedUserOverwhelm: !userOverwhelmed || Boolean(response?.supportiveSummary && /\b(hear|understand|lot|heavy|slow|organize|overwhelm|stress|scared|confused)\b/i.test(response.supportiveSummary)),
    identifiedUrgentPriority: Boolean(response?.immediatePriority.priority && response.immediatePriority.whatToDoNow),
    addressedCourtPosture: !userAskedCourt || Boolean(response?.courtPosture.whatWeKnow.length || response?.courtPosture.whatWeNeed.length),
    addressedDeadlineOrAskedForServiceDate: !userAskedCourt || Boolean(response?.courtPosture.deadlineNote || response?.courtPosture.whatWeNeed.some((item) => /\b(?:served|hearing|deadline|filed document)\b/i.test(item))),
    addressedCoParentResponseIfAsked: !userAskedCoParent || Boolean(response?.coParentResponse.neutralDraft),
    addressedEvidenceDocumentation: Boolean(response?.evidencePlan.evidenceToSave.length && response.evidencePlan.neutralFraming.length),
    addressedProSeQuestionIfAsked: !userAskedProSe || Boolean(response?.proSeAssessment.practicalRead && response.proSeAssessment.tasksHigherRiskWithoutAttorney.length),
    addressedCostQuestionIfAsked: !userAskedCost || Boolean(response?.costOverview.costExplanation && response.costOverview.proSeCostCategories.length && response.costOverview.attorneyCostCategories.length),
    avoidedInventedLocalCostsOrRules: !INVENTED_COST_PATTERN.test(text) && !/\bexact deadline is\b/i.test(text),
    offeredResourceLookupIfCountyNeeded: !countyNeeded || Boolean(response?.resourcePlan.resourceTypesToFind.length && /\bcounty|state\b/i.test(response.costOverview.costExplanation + response.nextSteps.join(' '))),
    addressedJudgeExplanationIfAsked: !userAskedJudge || Boolean(response?.judgeExplanation.judgeReadyStructure.length && response.judgeExplanation.simpleTheory),
    gaveNextSteps: Boolean(response?.nextSteps.length),
    noBackendArtifacts: !BACKEND_PATTERN.test(text),
    noInflammatoryLabels: !INFLAMMATORY_LABEL_PATTERN.test(text),
    noGenericAttorneyOnlyAnswer:
      (!/^consult an attorney\.?$/i.test(text.trim()) && !/\bconsult an attorney\b/i.test(text)) ||
      /\b(limited-scope|pro se|next step|document|deadline)\b/i.test(text),
  };

  if (!response) errors.push('Missing litigationNavigation response.');
  if (!checks.acknowledgedUserOverwhelm) errors.push('Did not acknowledge user overwhelm when the user expressed it.');
  if (!checks.identifiedUrgentPriority) errors.push('Did not identify an urgent priority.');
  if (!checks.addressedCourtPosture) errors.push('Court filing/posture was ignored.');
  if (!checks.addressedDeadlineOrAskedForServiceDate) errors.push('Court filing message did not address deadline, service date, or hearing date.');
  if (!checks.addressedCoParentResponseIfAsked) errors.push('User asked what to say, but no co-parent draft was provided.');
  if (!checks.addressedEvidenceDocumentation) errors.push('Did not provide evidence/documentation guidance.');
  if (!checks.addressedProSeQuestionIfAsked) errors.push('User asked about pro se or affordability, but pro se strategy was not addressed.');
  if (!checks.addressedCostQuestionIfAsked) errors.push('User asked about cost, but cost categories were not addressed.');
  if (!checks.avoidedInventedLocalCostsOrRules) errors.push('Response appears to invent exact costs, local rules, or deadlines.');
  if (!checks.offeredResourceLookupIfCountyNeeded) errors.push('County/state resource lookup need was not handled.');
  if (!checks.addressedJudgeExplanationIfAsked) errors.push('User asked judge explanation, but judge-ready structure was not provided.');
  if (!checks.gaveNextSteps) errors.push('No next steps were provided.');
  if (!checks.noBackendArtifacts) errors.push('Response contains backend/internal artifact language.');
  if (!checks.noInflammatoryLabels) errors.push('Response used inflammatory or diagnostic labels.');
  if (!checks.noGenericAttorneyOnlyAnswer) errors.push('Response collapsed into generic attorney-only advice.');

  return {
    passed: errors.length === 0,
    errors,
    checks,
  };
}
