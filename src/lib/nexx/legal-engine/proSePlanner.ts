import type { PackedCaseIntake } from './packedCaseIntake';

export function buildProSeAssessment(intake: PackedCaseIntake) {
  const highRisk = intake.immediateRisks.contemptRisk ||
    intake.courtPosture.filingType === 'modification' ||
    intake.courtPosture.filingType === 'enforcement' ||
    intake.courtPosture.filingType === 'protective_order';

  return {
    possibleProSe: true,
    practicalRead: highRisk
      ? 'You may be able to handle parts of this pro se, but the issues named here are higher-risk. Limited-scope attorney review would be worth considering if you can access it.'
      : 'Possibly, yes. Basic answers, organizing exhibits, timelines, and neutral written responses are often manageable pro se if deadlines and local rules are checked carefully.',
    tasksLikelyDoableProSe: [
      'organizing the timeline and evidence',
      'saving message threads and order pages',
      'preparing a basic draft response for review',
      'using court self-help or law library resources',
    ],
    tasksHigherRiskWithoutAttorney: [
      'contempt or enforcement allegations',
      'major custody or possession modifications',
      'emergency orders or protective-order overlap',
      'contested hearings with evidence objections',
      'large child-support arrears or complex financial claims',
    ],
    limitedScopeHelpRecommendedFor: [
      'reviewing the filed document and deadline',
      'checking the draft before filing',
      'preparing for a contested hearing',
      'confirming local procedure and service requirements',
    ],
  };
}
