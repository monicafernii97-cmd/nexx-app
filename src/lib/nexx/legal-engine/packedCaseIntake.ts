export type PackedCaseIntake = {
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

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

function captureFirst(text: string, pattern: RegExp) {
  return text.match(pattern)?.[1]?.trim() ?? null;
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function uniqueIntents(values: LegalIntent[]) {
  return Array.from(new Set(values));
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
  if (/\bwhat\s+(?:do|should)\s+i\s+file|what happens next|what do i file\b/i.test(text)) add('What do I file next?', 'what_to_file');
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
  const userWasServed = has(lower, /\bserved|got served|was served\b/i)
    ? true
    : has(lower, /\bnot served|haven'?t been served|wasn'?t served\b/i)
      ? false
      : null;
  const state = captureFirst(text, /\b(?:state is|in)\s+([A-Z][a-z]+)\b/);
  const county = captureFirst(text, /\b([A-Z][a-z]+)\s+County\b/);
  const hasExistingOrder = has(lower, /\border|parenting plan|possession schedule\b/i)
    ? true
    : null;

  return {
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
      otherPartyFiledSomething: has(lower, /\btaking me to court|filed|motion|petition|got served|served|hearing\b/i),
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
      relevantOrderIssues: relevantOrderIssues(text),
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
      safetyRisk: has(lower, /\bdanger|unsafe|violence|threaten.*hurt|911\b/i),
      childSafetyRisk: has(lower, /\bchild.*unsafe|kids?.*danger|harm.*child\b/i),
      deadlineRisk: has(lower, /\bdeadline|due|served|filed|motion|petition|hearing\b/i),
      hearingRisk: has(lower, /\bhearing|court date|trial\b/i),
      exchangeRisk: has(lower, /\bexchange|pickup|pick up|drop[-\s]?off|possession\b/i),
      enforcementRisk: has(lower, /\benforce|enforcement|violat(?:e|ing|ion)\b/i),
      contemptRisk: has(lower, /\bcontempt|violating|violation\b/i),
      missingDocumentRisk: has(lower, /\bfiled|motion|petition|served|court\b/i) && !has(lower, /\buploaded|attached|paste|pasted\b/i),
      financialAccessRisk: has(lower, /\bno money|can'?t afford|cannot afford|cost\b/i),
    },
    missingCriticalInfo: unique([
      has(lower, /\bfiled|motion|petition|served|court\b/i) && !has(lower, /\buploaded|attached|paste|pasted\b/i) ? 'the court paper that was filed' : '',
      has(lower, /\bfiled|motion|petition|served|court\b/i) && userWasServed !== true ? 'whether and when you were served' : '',
      has(lower, /\bfiled|motion|petition|served|court\b/i) && !has(lower, /\bhearing|court date\b/i) ? 'any hearing date' : '',
      has(lower, /\bcost|legal aid|fee|attorney|resources|pro se|filing\b/i) && !state ? 'state' : '',
      has(lower, /\bcost|legal aid|fee|attorney|resources|pro se|filing\b/i) && !county ? 'county' : '',
    ]),
  };
}

export function classifyPackedCaseIntake(message: string, contextText = ''): MultiIntentResult {
  const intake = parsePackedCaseIntake(message, contextText);
  const secondaryIntents: LegalIntent[] = [];
  if (intake.courtPosture.otherPartyFiledSomething) secondaryIntents.push('new_court_filing_received');
  if (intake.immediateRisks.deadlineRisk) secondaryIntents.push('court_response_deadline');
  if (intake.coParentCommunication.userNeedsResponseDraft) secondaryIntents.push('co_parent_response_strategy');
  if (intake.emotionalState.feelsManipulatedOrPressured) secondaryIntents.push('pressure_or_manipulation_response');
  if (intake.emotionalState.overwhelmed || intake.emotionalState.scared || intake.emotionalState.confused) secondaryIntents.push('emotional_legal_support');
  if (intake.userQuestions.some((q) => q.category === 'can_i_do_this_myself')) secondaryIntents.push('pro_se_feasibility');
  if (intake.userQuestions.some((q) => q.category === 'cost')) secondaryIntents.push('attorney_cost_question');
  if (intake.userQuestions.some((q) => q.category === 'legal_aid')) secondaryIntents.push('legal_aid_resource_request');
  if (intake.userQuestions.some((q) => q.category === 'judge_explanation')) secondaryIntents.push('judge_explanation_strategy');
  if (intake.factualTimeline.length > 0 || intake.coParentCommunication.messagesMentioned) secondaryIntents.push('documentation_guidance');

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
    requiresDocumentReview: intake.currentOrderContext.needsOrderReview || intake.courtPosture.otherPartyFiledSomething,
    requiresCourtDeadlineCheck: intake.courtPosture.otherPartyFiledSomething || intake.immediateRisks.deadlineRisk,
    requiresCoParentDraft: intake.coParentCommunication.userNeedsResponseDraft,
    requiresResourceLookup: intake.userQuestions.some((q) => q.category === 'cost' || q.category === 'legal_aid' || q.category === 'attorney_resources'),
    requiresFilingPlanning: intake.courtPosture.otherPartyFiledSomething || intake.userQuestions.some((q) => q.category === 'what_to_file'),
  };
}
import type { LegalIntent, MultiIntentResult } from '../../types';
