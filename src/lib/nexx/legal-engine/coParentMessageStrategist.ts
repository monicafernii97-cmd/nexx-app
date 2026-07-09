import type { PackedCaseIntake } from './packedCaseIntake';

function textFrom(intake: PackedCaseIntake, contextText = '') {
  return [
    contextText,
    ...intake.currentOrderContext.relevantOrderIssues,
    intake.coParentCommunication.logisticsIssue ?? '',
    ...intake.coParentCommunication.pressureOrAccusationThemes,
  ].join(' ');
}

function fatherDayDrafts() {
  return {
    neutralDraft:
      'Based on the order, Father\'s Day possession begins at 6:00 p.m. on the Friday preceding Father\'s Day and ends at 8:00 a.m. on the Monday after Father\'s Day. I plan to follow that provision as written.',
    firmerDraft:
      'I do not agree that Father\'s Day possession begins Thursday. The order specifically states Friday at 6:00 p.m. through Monday at 8:00 a.m. Unless there is a later signed order changing that language, I will follow the Father\'s Day provision.',
  };
}

function pickupDrafts() {
  return {
    neutralDraft:
      'The order lists the exchange time as ____. I am available for the exchange at the court-ordered time.',
    firmerDraft:
      'I disagree with changing the exchange time outside the order. I will make the child available at the court-ordered exchange time of ____.',
  };
}

function generalDrafts() {
  return {
    neutralDraft:
      'I received your message. I will continue following the current court order. If there is a specific exchange or scheduling issue you need addressed, please state it clearly.',
    firmerDraft:
      'I disagree with your characterization. I am following the current court order and will keep communication focused on the child and the order.',
  };
}

export function buildCoParentResponseStrategy(intake: PackedCaseIntake, contextText = '') {
  const issueText = textFrom(intake, contextText);
  const drafts = /father'?s day/i.test(issueText)
    ? fatherDayDrafts()
    : /\b(exchange|pickup|pick up|drop[-\s]?off)\b/i.test(issueText)
      ? pickupDrafts()
      : generalDrafts();

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
