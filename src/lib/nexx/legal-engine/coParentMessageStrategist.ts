import type { PackedCaseIntake } from './packedCaseIntake';
import { getFamilyLawIssuePacksByIds, priorityForIssuePack } from './issuePacks/familyLawIssuePacks';

export type VerifiedOrderInterpretationForDraft = {
  directAnswer: string;
  controllingQuote?: string;
  practicalResult?: string;
  startTime?: string | null;
  endTime?: string | null;
  sourcePages?: string[];
};

export type VerifiedExchangeForDraft = {
  time?: string | null;
  location?: string | null;
  date?: string | null;
  sourcePages?: string[];
};

function textFrom(intake: PackedCaseIntake, contextText = '') {
  return [
    contextText,
    ...intake.currentOrderContext.relevantOrderIssues,
    intake.coParentCommunication.logisticsIssue ?? '',
    ...intake.coParentCommunication.pressureOrAccusationThemes,
  ].join(' ');
}

function summarizeVerifiedOrderInterpretation(verified?: VerifiedOrderInterpretationForDraft | null) {
  if (!verified?.directAnswer && !verified?.practicalResult) return null;

  const timing = verified.startTime && verified.endTime
    ? ` The practical timing I am following is ${verified.startTime} to ${verified.endTime}.`
    : '';
  const pages = verified.sourcePages?.length ? ` ${verified.sourcePages.map((page) => `[${page}]`).join(' ')}` : '';
  return `${verified.practicalResult || verified.directAnswer}${timing}${pages}`.trim();
}

function fatherDayDrafts(
  hasOrderContext: boolean,
  verifiedOrderInterpretation?: VerifiedOrderInterpretationForDraft | null
) {
  const verifiedSummary = summarizeVerifiedOrderInterpretation(verifiedOrderInterpretation);

  if (verifiedSummary) {
    return {
      neutralDraft:
        `My understanding from the order language is: ${verifiedSummary} I plan to follow that written provision.`,
      firmerDraft:
        `I do not agree to a possession-time change based on an unstated provision. My reading of the order language is: ${verifiedSummary} If you believe a different signed-order provision controls, please identify that specific language.`,
    };
  }

  return {
    neutralDraft:
      'Please identify the specific written provision you are relying on for Father\'s Day possession. I want to keep this focused on the order and avoid arguing.',
    firmerDraft:
      hasOrderContext
        ? 'I am not agreeing to a possession-time change without confirming the specific written provision. Please identify the order language you believe controls Father\'s Day.'
        : 'I am not agreeing to a possession-time change without seeing the written schedule. Please identify the specific order language you are relying on.',
  };
}

function formatSourcePages(sourcePages?: string[]) {
  return sourcePages?.length ? ` ${sourcePages.map((page) => `[${page}]`).join(' ')}` : '';
}

function punctuateSentence(value: string) {
  return /[.!?]$/.test(value.trim()) ? value.trim() : `${value.trim()}.`;
}

function pickupDrafts(
  hasOrderContext: boolean,
  verifiedExchange?: VerifiedExchangeForDraft | null
) {
  const pages = formatSourcePages(verifiedExchange?.sourcePages);
  if (verifiedExchange?.time) {
    const location = verifiedExchange.location ? ` at ${verifiedExchange.location}` : '';
    const date = verifiedExchange.date ? ` on ${verifiedExchange.date}` : '';
    const detail = punctuateSentence(`${verifiedExchange.time}${location}${date}`);
    return {
      neutralDraft:
        `The order lists the exchange time as ${detail}${pages} I will make the child available then.`,
      firmerDraft:
        `I disagree with changing the exchange time outside the order. The exchange time I have verified from the order is ${detail}${pages} I will follow that written provision.`,
    };
  }

  if (verifiedExchange?.location) {
    const date = verifiedExchange.date ? ` on ${verifiedExchange.date}` : '';
    const detail = punctuateSentence(`${verifiedExchange.location}${date}`);
    return {
      neutralDraft:
        `The order lists the exchange location as ${detail}${pages} I will use that written exchange location.`,
      firmerDraft:
        `I am not agreeing to a changed exchange location outside the order. The exchange location I have verified from the order is ${detail}${pages}`,
    };
  }

  return hasOrderContext ? {
    neutralDraft:
      'Please identify the specific exchange time and written provision you are relying on. I want to keep this focused on the order and the child.',
    firmerDraft:
      'I am not agreeing to a changed exchange time without confirming the specific written provision. Please identify the exchange time and order language you believe controls.',
  } : {
    neutralDraft:
      'Please confirm the exchange time you are requesting and the written provision you are relying on. I want to keep this focused on logistics and the child.',
    firmerDraft:
      'I am not agreeing to a changed exchange time without confirming the written schedule. Please send the specific time and provision you are relying on.',
  };
}

function generalDrafts(hasOrderContext: boolean) {
  return hasOrderContext ? {
    neutralDraft:
      'I received your message. I will continue following the current court order. If there is a specific exchange or scheduling issue you need addressed, please state it clearly.',
    firmerDraft:
      'I disagree with your characterization. I am following the current court order and will keep communication focused on the child and the order.',
  } : {
    neutralDraft:
      'I received your message. If there is a specific child-related logistics issue you need addressed, please state it clearly.',
    firmerDraft:
      'I disagree with your characterization. I will keep communication focused on the child and the specific logistics issue.',
  };
}

const PRIORITY_SCORE = {
  urgent: 4,
  high: 3,
  medium: 2,
  later: 1,
};

function issuePackDrafts(intake: PackedCaseIntake, issueText: string) {
  const candidates = getFamilyLawIssuePacksByIds(intake.issuePackIds)
    .filter((item) => item.courtSafeResponseDrafts.neutral)
    .map((item) => ({
      item,
      relevance: item.triggerPatterns.some((pattern) => pattern.test(issueText)) ? 100 : 0,
      priority: PRIORITY_SCORE[priorityForIssuePack(item)],
    }))
    .sort((a, b) => (b.relevance + b.priority) - (a.relevance + a.priority));
  const pack = candidates[0]?.item;
  if (!pack) return null;

  return {
    neutralDraft: pack.courtSafeResponseDrafts.neutral,
    firmerDraft: pack.courtSafeResponseDrafts.firmer ?? pack.courtSafeResponseDrafts.neutral,
  };
}

export function buildCoParentResponseStrategy(
  intake: PackedCaseIntake,
  contextText = '',
  verifiedOrderInterpretation?: VerifiedOrderInterpretationForDraft | null,
  verifiedExchange?: VerifiedExchangeForDraft | null
) {
  const issueText = textFrom(intake, contextText);
  const hasOrderContext = intake.currentOrderContext.hasExistingOrder === true ||
    /\b(court order|order language|written order|signed order)\b/i.test(contextText);
  const drafts = /father'?s day/i.test(issueText)
    ? fatherDayDrafts(hasOrderContext, verifiedOrderInterpretation)
    : /\b(exchange|pickup|pick up|drop[-\s]?off)\b/i.test(issueText)
      ? pickupDrafts(hasOrderContext, verifiedExchange)
      : issuePackDrafts(intake, issueText) ?? generalDrafts(hasOrderContext);

  const needed = intake.coParentCommunication.userNeedsResponseDraft ||
    intake.coParentCommunication.messagesMentioned ||
    intake.emotionalState.feelsManipulatedOrPressured;

  return {
    needed,
    strategy: needed
      ? 'Respond only to the logistics or order issue. Do not answer every accusation or match the pressure.'
      : 'No co-parent response is required unless there is a specific logistics, safety, or order-compliance issue.',
    neutralDraft: needed ? drafts.neutralDraft : null,
    firmerDraft: needed ? drafts.firmerDraft : null,
    whatNotToSay: [
      'Do not argue about motives.',
      'Do not respond to every accusation.',
      'Do not send a long emotional explanation.',
      'Do not threaten court unless a court step is actually being taken.',
    ],
  };
}
