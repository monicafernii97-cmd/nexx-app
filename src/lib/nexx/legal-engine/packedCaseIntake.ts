import type { LegalIntent, MultiIntentResult } from '../../types';
import {
  detectFamilyLawIssuePackIds,
  getFamilyLawIssuePacksByIds,
  type FamilyLawIssuePackId,
} from './issuePacks/familyLawIssuePacks';
import { unique } from './stringUtils';

export type CourtProceedingStatus =
  | 'threat_only'
  | 'filing_claimed_not_seen'
  | 'filing_uploaded'
  | 'served_user_confirmed'
  | 'hearing_confirmed'
  | 'unknown';

export type PackedCaseIntake = {
  issuePackIds: FamilyLawIssuePackId[];
  emotionalState: {
    overwhelmed: boolean;
    scared: boolean;
    confused: boolean;
    angry: boolean;
    reactive: boolean;
    financiallyStressed: boolean;
    feelsManipulatedOrPressured: boolean;
  };
  courtPosture: {
    proceedingStatus: CourtProceedingStatus;
    otherPartyFiledSomething: boolean;
    userWasServed: boolean | null;
    servedDate: string | null;
    hearingDate: string | null;
    responseDeadline: string | null;
    filingType:
      | 'motion'
      | 'petition'
      | 'enforcement'
      | 'modification'
      | 'temporary_orders'
      | 'protective_order'
      | 'contempt'
      | 'unknown';
    reliefRequested: string[];
    state: string | null;
    county: string | null;
    courtName: string | null;
    causeNumberKnown: boolean;
  };
  currentOrderContext: {
    hasExistingOrder: boolean | null;
    orderUploaded: boolean;
    relevantOrderIssues: string[];
    needsOrderReview: boolean;
  };
  coParentCommunication: {
    messagesMentioned: boolean;
    numberOfMessagesMentioned: number | null;
    userNeedsResponseDraft: boolean;
    toneRisk: 'low' | 'medium' | 'high';
    pressureOrAccusationThemes: string[];
    logisticsIssue: string | null;
  };
  factualTimeline: Array<{
    dateOrRelativeTime: string;
    event: string;
    evidenceMentioned: string[];
    legalRelevance:
      | 'possession'
      | 'support'
      | 'communication'
      | 'school'
      | 'medical'
      | 'safety'
      | 'exchange'
      | 'court'
      | 'other';
  }>;
  accusationsOrDisputes: string[];
  userQuestions: Array<{
    question: string;
    category:
      | 'what_to_file'
      | 'what_to_respond'
      | 'can_i_do_this_myself'
      | 'cost'
      | 'attorney_resources'
      | 'legal_aid'
      | 'judge_explanation'
      | 'next_steps'
      | 'court_response_planning'
      | 'order_interpretation';
  }>;
  immediateRisks: {
    safetyRisk: boolean;
    childSafetyRisk: boolean;
    deadlineRisk: boolean;
    hearingRisk: boolean;
    exchangeRisk: boolean;
    enforcementRisk: boolean;
    contemptRisk: boolean;
    missingDocumentRisk: boolean;
    financialAccessRisk: boolean;
  };
  missingCriticalInfo: string[];
};

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const US_STATE_NAMES = new Set([
  'Alabama',
  'Alaska',
  'Arizona',
  'Arkansas',
  'California',
  'Colorado',
  'Connecticut',
  'Delaware',
  'Florida',
  'Georgia',
  'Hawaii',
  'Idaho',
  'Illinois',
  'Indiana',
  'Iowa',
  'Kansas',
  'Kentucky',
  'Louisiana',
  'Maine',
  'Maryland',
  'Massachusetts',
  'Michigan',
  'Minnesota',
  'Mississippi',
  'Missouri',
  'Montana',
  'Nebraska',
  'Nevada',
  'New Hampshire',
  'New Jersey',
  'New Mexico',
  'New York',
  'North Carolina',
  'North Dakota',
  'Ohio',
  'Oklahoma',
  'Oregon',
  'Pennsylvania',
  'Rhode Island',
  'South Carolina',
  'South Dakota',
  'Tennessee',
  'Texas',
  'Utah',
  'Vermont',
  'Virginia',
  'Washington',
  'West Virginia',
  'Wisconsin',
  'Wyoming',
  'District of Columbia',
]);

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function captureFirst(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim() ?? null;
}

function uniqueIntents(values: LegalIntent[]) {
  return Array.from(new Set(values));
}

function validStateName(value: string | null) {
  if (!value) return null;
  const normalized = value.trim();
  return US_STATE_NAMES.has(normalized) ? normalized : null;
}

function inferFilingType(text: string): PackedCaseIntake['courtPosture']['filingType'] {
  if (/\bprotective\s+order|restraining\s+order\b/i.test(text)) return 'protective_order';
  if (/\btemporary\s+orders?\b/i.test(text)) return 'temporary_orders';
  if (/\b(enforcement|enforce)\b/i.test(text)) return 'enforcement';
  if (/\b(contempt|violation|violating)\b/i.test(text)) return 'contempt';
  if (/\b(modification|modify|change custody|change support)\b/i.test(text)) return 'modification';
  if (/\bpetition\b/i.test(text)) return 'petition';
  if (/\bmotion\b/i.test(text)) return 'motion';
  return 'unknown';
}

function inferCourtProceedingStatus(args: {
  lower: string;
  filingNegated: boolean;
  userWasServed: boolean | null;
}): CourtProceedingStatus {
  if (args.filingNegated) return 'unknown';
  if (has(args.lower, /\b(uploaded|attached|pasted|shared)\b/i) && has(args.lower, /\b(filing|filed|motion|petition|enforcement|modification|protective order)\b/i)) {
    return 'filing_uploaded';
  }
  if (args.userWasServed === true) return 'served_user_confirmed';
  if (has(args.lower, /\b(hearing|court date|trial)\b/i)) return 'hearing_confirmed';
  if (has(args.lower, /\bfiled something|filed (?:a|the) (?:motion|petition|enforcement|modification)|(?:motion|petition) (?:against me|was filed)|lied in the motion\b/i)) {
    return 'filing_claimed_not_seen';
  }
  if (has(args.lower, /\b(taking me to court|take me (?:back )?to court|threaten(?:ed|ing)? to file|says? (?:he|she|they) (?:is|are|will|would) (?:taking|take) me to court)\b/i)) {
    return 'threat_only';
  }
  return 'unknown';
}

function inferMessageCount(text: string) {
  const numeric = text.match(/\b(\d+)\s+(?:texts?|messages?|emails?)\b/i)?.[1];
  if (numeric) return Number(numeric);
  const word = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:texts?|messages?|emails?)\b/i)?.[1]?.toLowerCase();
  return word ? NUMBER_WORDS[word] ?? null : null;
}

function inferLogisticsIssue(text: string) {
  if (/\b(father'?s day|mother'?s day|holiday)\b/i.test(text)) return 'holiday possession';
  if (/\b(pickup|pick up|drop[-\s]?off|exchange)\b/i.test(text)) return 'exchange logistics';
  if (/\b(child support|support|arrears)\b/i.test(text)) return 'support';
  if (/\b(school|medical|doctor|therapy|decision)\b/i.test(text)) return 'decision-making';
  if (/\b(message|text|appclose|ourfamilywizard)\b/i.test(text)) return 'co-parent communication';
  return null;
}

function hasPhysicalSafetySignal(lower: string) {
  return has(lower, /\bdanger|unsafe|violence|911\b/i) ||
    has(lower, /\b(threaten(?:ed|ing)?|said|says?)\b.{0,60}\b(kill|hurt|harm|hit|shoot|stab|come after|take the child|kidnap)\b/i) ||
    has(lower, /\b(stalking|strangulation|strangled|choked|weapon|gun|knife|kidnapp?ing|refus(?:e|ing|ed) to return (?:the )?child|suicidal|suicide|child left unsafe|physical assault|sexual abuse|immediate flight risk|emergency protective order)\b/i);
}

function hasChildSafetySignal(lower: string) {
  return has(lower, /\bchild.{0,60}unsafe|kids?.{0,60}danger|harm.{0,60}child|refus(?:e|ing|ed) to return (?:the )?child|kidnapp?ing|sexual abuse|child left unsafe\b/i);
}

function relevantOrderIssues(text: string) {
  const issues: string[] = [];
  if (/\b(possession|access|visitation|holiday|father'?s day|mother'?s day|weekend)\b/i.test(text)) issues.push('possession/access');
  if (/\b(pickup|pick up|drop[-\s]?off|exchange)\b/i.test(text)) issues.push('exchange logistics');
  if (/\b(child support|support|arrears)\b/i.test(text)) issues.push('support');
  if (/\b(school|medical|doctor|therapy|decision[-\s]?making)\b/i.test(text)) issues.push('decision-making');
  if (/\b(enforce|contempt|violat(?:e|ing|ion))\b/i.test(text)) issues.push('enforcement/compliance');
  return unique(issues);
}

function pressureThemes(text: string) {
  const themes: string[] = [];
  if (/\b(pressur(?:e|ing)|pushing|won'?t stop|keeps saying)\b/i.test(text)) themes.push('pressure');
  if (/\b(threaten(?:ing)?|take me back to court|court)\b/i.test(text)) themes.push('threatening court');
  if (/\b(accus(?:e|ing|ation)|violating|withholding|controlling)\b/i.test(text)) themes.push('accusations');
  if (/\b(twisting|reframing|lying|lied)\b/i.test(text)) themes.push('reframing or disputed facts');
  if (/\b(manipulat(?:e|ing|ion)|gaslight|bully(?:ing)?)\b/i.test(text)) themes.push('pressure language to document neutrally');
  return unique(themes);
}

function accusations(text: string) {
  const items: string[] = [];
  if (/\b(lied|lying)\b/i.test(text)) items.push('The user says the other parent lied or misstated facts.');
  if (/\b(violating|violation)\b/i.test(text)) items.push('The other parent is accusing the user of violating the order.');
  if (/\b(withholding)\b/i.test(text)) items.push('The other parent is accusing the user of withholding.');
  if (/\b(controlling)\b/i.test(text)) items.push('The other parent is calling the user controlling.');
  if (/\b(refused the exchange|refuse[ds]? exchange)\b/i.test(text)) items.push('There is a disputed exchange refusal.');
  return unique(items);
}

function timeline(text: string): PackedCaseIntake['factualTimeline'] {
  const items: PackedCaseIntake['factualTimeline'] = [];
  const relative = text.match(/\b((?:today|yesterday|last night|this morning|three weeks ago|two weeks ago|last week|on\s+[A-Z][a-z]+\s+\d{1,2}))\b[^.?!]*/gi) ?? [];
  for (const entry of relative.slice(0, 8)) {
    items.push({
      dateOrRelativeTime: entry.match(/^(today|yesterday|last night|this morning|three weeks ago|two weeks ago|last week|on\s+[A-Z][a-z]+\s+\d{1,2})/i)?.[0] ?? 'date not stated',
      event: entry.trim(),
      evidenceMentioned: /\b(text|message|email|screenshot|order|record|proof)\b/i.test(entry) ? ['message or record mentioned'] : [],
      legalRelevance: /\bexchange|pickup|drop/i.test(entry) ? 'exchange' : /\bcourt|motion|filed/i.test(entry) ? 'court' : /\btext|message|email/i.test(entry) ? 'communication' : 'other',
    });
  }
  return items;
}

function questions(text: string): PackedCaseIntake['userQuestions'] {
  const items: PackedCaseIntake['userQuestions'] = [];
  const add = (question: string, category: PackedCaseIntake['userQuestions'][number]['category']) => {
    items.push({ question, category });
  };
  if (/\bwhat\s+(?:do|should)\s+i\s+(?:say|respond)|how do i respond|text back|message him|message her\b/i.test(text)) add('What should I say or respond?', 'what_to_respond');
  if (/\b(what\s+(?:do|should)\s+i\s+file\s+(?:in\s+)?response|what\s+do\s+i\s+need\s+to\s+file\s+next|how\s+do\s+i\s+(?:answer|respond)\s+(?:(?:to|against)\s+)?(?:his|her|the)?\s*(?:motion|petition)|response\s+to\s+(?:the\s+)?(?:motion|petition)|what\s+court\s+response|file\s+next\s+after\s+being\s+served|what\s+response\s+do\s+i\s+need\s+to\s+file)\b/i.test(text)) {
    add('What court response do I need to file?', 'court_response_planning');
  } else if (/\bwhat\s+(?:do|should)\s+i\s+file|what happens next|what do i file\b/i.test(text)) {
    add('What do I file next?', 'what_to_file');
  }
  if (/\bcan i do this myself|pro se|without (?:a|an) attorney\b/i.test(text)) add('Can I handle this myself?', 'can_i_do_this_myself');
  if (/\bhow much|cost|filing fee|attorney fee|retainer\b/i.test(text)) add('How much might this cost?', 'cost');
  if (/\blegal aid|free lawyer|resources|lawyer referral|attorney resources\b/i.test(text)) add('What legal-aid or attorney resources exist?', 'legal_aid');
  if (/\bhow do i explain|tell the judge|show the judge|what do i say in court\b/i.test(text)) add('How do I explain this to the judge?', 'judge_explanation');
  if (/\bwhat do i do|next steps|i don'?t know what to do\b/i.test(text)) add('What should I do next?', 'next_steps');
  if (/\bcan he do that|am i wrong|is that allowed|what does the order mean\b/i.test(text)) add('What does the order allow?', 'order_interpretation');
  return items;
}

export function parsePackedCaseIntake(message: string, contextText = ''): PackedCaseIntake {
  const text = `${contextText}\n${message}`;
  const lower = text.toLowerCase();
  const issuePackIds = detectFamilyLawIssuePackIds(text);
  const issuePackLabels = getFamilyLawIssuePacksByIds(issuePackIds).map((pack) => pack.label);
  const serviceNegated = has(lower, /\b(not served|haven'?t been served|have not been served|wasn'?t served|was not served|never served)\b/i);
  const filingNegated = has(lower, /\b(no (?:court )?filing|nothing (?:has been )?filed|hasn'?t filed|has not filed|didn'?t file|did not file|not taking me to court|no motion|no petition)\b/i);
  const orderNegated = has(lower, /\b(no order|no court order|don'?t have (?:a|an) order|do not have (?:a|an) order|without (?:a|an) order)\b/i);
  const userWasServed = serviceNegated
    ? false
    : has(lower, /\bserved|got served|was served\b/i)
      ? true
      : null;
  const proceedingStatus = inferCourtProceedingStatus({ lower, filingNegated, userWasServed });
  const state = validStateName(captureFirst(text, /\b(?:state is|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/));
  const county = captureFirst(text, /\b([A-Z][a-z]+)\s+County\b/);
  const hasExistingOrder = orderNegated
    ? false
    : has(lower, /\border|parenting plan|possession schedule\b/i)
      ? true
      : null;
  const otherPartyFiledSomething = [
    'filing_claimed_not_seen',
    'filing_uploaded',
    'served_user_confirmed',
    'hearing_confirmed',
  ].includes(proceedingStatus);
  const hasConfirmedDeadlineTrigger = proceedingStatus === 'filing_uploaded' ||
    proceedingStatus === 'served_user_confirmed' ||
    proceedingStatus === 'hearing_confirmed' ||
    has(lower, /\b(?:response|answer)\b.{0,40}\b(?:due|deadline)\b/i);
  const hasCourtDeadlineSignal = !filingNegated && (
    hasConfirmedDeadlineTrigger ||
    has(lower, /\bhearing notice|official notice|docket\b/i)
  );

  return {
    issuePackIds,
    emotionalState: {
      overwhelmed: has(lower, /\boverwhelmed|freaking out|panicking|stressed\b/i),
      scared: has(lower, /\bscared|afraid|fear|terrified\b/i),
      confused: has(lower, /\bconfused|don'?t understand|lost\b/i),
      angry: has(lower, /\bangry|mad|tell him off|tell her off\b/i),
      reactive: has(lower, /\btell him off|tell her off|want to respond|want to text\b/i),
      financiallyStressed: has(lower, /\bno money|can'?t afford|cannot afford|low income|cost|how much\b/i),
      feelsManipulatedOrPressured: has(lower, /\bpressur(?:e|ing)|twisting|manipulat(?:e|ing|ion)|won'?t stop|keeps (?:saying|calling)|threaten(?:ing)?|accus(?:e|ing)|withholding|controlling|gaslight|bully/i),
    },
    courtPosture: {
      proceedingStatus,
      otherPartyFiledSomething,
      userWasServed,
      servedDate: captureFirst(text, /\bserved\s+(?:on\s+)?([^.,;!?]+)/i),
      hearingDate: captureFirst(text, /\bhearing\s+(?:is\s+)?(?:on\s+)?([^.,;!?]+)/i),
      responseDeadline: captureFirst(text, /\b(?:response|answer)\s+(?:is\s+)?(?:due|deadline)\s+(?:on\s+)?([^.,;!?]+)/i),
      filingType: inferFilingType(text),
      reliefRequested: [],
      state,
      county,
      courtName: captureFirst(text, /\b(?:court is|in the)\s+([^.,;!?]*Court)\b/i),
      causeNumberKnown: has(lower, /\bcause number|case number\b/i),
    },
    currentOrderContext: {
      hasExistingOrder,
      orderUploaded: has(lower, /\buploaded|attached|shared\b/i) && hasExistingOrder === true,
      relevantOrderIssues: unique([...relevantOrderIssues(text), ...issuePackLabels]),
      needsOrderReview: hasExistingOrder === true || has(lower, /\bwhat does the order|order says|according to the order\b/i),
    },
    coParentCommunication: {
      messagesMentioned: has(lower, /\btexts?|messages?|appclose|ourfamilywizard|emails?\b/i),
      numberOfMessagesMentioned: inferMessageCount(text),
      userNeedsResponseDraft: has(lower, /\bwhat\s+(?:do|should)\s+i\s+(?:say|respond)|what should i respond|how do i respond|text back|message him|message her|can you write\b/i),
      toneRisk: has(lower, /\btell him off|tell her off|freaking out|panicking|angry|mad|won'?t stop|threaten/i) ? 'high' : has(lower, /\bconfused|pressur/i) ? 'medium' : 'low',
      pressureOrAccusationThemes: pressureThemes(text),
      logisticsIssue: inferLogisticsIssue(text),
    },
    factualTimeline: timeline(text),
    accusationsOrDisputes: accusations(text),
    userQuestions: questions(text),
    immediateRisks: {
      safetyRisk: hasPhysicalSafetySignal(lower),
      childSafetyRisk: hasChildSafetySignal(lower),
      deadlineRisk: hasCourtDeadlineSignal,
      hearingRisk: !filingNegated && has(lower, /\bhearing|court date|trial\b/i),
      exchangeRisk: has(lower, /\bexchange|pickup|pick up|drop[-\s]?off|possession\b/i),
      enforcementRisk: has(lower, /\benforce|enforcement|violat(?:e|ing|ion)\b/i),
      contemptRisk: has(lower, /\bcontempt|violating|violation\b/i),
      missingDocumentRisk: !filingNegated && has(lower, /\bfiled|motion|petition|served|court\b/i) && !has(lower, /\buploaded|attached|paste|pasted\b/i),
      financialAccessRisk: has(lower, /\bno money|can'?t afford|cannot afford|cost\b/i),
    },
    missingCriticalInfo: unique([
      proceedingStatus === 'threat_only' ? 'whether anything was actually filed or served' : '',
      otherPartyFiledSomething && !filingNegated && has(lower, /\bfiled|motion|petition|served|court\b/i) && !has(lower, /\buploaded|attached|paste|pasted\b/i) ? 'the court paper that was filed' : '',
      otherPartyFiledSomething && userWasServed !== true ? 'whether and when you were served' : '',
      otherPartyFiledSomething && !has(lower, /\bhearing|court date\b/i) ? 'any hearing date' : '',
      has(lower, /\bcost|legal aid|fee|attorney|resources|pro se|filing\b/i) && !state ? 'state' : '',
      has(lower, /\bcost|legal aid|fee|attorney|resources|pro se|filing\b/i) && !county ? 'county' : '',
    ]),
  };
}

export function classifyPackedCaseIntake(message: string, contextText = ''): MultiIntentResult {
  const intake = parsePackedCaseIntake(message, contextText);
  const text = `${contextText}\n${message}`;
  const issuePackNeedsDocumentReview = intake.issuePackIds.length > 0 &&
    /\b(order|court order|under my order|filed|served|motion|petition|subpoena|discovery request|notice|hearing|support order|payment record|passport|geographic restriction)\b/i.test(text);
  const secondaryIntents: LegalIntent[] = [];
  if (intake.courtPosture.otherPartyFiledSomething) secondaryIntents.push('new_court_filing_received');
  if (intake.immediateRisks.deadlineRisk) secondaryIntents.push('court_response_deadline');
  if (intake.userQuestions.some((q) => q.category === 'court_response_planning')) secondaryIntents.push('court_response_planning');
  if (intake.coParentCommunication.userNeedsResponseDraft) secondaryIntents.push('co_parent_response_strategy');
  if (intake.emotionalState.feelsManipulatedOrPressured) secondaryIntents.push('pressure_or_manipulation_response');
  if (intake.emotionalState.overwhelmed || intake.emotionalState.scared || intake.emotionalState.confused) secondaryIntents.push('emotional_legal_support');
  if (intake.userQuestions.some((q) => q.category === 'can_i_do_this_myself')) secondaryIntents.push('pro_se_feasibility');
  if (intake.userQuestions.some((q) => q.category === 'cost')) secondaryIntents.push('attorney_cost_question');
  if (intake.userQuestions.some((q) => q.category === 'legal_aid')) secondaryIntents.push('legal_aid_resource_request');
  if (intake.userQuestions.some((q) => q.category === 'judge_explanation')) secondaryIntents.push('judge_explanation_strategy');
  if (intake.factualTimeline.length > 0 || intake.coParentCommunication.messagesMentioned) secondaryIntents.push('documentation_guidance');
  if (intake.issuePackIds.length > 0 && !secondaryIntents.includes('documentation_guidance')) secondaryIntents.push('evidence_timeline_strategy');

  const urgency = intake.immediateRisks.safetyRisk || intake.immediateRisks.childSafetyRisk
    ? 'urgent'
    : intake.immediateRisks.deadlineRisk || intake.immediateRisks.hearingRisk
      ? 'high'
      : intake.emotionalState.overwhelmed || intake.emotionalState.scared
        ? 'medium'
        : 'low';

  const primaryIntent = secondaryIntents.includes('new_court_filing_received')
    ? 'packed_case_intake'
    : secondaryIntents[0] ?? 'general_summary';

  return {
    primaryIntent,
    secondaryIntents: uniqueIntents(secondaryIntents),
    urgency,
    requiresDocumentReview: intake.currentOrderContext.needsOrderReview || intake.courtPosture.otherPartyFiledSomething || issuePackNeedsDocumentReview,
    requiresCourtDeadlineCheck: intake.courtPosture.otherPartyFiledSomething || intake.immediateRisks.deadlineRisk,
    requiresCoParentDraft: intake.coParentCommunication.userNeedsResponseDraft,
    requiresResourceLookup: intake.userQuestions.some((q) => q.category === 'cost' || q.category === 'legal_aid' || q.category === 'attorney_resources'),
    requiresFilingPlanning: intake.courtPosture.otherPartyFiledSomething ||
      intake.userQuestions.some((q) => q.category === 'what_to_file' || q.category === 'court_response_planning'),
  };
}
