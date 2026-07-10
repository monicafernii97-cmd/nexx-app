import type { RouteMode } from '../../types';
import {
  buildCoParentResponseStrategy,
  type VerifiedOrderInterpretationForDraft,
} from './coParentMessageStrategist';
import { buildCostResourcePlan } from './costResourcePlanner';
import { buildDocumentationPlan } from './documentationPlanner';
import { buildFilingPlan, filingWalkthroughSteps } from './filingWalkthrough';
import { buildJudgeNarrative } from './judgeNarrativeBuilder';
import { buildIssueBreakdown, determineImmediatePriority } from './litigationPriorityEngine';
import type { CandidateResponsePath, LitigationNavigationResponse } from './litigationNavigationSchema';
import { parsePackedCaseIntake, type PackedCaseIntake } from './packedCaseIntake';
import { buildProSeAssessment } from './proSePlanner';
import type { CourtFilingExtraction, SourcedCourtFact } from './courtFilingExtractor';

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
  verifiedOrderInterpretation?: VerifiedOrderInterpretationForDraft | null;
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

function pageLabel(pageStart?: number | null, pageEnd?: number | null) {
  if (!pageStart) return null;
  return pageEnd && pageEnd !== pageStart
    ? `pp. ${pageStart}-${pageEnd}`
    : `p. ${pageStart}`;
}

function citedFactText(fact: SourcedCourtFact) {
  const label = pageLabel(fact.pageStart, fact.pageEnd);
  return label ? `${fact.text} [${label}]` : fact.text;
}

function citedSummary(text: string, facts: SourcedCourtFact[]) {
  const labels = unique(facts.map((fact) => pageLabel(fact.pageStart, fact.pageEnd) ?? ''));
  return labels.length ? `${text} ${labels.map((label) => `[${label}]`).join(' ')}` : text;
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

function candidateResponsePathsForFiling(
  filingType: PackedCaseIntake['courtPosture']['filingType'] | CourtFilingExtraction['documentType']
): CandidateResponsePath[] {
  if (filingType === 'unknown' || filingType === 'notice_of_hearing' || filingType === 'order') return [];

  const candidate = filingType === 'petition'
    ? 'answer or other responsive pleading to verify'
    : filingType === 'protective_order'
      ? 'protective-order response or hearing packet to verify'
      : 'written response, answer, or hearing response to verify';

  return [{
    candidate,
    reason: `The uploaded or described document appears related to ${filingType.replace(/_/g, ' ')}, but the correct response depends on state, county, court rules, service, and the specific relief requested.`,
    jurisdictionVerificationRequired: true,
    localAuthoritySourceIds: [],
    status: 'possible',
  }];
}

function filingFactStrings(courtFiling: CourtFilingExtraction) {
  const filingLabel = courtFiling.documentType.replace(/_/g, ' ');
  const documentTypeFact = courtFiling.sourcedFacts.find((fact) => fact.factType === 'document_type');
  const reliefFacts = courtFiling.reliefRequestedFacts.slice(0, 3);
  const allegationFacts = courtFiling.sourcedFacts.filter((fact) => fact.factType === 'allegation').slice(0, 1);
  const hearingFacts = courtFiling.sourcedFacts.filter((fact) => fact.factType === 'hearing').slice(0, 2);
  const serviceFacts = courtFiling.sourcedFacts.filter((fact) => fact.factType === 'service').slice(0, 1);

  return unique([
    courtFiling.documentType !== 'unknown'
      ? citedSummary(`The uploaded filing appears to be ${articleFor(filingLabel)} ${filingLabel}.`, documentTypeFact ? [documentTypeFact] : [])
      : '',
    reliefFacts.length ? `The filing appears to request: ${reliefFacts.map(citedFactText).join('; ')}.` : '',
    allegationFacts.length ? citedSummary('The filing includes allegations or disputed facts that need a date-order response.', allegationFacts) : '',
    hearingFacts.length ? `A hearing or court-date clue appears in the filing: ${hearingFacts.map(citedFactText).join('; ')}.` : '',
    serviceFacts.length ? citedSummary('The filing includes a service claim, but that is not the same as your confirmed receipt or valid legal service.', serviceFacts) : '',
  ]);
}

function removeUnsourcedFilingFacts(values: string[]) {
  return values.filter((value) =>
    !/\b(?:uploaded filing appears|filing appears to request|filing includes allegations|hearing or court-date clue|possible filing type|motion asks|petition alleges|filing requests|certificate states)\b/i.test(value)
  );
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
    ...(courtFiling ? filingFactStrings(courtFiling) : []),
    intake.courtPosture.proceedingStatus === 'threat_only'
      ? 'His threat does not create a court deadline by itself. The first step is to verify whether anything was actually filed or served.'
      : '',
    intake.courtPosture.otherPartyFiledSomething ? 'A court filing appears to be involved, but the actual filing, service, and hearing details still need to be checked.' : '',
    intake.courtPosture.filingType !== 'unknown' ? `Possible filing type: ${intake.courtPosture.filingType.replace(/_/g, ' ')}.` : '',
    intake.courtPosture.userWasServed === true ? 'You mentioned being served.' : '',
    intake.courtPosture.hearingDate ? `Hearing mentioned: ${intake.courtPosture.hearingDate}.` : '',
    intake.courtPosture.responseDeadline ? `Response deadline mentioned: ${intake.courtPosture.responseDeadline}.` : '',
  ]);
  const whatWeNeed = unique([
    intake.courtPosture.proceedingStatus === 'threat_only' ? 'whether anything was actually filed or served' : '',
    intake.courtPosture.otherPartyFiledSomething && !courtFiling ? 'the filed document' : '',
    (intake.courtPosture.otherPartyFiledSomething || courtFiling) && intake.courtPosture.userWasServed !== true ? 'when you actually received the filing and how you received it' : '',
    (intake.courtPosture.otherPartyFiledSomething || courtFiling) && !intake.courtPosture.hearingDate && !courtFiling?.deadlinesOrHearings.some((item) => item.type === 'hearing') ? 'any hearing date or notice of hearing' : '',
    courtFiling?.missingInfoNeeded.length ? courtFiling.missingInfoNeeded.join('; ') : '',
    intake.currentOrderContext.needsOrderReview ? 'the current order provision that controls this issue' : '',
    needsLocalContext && !intake.courtPosture.state ? 'state' : '',
    needsLocalContext && !intake.courtPosture.county ? 'county' : '',
  ]);

  const candidateResponsePaths = candidateResponsePathsForFiling(courtFiling?.documentType ?? intake.courtPosture.filingType);

  return {
    whatWeKnow,
    whatWeNeed,
    candidateResponsePaths,
    possibleFilingOrResponse: 'unknown',
    deadlineNote: intake.courtPosture.proceedingStatus === 'threat_only'
      ? null
      : intake.courtPosture.otherPartyFiledSomething || courtFiling
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
    intake.courtPosture.proceedingStatus === 'threat_only' ? 'Verify whether anything was actually filed or served before treating the threat as a court deadline.' : '',
    intake.courtPosture.otherPartyFiledSomething && !courtFiling ? 'Upload or paste the court paper that was filed.' : '',
    intake.courtPosture.otherPartyFiledSomething || courtFiling ? 'Tell me when you actually received the filing, how you received it, and whether there is a hearing date.' : '',
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
  if (routeMode === 'court_ready_drafting') return 'court_ready_drafting';
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
    intake.courtPosture.proceedingStatus = 'filing_uploaded';
    if (args.courtFiling.documentType !== 'unknown') {
      intake.courtPosture.filingType = args.courtFiling.documentType === 'notice_of_hearing' || args.courtFiling.documentType === 'order'
        ? 'unknown'
        : args.courtFiling.documentType;
    }
    if (args.courtFiling.reliefRequested.length) {
      intake.courtPosture.reliefRequested = args.courtFiling.reliefRequested;
    }
    const responseDeadline = args.courtFiling.deadlinesOrHearings.find((item) => item.type === 'response_deadline');
    if (responseDeadline && !intake.courtPosture.responseDeadline) {
      intake.courtPosture.responseDeadline = responseDeadline.dateOrTime;
      intake.immediateRisks.deadlineRisk = true;
    }
    const hearing = args.courtFiling.deadlinesOrHearings.find((item) => item.type === 'hearing');
    if (hearing && !intake.courtPosture.hearingDate) {
      intake.courtPosture.hearingDate = hearing.dateOrTime;
      intake.immediateRisks.hearingRisk = true;
    }
  }

  const coParentResponse = buildCoParentResponseStrategy(
    intake,
    args.recentContext,
    args.verifiedOrderInterpretation
  );
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

  const whatWeKnow = unique([
    ...removeUnsourcedFilingFacts(response.courtPosture.whatWeKnow),
    ...filingFactStrings(courtFiling),
  ]);
  const whatWeNeed = unique([
    ...response.courtPosture.whatWeNeed,
    ...courtFiling.missingInfoNeeded,
    'when you actually received the filing and how you received it',
  ]);
  const candidateResponsePaths = candidateResponsePathsForFiling(courtFiling.documentType);

  return {
    ...response,
    courtPosture: {
      ...response.courtPosture,
      whatWeKnow,
      whatWeNeed,
      candidateResponsePaths: candidateResponsePaths.length
        ? candidateResponsePaths
        : response.courtPosture.candidateResponsePaths ?? [],
      possibleFilingOrResponse: 'unknown',
      deadlineNote: response.courtPosture.deadlineNote ??
        'The service date, response deadline, and hearing date need to be verified before deciding what to file.',
      hearingNote: response.courtPosture.hearingNote ??
        (courtFiling.deadlinesOrHearings.some((item) => item.type === 'hearing')
          ? 'A hearing clue appears in the filing. Verify the exact hearing date and time before filing.'
          : 'Check whether there is a notice of hearing or scheduled court date.'),
    },
    filingPlan: {
      ...response.filingPlan,
      likelyNextDocument: candidateResponsePaths[0]?.candidate ??
        response.filingPlan.likelyNextDocument ??
        null,
      nextInfoNeededBeforeDrafting: unique([
        ...response.filingPlan.nextInfoNeededBeforeDrafting,
        ...courtFiling.missingInfoNeeded,
      ]),
    },
    nextSteps: unique([
      'Verify when you actually received the filing, how you received it, and any hearing date shown or served with the filing.',
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
      (response.courtPosture.candidateResponsePaths ?? []).length > 0
        ? `Response path to verify:\n${list((response.courtPosture.candidateResponsePaths ?? []).map((path) =>
          `${path.candidate}: ${path.reason} The likely responsive filing needs to be confirmed under your court's rules.`
        ))}`
        : undefined,
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
      response.filingPlan.likelyNextDocument
        ? `Candidate response path to verify: ${response.filingPlan.likelyNextDocument}. The likely responsive filing needs to be confirmed under your court's rules before filing.`
        : 'The likely next filing depends on the document that was filed and served, and it needs local-rule verification before filing.',
      `Before filing, confirm:\n${list(response.filingPlan.filingReadinessChecklist.slice(0, 10))}`,
      `General filing flow:\n${list(filingWalkthroughSteps().slice(0, 8))}`,
    ].join('\n\n'));
  }

  sections.push(`Next steps:\n${numbered(response.nextSteps)}`);

  return sections.filter(Boolean).join('\n\n');
}
