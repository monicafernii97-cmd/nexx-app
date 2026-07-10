import type { RouteMode } from '../../types';
import { buildCoParentResponseStrategy } from './coParentMessageStrategist';
import { buildCostResourcePlan } from './costResourcePlanner';
import { buildDocumentationPlan } from './documentationPlanner';
import { buildFilingPlan, filingWalkthroughSteps } from './filingWalkthrough';
import { buildJudgeNarrative } from './judgeNarrativeBuilder';
import { buildIssueBreakdown, determineImmediatePriority } from './litigationPriorityEngine';
import type { LitigationNavigationResponse } from './litigationNavigationSchema';
import { parsePackedCaseIntake, type PackedCaseIntake } from './packedCaseIntake';
import { buildProSeAssessment } from './proSePlanner';
import type { CourtFilingExtraction } from './courtFilingExtractor';

export type StrategicSupportRenderMode =
  | 'calm_grounding'
  | 'quick_reality_check'
  | 'supportive_review'
  | 'response_drafting'
  | 'documentation_plan'
  | 'court_ready_framing'
  | 'next_steps_walkthrough';

export type LitigationRenderMode =
  | 'calm_grounding'
  | 'packed_case_overview'
  | 'deadline_first'
  | 'co_parent_response_focused'
  | 'pro_se_planning'
  | 'cost_resource_guidance'
  | 'judge_narrative'
  | 'filing_walkthrough'
  | 'court_ready_drafting';

type BuildLitigationNavigationArgs = {
  message: string;
  routeMode: RouteMode;
  recentContext?: string;
  state?: string;
  county?: string;
  courtName?: string;
  courtFiling?: CourtFilingExtraction | null;
};

function list(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- Not yet identified.';
}

function numbered(items: string[]) {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function articleFor(label: string) {
  return /^[aeiou]/i.test(label) ? 'an' : 'a';
}

function supportiveSummary(intake: PackedCaseIntake) {
  if (intake.courtPosture.otherPartyFiledSomething && (intake.emotionalState.overwhelmed || intake.emotionalState.scared)) {
    return 'I hear you. This is a lot at once: the court issue, the accusations or messages, and the fear of handling it without enough help. We can slow it down and organize it.';
  }
  if (intake.emotionalState.reactive || intake.emotionalState.feelsManipulatedOrPressured) {
    return 'I can see why this is pushing your buttons. The goal is not to match the pressure; it is to stay calm, stay tied to the order, and protect your record.';
  }
  if (intake.emotionalState.overwhelmed || intake.emotionalState.confused || intake.emotionalState.scared) {
    return 'I understand why this feels heavy. Let us separate the pressure from the legal issue and turn it into a clear next step.';
  }
  return 'Here is how I would organize this in a court-aware way.';
}

function filingTypeToPossibleResponse(
  filingType: PackedCaseIntake['courtPosture']['filingType'] | CourtFilingExtraction['documentType']
): LitigationNavigationResponse['courtPosture']['possibleFilingOrResponse'] {
  if (filingType === 'petition') return 'answer';
  if (filingType === 'motion' || filingType === 'enforcement' || filingType === 'modification' || filingType === 'protective_order') {
    return 'response_to_motion';
  }
  if (filingType === 'temporary_orders') return 'temporary_orders_response';
  return 'unknown';
}

function courtPosture(
  intake: PackedCaseIntake,
  courtFiling?: CourtFilingExtraction | null
): LitigationNavigationResponse['courtPosture'] {
  const needsLocalContext = intake.courtPosture.otherPartyFiledSomething ||
    intake.immediateRisks.deadlineRisk ||
    intake.userQuestions.some((q) => [
      'what_to_file',
      'can_i_do_this_myself',
      'cost',
      'attorney_resources',
      'legal_aid',
    ].includes(q.category));
  const whatWeKnow = unique([
    courtFiling && courtFiling.documentType !== 'unknown' ? `The uploaded filing appears to be ${articleFor(courtFiling.documentType)} ${courtFiling.documentType.replace(/_/g, ' ')}.` : '',
    courtFiling?.reliefRequested.length ? `The filing appears to request: ${courtFiling.reliefRequested.slice(0, 3).join('; ')}.` : '',
    courtFiling?.allegations.length ? `The filing includes allegations or disputed facts that need a date-order response.` : '',
    courtFiling?.deadlinesOrHearings.some((item) => item.type === 'hearing') ? 'A hearing or court-date clue appears in the filing.' : '',
    intake.courtPosture.otherPartyFiledSomething ? 'A court filing or court threat is involved.' : '',
    intake.courtPosture.filingType !== 'unknown' ? `Possible filing type: ${intake.courtPosture.filingType.replace(/_/g, ' ')}.` : '',
    intake.courtPosture.userWasServed === true ? 'You mentioned being served.' : '',
    intake.courtPosture.hearingDate ? `Hearing mentioned: ${intake.courtPosture.hearingDate}.` : '',
    intake.courtPosture.responseDeadline ? `Response deadline mentioned: ${intake.courtPosture.responseDeadline}.` : '',
  ]);
  const whatWeNeed = unique([
    intake.courtPosture.otherPartyFiledSomething ? 'the filed document' : '',
    (intake.courtPosture.otherPartyFiledSomething || courtFiling) && intake.courtPosture.userWasServed !== true && !courtFiling?.serviceClues.length ? 'whether and when you were served' : '',
    (intake.courtPosture.otherPartyFiledSomething || courtFiling) && !intake.courtPosture.hearingDate && !courtFiling?.deadlinesOrHearings.some((item) => item.type === 'hearing') ? 'any hearing date or notice of hearing' : '',
    courtFiling?.missingInfoNeeded.length ? courtFiling.missingInfoNeeded.join('; ') : '',
    intake.currentOrderContext.needsOrderReview ? 'the current order provision that controls this issue' : '',
    needsLocalContext && !intake.courtPosture.state ? 'state' : '',
    needsLocalContext && !intake.courtPosture.county ? 'county' : '',
  ]);

  const possibleFilingOrResponse =
    filingTypeToPossibleResponse(courtFiling?.documentType ?? intake.courtPosture.filingType);

  return {
    whatWeKnow,
    whatWeNeed,
    possibleFilingOrResponse,
    deadlineNote: intake.courtPosture.otherPartyFiledSomething || courtFiling
      ? 'The service date, response deadline, and hearing date need to be verified before deciding what to file.'
      : null,
    hearingNote: intake.courtPosture.hearingDate
      ? `You mentioned a hearing date: ${intake.courtPosture.hearingDate}.`
      : intake.courtPosture.otherPartyFiledSomething || courtFiling
        ? 'Check whether there is a notice of hearing or scheduled court date.'
        : null,
  };
}

function nextSteps(intake: PackedCaseIntake, courtFiling?: CourtFilingExtraction | null) {
  return unique([
    intake.courtPosture.otherPartyFiledSomething && !courtFiling ? 'Upload or paste the court paper that was filed.' : '',
    intake.courtPosture.otherPartyFiledSomething || courtFiling ? 'Tell me the date you were served and whether there is a hearing date.' : '',
    courtFiling ? 'Use the filing to build a response that addresses each requested order and main allegation in date order.' : '',
    intake.currentOrderContext.needsOrderReview ? 'Upload or point me to the current order provision that controls this issue.' : '',
    intake.coParentCommunication.userNeedsResponseDraft || intake.coParentCommunication.messagesMentioned ? 'Send only one short, neutral, order-based co-parent response if a response is needed.' : '',
    'Save the message thread, relevant order pages, and any proof of attempted compliance.',
    intake.emotionalState.financiallyStressed ? 'Tell me your county and state so I can help identify official fee, legal-aid, and limited-scope resources.' : '',
    intake.userQuestions.some((q) => q.category === 'judge_explanation') ? 'Turn the story into a date-order judge-ready timeline.' : '',
  ]);
}

function inferRenderMode(response: LitigationNavigationResponse, routeMode: RouteMode, message: string): LitigationRenderMode {
  if (routeMode === 'packed_case_intake') return 'packed_case_overview';
  if (routeMode === 'pro_se_guidance' || /\bpro se|do this myself|without (?:a|an) attorney\b/i.test(message)) return 'pro_se_planning';
  if (routeMode === 'attorney_resource_guidance' || /\bcost|fee|legal aid|attorney|lawyer\b/i.test(message)) return 'cost_resource_guidance';
  if (routeMode === 'court_narrative_builder' || /\bjudge|explain myself|explain this\b/i.test(message)) return 'judge_narrative';
  if (routeMode === 'co_parent_response' || /\bwhat\s+(?:do|should)\s+i\s+(?:say|respond)|how do i respond|tell him off|tell her off\b/i.test(message)) return 'co_parent_response_focused';
  if (response.courtPosture.deadlineNote || routeMode === 'litigation_navigation' || routeMode === 'court_response_planning') return 'deadline_first';
  if (routeMode === 'filing_walkthrough' || /\bwhat do i file|how do i file\b/i.test(message)) return 'filing_walkthrough';
  return 'calm_grounding';
}

export function buildLitigationNavigationResponse(args: BuildLitigationNavigationArgs): LitigationNavigationResponse {
  const intake = parsePackedCaseIntake(args.message, args.recentContext ?? '');
  if (args.state && !intake.courtPosture.state) intake.courtPosture.state = args.state;
  if (args.county && !intake.courtPosture.county) intake.courtPosture.county = args.county;
  if (args.courtName && !intake.courtPosture.courtName) intake.courtPosture.courtName = args.courtName;
  if (args.courtFiling) {
    intake.courtPosture.otherPartyFiledSomething = true;
    if (args.courtFiling.documentType !== 'unknown') {
      intake.courtPosture.filingType = args.courtFiling.documentType === 'notice_of_hearing' || args.courtFiling.documentType === 'order'
        ? 'unknown'
        : args.courtFiling.documentType;
    }
    if (args.courtFiling.reliefRequested.length) {
      intake.courtPosture.reliefRequested = args.courtFiling.reliefRequested;
    }
  }

  const coParentResponse = buildCoParentResponseStrategy(intake, args.recentContext);
  const evidencePlan = buildDocumentationPlan(intake);
  const proSeAssessment = buildProSeAssessment(intake);
  const { costOverview, resourcePlan } = buildCostResourcePlan(intake);
  const judgeExplanation = buildJudgeNarrative(intake);
  const filingPlan = buildFilingPlan(intake);

  return {
    answerType: 'litigation_navigation',
    supportiveSummary: supportiveSummary(intake),
    immediatePriority: determineImmediatePriority(intake),
    issueBreakdown: buildIssueBreakdown(intake),
    courtPosture: courtPosture(intake, args.courtFiling),
    coParentResponse,
    evidencePlan,
    proSeAssessment,
    costOverview,
    resourcePlan,
    judgeExplanation,
    filingPlan,
    nextSteps: nextSteps(intake, args.courtFiling),
  };
}

export function mergeCourtFilingIntoLitigationNavigation(
  response: LitigationNavigationResponse,
  courtFiling?: CourtFilingExtraction | null
): LitigationNavigationResponse {
  if (!courtFiling) return response;

  const filingLabel = courtFiling.documentType.replace(/_/g, ' ');
  const whatWeKnow = unique([
    ...response.courtPosture.whatWeKnow,
    courtFiling.documentType !== 'unknown' ? `The uploaded filing appears to be ${articleFor(filingLabel)} ${filingLabel}.` : '',
    courtFiling.reliefRequested.length ? `The filing appears to request: ${courtFiling.reliefRequested.slice(0, 3).join('; ')}.` : '',
    courtFiling.allegations.length ? 'The filing includes allegations or disputed facts that should be answered in date order.' : '',
    courtFiling.deadlinesOrHearings.some((item) => item.type === 'hearing') ? 'A hearing or court-date clue appears in the filing.' : '',
  ]);
  const whatWeNeed = unique([
    ...response.courtPosture.whatWeNeed,
    ...courtFiling.missingInfoNeeded,
  ]);

  return {
    ...response,
    courtPosture: {
      ...response.courtPosture,
      whatWeKnow,
      whatWeNeed,
      possibleFilingOrResponse: response.courtPosture.possibleFilingOrResponse === 'unknown'
        ? filingTypeToPossibleResponse(courtFiling.documentType)
        : response.courtPosture.possibleFilingOrResponse,
      deadlineNote: response.courtPosture.deadlineNote ??
        'The service date, response deadline, and hearing date need to be verified before deciding what to file.',
      hearingNote: response.courtPosture.hearingNote ??
        (courtFiling.deadlinesOrHearings.some((item) => item.type === 'hearing')
          ? 'A hearing clue appears in the filing. Verify the exact hearing date and time before filing.'
          : 'Check whether there is a notice of hearing or scheduled court date.'),
    },
    filingPlan: {
      ...response.filingPlan,
      likelyNextDocument: response.filingPlan.likelyNextDocument ??
        (filingTypeToPossibleResponse(courtFiling.documentType) === 'unknown'
          ? null
          : filingTypeToPossibleResponse(courtFiling.documentType).replace(/_/g, ' ')),
      nextInfoNeededBeforeDrafting: unique([
        ...response.filingPlan.nextInfoNeededBeforeDrafting,
        ...courtFiling.missingInfoNeeded,
      ]),
    },
    nextSteps: unique([
      'Verify the service date and any hearing date shown or served with the filing.',
      'Build a response that addresses each requested order and main allegation in date order.',
      ...response.nextSteps,
    ]),
  };
}

export function renderLitigationNavigationMarkdown(
  response: LitigationNavigationResponse,
  options: {
    routeMode: RouteMode;
    userMessage: string;
  }
) {
  const mode = inferRenderMode(response, options.routeMode, options.userMessage);
  const asksProSe = /\b(pro se|do this myself|without (?:a|an) attorney|can'?t afford|cannot afford|no money)\b/i.test(options.userMessage);
  const asksCostOrResources = /\b(cost|how much|fee|retainer|legal aid|lawyer|attorney|resources|limited[-\s]?scope)\b/i.test(options.userMessage);
  const packedOrCourtMode = mode === 'packed_case_overview' || mode === 'deadline_first' || mode === 'filing_walkthrough' || mode === 'court_ready_drafting';

  if (mode === 'co_parent_response_focused') {
    const sections = [
      options.routeMode === 'supportive_strategy' ? response.supportiveSummary : undefined,
      response.coParentResponse.neutralDraft
        ? `You can say:\n\n"${response.coParentResponse.neutralDraft}"`
        : response.coParentResponse.strategy,
      response.coParentResponse.firmerDraft ? `Firmer version:\n\n"${response.coParentResponse.firmerDraft}"` : undefined,
      `Why this works: ${response.coParentResponse.strategy}`,
      `What not to say:\n${list(response.coParentResponse.whatNotToSay)}`,
      response.evidencePlan.evidenceToSave.length > 0
        ? `Save this for your record:\n${list(response.evidencePlan.evidenceToSave.slice(0, 4))}`
        : undefined,
      `Next steps:\n${numbered(response.nextSteps.slice(0, 3))}`,
    ];
    return sections.filter(Boolean).join('\n\n');
  }

  if (mode === 'cost_resource_guidance') {
    return [
      response.costOverview.costExplanation,
      `Pro se cost categories:\n${list(response.costOverview.proSeCostCategories)}`,
      `Attorney cost categories:\n${list(response.costOverview.attorneyCostCategories)}`,
      response.resourcePlan.stateNeeded || response.resourcePlan.countyNeeded
        ? 'For exact local fees and official resources, I need your county and state.'
        : `Good official resource targets:\n${list(response.resourcePlan.suggestedSearchTargets)}`,
      `Next steps:\n${numbered(response.nextSteps.slice(0, 3))}`,
    ].join('\n\n');
  }

  if (mode === 'pro_se_planning' && !packedOrCourtMode) {
    return [
      response.proSeAssessment.practicalRead,
      `Often manageable pro se:\n${list(response.proSeAssessment.tasksLikelyDoableProSe)}`,
      `Higher-risk without attorney help:\n${list(response.proSeAssessment.tasksHigherRiskWithoutAttorney)}`,
      `Limited-scope help is most useful for:\n${list(response.proSeAssessment.limitedScopeHelpRecommendedFor)}`,
      response.resourcePlan.stateNeeded || response.resourcePlan.countyNeeded
        ? 'Tell me your county and state so I can help identify official fee, legal-aid, and limited-scope resources.'
        : undefined,
      `Next steps:\n${numbered(response.nextSteps.slice(0, 4))}`,
    ].filter(Boolean).join('\n\n');
  }

  if (mode === 'judge_narrative' && !packedOrCourtMode) {
    return [
      response.judgeExplanation.simpleTheory,
      `Use this structure:\n${list(response.judgeExplanation.judgeReadyStructure)}`,
      response.judgeExplanation.sampleOpening ? `Sample opening:\n\n"${response.judgeExplanation.sampleOpening}"` : undefined,
      `Next steps:\n${numbered(response.nextSteps.slice(0, 3))}`,
    ].filter(Boolean).join('\n\n');
  }

  const sections: string[] = [
    response.supportiveSummary,
    `The first priority is this: ${response.immediatePriority.priority}\n\n${response.immediatePriority.whyItMatters} ${response.immediatePriority.whatToDoNow}`,
  ];

  if (mode === 'packed_case_overview' || mode === 'deadline_first' || response.issueBreakdown.length > 1) {
    sections.push(`Right now I see these tracks:\n\n${numbered(response.issueBreakdown.map((issue) => `${issue.issue}: ${issue.whatItMeans} Next step: ${issue.nextStep}`))}`);
  }

  if (response.courtPosture.whatWeKnow.length > 0 || response.courtPosture.whatWeNeed.length > 0) {
    sections.push([
      '**Court posture**',
      response.courtPosture.whatWeKnow.length > 0 ? `What we know:\n${list(response.courtPosture.whatWeKnow)}` : undefined,
      response.courtPosture.whatWeNeed.length > 0 ? `What we still need:\n${list(response.courtPosture.whatWeNeed)}` : undefined,
      response.courtPosture.deadlineNote,
    ].filter(Boolean).join('\n\n'));
  }

  if (response.coParentResponse.needed) {
    sections.push([
      '**Co-parent response**',
      response.coParentResponse.strategy,
      response.coParentResponse.neutralDraft ? `Neutral draft:\n\n"${response.coParentResponse.neutralDraft}"` : undefined,
      response.coParentResponse.firmerDraft ? `Firmer version:\n\n"${response.coParentResponse.firmerDraft}"` : undefined,
      `What not to do:\n${list(response.coParentResponse.whatNotToSay)}`,
    ].filter(Boolean).join('\n\n'));
  }

  if (options.routeMode === 'documentation_strategy' || mode === 'packed_case_overview' || response.evidencePlan.evidenceToSave.length > 0) {
    sections.push([
      '**Document this neutrally**',
      `Save:\n${list(response.evidencePlan.evidenceToSave)}`,
      response.evidencePlan.timelineItems.length > 0 ? `Timeline:\n${list(response.evidencePlan.timelineItems)}` : undefined,
      `Use neutral wording:\n${list(response.evidencePlan.neutralFraming)}`,
    ].filter(Boolean).join('\n\n'));
  }

  if (asksProSe || response.issueBreakdown.some((issue) => /pro se|limited-scope/i.test(issue.issue))) {
    sections.push([
      '**Pro se / attorney strategy**',
      response.proSeAssessment.practicalRead,
      `Often manageable pro se:\n${list(response.proSeAssessment.tasksLikelyDoableProSe)}`,
      `Higher-risk without attorney help:\n${list(response.proSeAssessment.tasksHigherRiskWithoutAttorney)}`,
      `Limited-scope help is most useful for:\n${list(response.proSeAssessment.limitedScopeHelpRecommendedFor)}`,
    ].join('\n\n'));
  }

  if (
    asksCostOrResources ||
    (packedOrCourtMode && response.issueBreakdown.some((issue) => /cost|resources/i.test(issue.issue)))
  ) {
    sections.push([
      '**Cost and resources**',
      response.costOverview.costExplanation,
      `Pro se cost categories:\n${list(response.costOverview.proSeCostCategories)}`,
      `Attorney cost categories:\n${list(response.costOverview.attorneyCostCategories)}`,
      response.resourcePlan.stateNeeded || response.resourcePlan.countyNeeded
        ? 'For exact local fees and resources, I need your county and state.'
        : `Good resource targets:\n${list(response.resourcePlan.suggestedSearchTargets)}`,
    ].join('\n\n'));
  }

  if (response.judgeExplanation.sampleOpening) {
    sections.push([
      '**Judge-ready explanation**',
      response.judgeExplanation.simpleTheory,
      `Use this structure:\n${list(response.judgeExplanation.judgeReadyStructure)}`,
      response.judgeExplanation.sampleOpening ? `Sample opening:\n\n"${response.judgeExplanation.sampleOpening}"` : undefined,
    ].filter(Boolean).join('\n\n'));
  }

  if (mode === 'filing_walkthrough' || response.filingPlan.likelyNextDocument) {
    sections.push([
      '**Filing plan**',
      response.filingPlan.likelyNextDocument ? `Likely next document to evaluate: ${response.filingPlan.likelyNextDocument}.` : 'The likely next filing depends on the document that was filed and served.',
      `Before filing, confirm:\n${list(response.filingPlan.filingReadinessChecklist.slice(0, 10))}`,
      `General filing flow:\n${list(filingWalkthroughSteps().slice(0, 8))}`,
    ].join('\n\n'));
  }

  sections.push(`Next steps:\n${numbered(response.nextSteps)}`);

  return sections.filter(Boolean).join('\n\n');
}
