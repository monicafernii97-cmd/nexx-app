import type { PackedCaseIntake } from './packedCaseIntake';

export function buildCostResourcePlan(intake: PackedCaseIntake) {
  const stateNeeded = !intake.courtPosture.state;
  const countyNeeded = !intake.courtPosture.county;

  return {
    costOverview: {
      proSeCostCategories: [
        'filing fee',
        'e-filing service fee',
        'service of process fee',
        'constable or process-server fee if service is required',
        'copies, exhibits, notary, parking, transportation, and time off work',
        'mediation fee if the court orders mediation',
      ],
      attorneyCostCategories: [
        'consultation fee',
        'limited-scope review',
        'drafting-only help',
        'hearing preparation',
        'full representation retainer',
        'hourly billing or task-based flat fee if offered',
      ],
      exactCostsRequireLocalLookup: true,
      costExplanation:
        'Exact filing fees, service fees, and attorney prices depend on the county, court, filing type, and attorney. I would verify those on the official district clerk or court website before filing.',
    },
    resourcePlan: {
      stateNeeded,
      countyNeeded,
      resourceTypesToFind: [
        'official district clerk or family court fee schedule',
        'state court self-help forms',
        'legal-aid intake',
        'local bar lawyer referral',
        'law library or family court help center',
        'fee waiver or statement of inability to afford costs',
      ],
      suggestedSearchTargets: [
        intake.courtPosture.county && intake.courtPosture.state
          ? `${intake.courtPosture.county} County ${intake.courtPosture.state} district clerk family filing fees`
          : 'county district clerk family filing fees',
        intake.courtPosture.state
          ? `${intake.courtPosture.state} official family law self help forms`
          : 'state court family law self help forms',
        intake.courtPosture.county && intake.courtPosture.state
          ? `${intake.courtPosture.county} County ${intake.courtPosture.state} legal aid family law`
          : 'local legal aid family law',
      ],
    },
  };
}
