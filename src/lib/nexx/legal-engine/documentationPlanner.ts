import type { PackedCaseIntake } from './packedCaseIntake';
import { getFamilyLawIssuePacksByIds } from './issuePacks/familyLawIssuePacks';
import { unique } from './stringUtils';

export function buildDocumentationPlan(intake: PackedCaseIntake) {
  const issuePacks = getFamilyLawIssuePacksByIds(intake.issuePackIds);
  const packEvidence = issuePacks.flatMap((pack) => pack.requiredEvidence);
  const packExhibitIdeas = issuePacks.flatMap((pack) =>
    pack.requiredEvidence.slice(0, 4).map((item) => `${pack.label}: ${item}`)
  );
  const evidenceToSave = unique([
    intake.coParentCommunication.messagesMentioned ? 'the co-parent message thread' : '',
    intake.courtPosture.otherPartyFiledSomething ? 'the court paper that was filed or served' : '',
    intake.currentOrderContext.hasExistingOrder ? 'the relevant current order pages' : '',
    intake.immediateRisks.exchangeRisk ? 'exchange records, calendars, pickup/drop-off proof, or attempted-compliance proof' : '',
    intake.accusationsOrDisputes.length > 0 ? 'any message containing the accusation or disputed statement' : '',
    ...packEvidence,
    'your calm response',
  ]);

  return {
    timelineItems: intake.factualTimeline.length > 0
      ? intake.factualTimeline.map((item) => `${item.dateOrRelativeTime}: ${item.event}`)
      : ['Make a short date-order timeline of what happened, what the order required, and what proof exists.'],
    evidenceToSave,
    neutralFraming: [
      'Use dates, facts, and order language.',
      'Describe what each person did or said without labels.',
      'Let the messages and order language show the dispute.',
    ],
    exhibitIdeas: unique([
      intake.currentOrderContext.hasExistingOrder ? 'current order page for the disputed provision' : '',
      intake.coParentCommunication.messagesMentioned ? 'screenshots or export of the complete message thread' : '',
      intake.immediateRisks.exchangeRisk ? 'exchange logs, calendar entries, or location/time proof' : '',
      intake.courtPosture.otherPartyFiledSomething ? 'filed motion/petition and any notice of hearing' : '',
      ...packExhibitIdeas,
    ]),
  };
}
