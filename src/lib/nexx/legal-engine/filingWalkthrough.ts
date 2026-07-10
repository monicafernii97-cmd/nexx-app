import type { PackedCaseIntake } from './packedCaseIntake';
import { FILING_READINESS_CHECKLIST } from './filingReadinessChecklist';

export function buildFilingPlan(intake: PackedCaseIntake) {
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
    filingReadinessChecklist: FILING_READINESS_CHECKLIST,
    nextInfoNeededBeforeDrafting: intake.missingCriticalInfo.length > 0
      ? intake.missingCriticalInfo
      : [
        'the filed document',
        'service date',
        'hearing date if one exists',
        'current order',
        'facts in date order',
      ],
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
