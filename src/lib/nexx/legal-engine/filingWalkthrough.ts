import type { PackedCaseIntake } from './packedCaseIntake';
import { FILING_READINESS_CHECKLIST } from './filingReadinessChecklist';
import { getFamilyLawIssuePacksByIds } from './issuePacks/familyLawIssuePacks';
import { unique } from './stringUtils';

export function buildFilingPlan(intake: PackedCaseIntake) {
  const issuePacks = getFamilyLawIssuePacksByIds(intake.issuePackIds);
  const likelyNextDocument = intake.courtPosture.filingType === 'petition'
    ? 'answer or other responsive pleading to verify'
    : intake.courtPosture.filingType === 'motion'
      ? 'written response, answer, or hearing response to verify'
      : intake.courtPosture.filingType === 'temporary_orders'
        ? 'temporary-orders response path to verify'
        : intake.courtPosture.otherPartyFiledSomething
          ? 'responsive filing or hearing response to verify'
          : null;

  return {
    likelyNextDocument,
    filingReadinessChecklist: unique([
      ...FILING_READINESS_CHECKLIST,
      ...issuePacks.flatMap((pack) => pack.filingReadinessRequirements),
    ]),
    nextInfoNeededBeforeDrafting: intake.missingCriticalInfo.length > 0
      ? unique([
        ...intake.missingCriticalInfo,
        ...issuePacks.flatMap((pack) => pack.filingReadinessRequirements.slice(0, 4)),
      ])
      : unique([
        'the filed document',
        'service date',
        'hearing date if one exists',
        'current order',
        'facts in date order',
        ...issuePacks.flatMap((pack) => pack.filingReadinessRequirements.slice(0, 4)),
      ]),
  };
}

export function filingWalkthroughSteps() {
  return [
    'Identify exactly what was filed.',
    'Confirm the date served.',
    'Confirm any hearing date.',
    'Confirm the response deadline.',
    'Identify the correct response document.',
    'Draft facts in date order.',
    'Attach or list exhibits.',
    'Add certificate of service and signature block.',
    'Check local rules, fees, and service requirements.',
    'Save proof of filing and service.',
    'Prepare a short hearing outline.',
  ];
}
