import type { ClauseRetrievalBucket } from '../retrievalPlan';

export type FamilyLawIssuePackId =
  | 'enforcement_contempt'
  | 'modification_temporary_orders'
  | 'child_support_arrears'
  | 'school_medical_decision_authority'
  | 'exchange_location_time'
  | 'relocation_travel_passports'
  | 'communication_notice'
  | 'protective_order_family_violence'
  | 'fee_waiver_cost_access'
  | 'discovery_subpoena_evidence';

export type FamilyLawIssuePack = {
  id: FamilyLawIssuePackId;
  label: string;
  summary: string;
  intentTriggers: string[];
  triggerPatterns: RegExp[];
  documentRetrievalBuckets: Array<{
    bucket: ClauseRetrievalBucket;
    purpose: string;
    queries: string[];
  }>;
  orderHierarchy: string[];
  statutoryAndLocalRuleTargets: string[];
  requiredEvidence: string[];
  counterarguments: string[];
  courtSafeResponseDrafts: {
    neutral: string;
    firmer?: string;
  };
  proSeRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  filingReadinessRequirements: string[];
};

export const FAMILY_LAW_ISSUE_PACKS: FamilyLawIssuePack[] = [
  {
    id: 'enforcement_contempt',
    label: 'Enforcement and contempt',
    summary: 'Enforcement and contempt issues turn on the exact order, the alleged violation, notice, ability to comply, and requested sanctions.',
    intentTriggers: ['enforcement', 'contempt', 'violated the order', 'motion to enforce', 'show cause'],
    triggerPatterns: [
      /\b(enforce|enforcement|contempt|show cause|violat(?:e|ed|ing|ion)|motion to enforce|sanctions?)\b/i,
    ],
    documentRetrievalBuckets: [
      {
        bucket: 'controlling_specific_clause',
        purpose: 'Find the exact command allegedly violated.',
        queries: ['ordered to', 'shall', 'must', 'is required to', 'specific possession provision', 'support obligation'],
      },
      {
        bucket: 'exception_priority_language',
        purpose: 'Find defenses or conditions that affect enforceability.',
        queries: ['except as otherwise provided', 'if able', 'conditioned on', 'notice required', 'makeup possession'],
      },
      {
        bucket: 'later_modification_language',
        purpose: 'Check whether a later order changed the obligation.',
        queries: ['amended order', 'modified order', 'supersedes prior order', 'later signed order'],
      },
    ],
    orderHierarchy: ['signed current order', 'later modification', 'specific clause', 'notice/service language', 'sanctions or purge language'],
    statutoryAndLocalRuleTargets: ['state enforcement statute', 'contempt pleading rule', 'local show-cause procedure', 'service rule'],
    requiredEvidence: ['signed order page', 'proof of the alleged violation', 'timeline of compliance attempts', 'messages about notice or refusal', 'payment or exchange records'],
    counterarguments: ['order term is ambiguous', 'no willful violation', 'impossibility or inability to comply', 'insufficient notice', 'later order changed the term'],
    courtSafeResponseDrafts: {
      neutral: 'I disagree that I violated the order. I want to keep the response tied to the written order, the dates, and the proof of what actually happened.',
      firmer: 'Please identify the exact provision and date you are relying on. I will address that provision and the documented facts in court-appropriate language.',
    },
    proSeRiskLevel: 'high',
    filingReadinessRequirements: ['exact order provision', 'alleged violation dates', 'ability-to-comply facts', 'notice/service facts', 'requested sanctions'],
  },
  {
    id: 'modification_temporary_orders',
    label: 'Modification and temporary orders',
    summary: 'Modification and temporary-order issues require the existing order, the requested change, current child facts, and any temporary hearing deadlines.',
    intentTriggers: ['modify', 'modification', 'temporary orders', 'temporary order hearing', 'change custody'],
    triggerPatterns: [
      /\b(modif(?:y|ication)|temporary orders?|temporary order hearing|change (?:custody|possession|support|conservatorship))\b/i,
    ],
    documentRetrievalBuckets: [
      {
        bucket: 'controlling_specific_clause',
        purpose: 'Find the current term the requested modification would change.',
        queries: ['conservatorship', 'possession schedule', 'child support', 'exclusive right', 'current order'],
      },
      {
        bucket: 'competing_general_clause',
        purpose: 'Find general best-interest or temporary-order provisions.',
        queries: ['best interest', 'temporary orders', 'status quo', 'material and substantial change'],
      },
      {
        bucket: 'later_modification_language',
        purpose: 'Identify whether a newer order already controls.',
        queries: ['amended order', 'modified by', 'supersedes', 'temporary order expires'],
      },
    ],
    orderHierarchy: ['current final order', 'later modification', 'temporary order', 'requested temporary relief', 'proposed order'],
    statutoryAndLocalRuleTargets: ['state modification statute', 'temporary-orders rule', 'local hearing notice rule', 'standing order'],
    requiredEvidence: ['current order', 'requested changes', 'child-impact facts', 'school/medical records if relevant', 'messages showing the disputed change'],
    counterarguments: ['no material change', 'requested relief is too broad', 'temporary relief disrupts status quo', 'facts are stale or unsupported'],
    courtSafeResponseDrafts: {
      neutral: 'I do not agree to a change until the current order, the requested relief, and the child-specific facts are reviewed.',
    },
    proSeRiskLevel: 'high',
    filingReadinessRequirements: ['current order', 'requested modification', 'temporary relief requested', 'child-specific facts', 'hearing date'],
  },
  {
    id: 'child_support_arrears',
    label: 'Child support, payments, and arrears',
    summary: 'Support issues require the payment order, payment history, arrears claim, income or calculation facts, and official payment records where available.',
    intentTriggers: ['child support', 'arrears', 'unpaid support', 'payment history', 'income withholding'],
    triggerPatterns: [
      /\b(child support|arrears|unpaid support|payment history|income withholding|medical support|dental support)\b/i,
    ],
    documentRetrievalBuckets: [
      {
        bucket: 'controlling_specific_clause',
        purpose: 'Find the payment amount, due date, payee, and payment method.',
        queries: ['child support', 'monthly support', 'due on', 'medical support', 'dental support', 'income withholding'],
      },
      {
        bucket: 'definition_language',
        purpose: 'Find definitions for net resources, unreimbursed expenses, or payment channels.',
        queries: ['net resources', 'unreimbursed medical', 'state disbursement unit', 'payment registry'],
      },
      {
        bucket: 'later_modification_language',
        purpose: 'Check whether support was modified or terminated.',
        queries: ['modified support', 'support obligation terminates', 'amended support order', 'arrears judgment'],
      },
    ],
    orderHierarchy: ['current support order', 'wage withholding order', 'payment registry', 'arrears judgment', 'later modification'],
    statutoryAndLocalRuleTargets: ['state child-support guidelines', 'payment registry rules', 'income withholding rules', 'medical-support statute'],
    requiredEvidence: ['support order', 'official payment record', 'receipts', 'income records when calculation is disputed', 'arrears worksheet'],
    counterarguments: ['payments were made through another traceable method', 'arrears amount is unsupported', 'order was modified', 'calculation uses wrong income or period'],
    courtSafeResponseDrafts: {
      neutral: 'I want to compare the support order against the official payment record before agreeing to any arrears number.',
    },
    proSeRiskLevel: 'medium',
    filingReadinessRequirements: ['support amount', 'payment due dates', 'payment ledger', 'claimed arrears period', 'calculation method'],
  },
  {
    id: 'school_medical_decision_authority',
    label: 'School and medical decision-making authority',
    summary: 'Decision-authority disputes require the exact rights clause, notice/consent duties, records, and whether the order grants exclusive or joint authority.',
    intentTriggers: ['school enrollment', 'medical decision', 'doctor', 'therapy', 'exclusive right'],
    triggerPatterns: [
      /\b(school|enroll|education|medical|doctor|therapy|counseling|decision[-\s]?making|exclusive right|joint managing conservator)\b/i,
    ],
    documentRetrievalBuckets: [
      {
        bucket: 'controlling_specific_clause',
        purpose: 'Find the exact decision-making right.',
        queries: ['exclusive right', 'right to make educational decisions', 'medical decisions', 'psychological treatment', 'school enrollment'],
      },
      {
        bucket: 'competing_general_clause',
        purpose: 'Find consultation, notice, and information-sharing duties.',
        queries: ['confer with the other parent', 'consultation', 'notice', 'access to records', 'consent'],
      },
      {
        bucket: 'exception_priority_language',
        purpose: 'Find emergency or tie-breaker language.',
        queries: ['emergency medical', 'unless emergency', 'tie breaker', 'independent right'],
      },
    ],
    orderHierarchy: ['specific rights clause', 'notice/consultation clause', 'emergency exception', 'school or medical record', 'later modification'],
    statutoryAndLocalRuleTargets: ['state conservatorship statute', 'education record access rule', 'medical consent statute', 'local temporary-order rule'],
    requiredEvidence: ['rights and duties pages', 'school or medical record', 'notice sent or received', 'provider communications', 'child-impact facts'],
    counterarguments: ['right is joint rather than exclusive', 'notice was not provided', 'emergency exception applies', 'decision exceeds the order language'],
    courtSafeResponseDrafts: {
      neutral: 'I want to follow the decision-making language in the order. Please identify the provision you believe allows this decision without agreement.',
    },
    proSeRiskLevel: 'medium',
    filingReadinessRequirements: ['decision-right clause', 'notice/consent history', 'records supporting the request', 'child-impact facts'],
  },
  {
    id: 'exchange_location_time',
    label: 'Exchange location and exchange time',
    summary: 'Exchange disputes turn on the possession schedule, exact pickup/drop-off terms, exceptions, and proof of attempted compliance.',
    intentTriggers: ['exchange', 'pickup', 'drop off', 'late', 'wrong location'],
    triggerPatterns: [
      /\b(exchange|pickup|pick up|drop[-\s]?off|surrender the child|return the child|wrong location|police department)\b/i,
      /\blate\s+(?:for|to)\s+(?:pickup|pick up|drop[-\s]?off|exchange|visitation|possession)\b/i,
      /\b(?:pickup|pick up|drop[-\s]?off|exchange|visitation|possession)\b.{0,40}\blate\b/i,
    ],
    documentRetrievalBuckets: [
      {
        bucket: 'controlling_specific_clause',
        purpose: 'Find the exact exchange time and location.',
        queries: ['exchange', 'pickup', 'drop off', 'surrender the child', 'return the child', 'location'],
      },
      {
        bucket: 'exception_priority_language',
        purpose: 'Find holiday, school, or safety exceptions.',
        queries: ['school holiday', 'holiday schedule', 'safe exchange', 'police department', 'unless otherwise agreed'],
      },
      {
        bucket: 'definition_language',
        purpose: 'Find definitions for school, weekend, or holiday timing.',
        queries: ['school', 'student holiday', 'weekend', 'starts at', 'ends at'],
      },
    ],
    orderHierarchy: ['specific exchange clause', 'holiday or school exception', 'mutual written agreement clause', 'later modification', 'messages showing agreement'],
    statutoryAndLocalRuleTargets: ['state possession standard', 'local exchange safety order', 'standing order', 'enforcement procedure'],
    requiredEvidence: ['order exchange clause', 'message thread', 'location/time proof', 'calendar record', 'attempted-compliance proof'],
    counterarguments: ['temporary agreement changed the location', 'late arrival was reasonable or documented', 'holiday exception controls', 'safety concern justified alternate exchange'],
    courtSafeResponseDrafts: {
      neutral: 'I will follow the exchange time and location stated in the order unless we both agree in writing to a different arrangement.',
      firmer: 'Please keep this focused on the order. I will be at the ordered exchange location at the ordered time unless there is a written agreement otherwise.',
    },
    proSeRiskLevel: 'medium',
    filingReadinessRequirements: ['exchange clause', 'disputed exchange dates', 'location/time proof', 'message thread', 'requested remedy'],
  },
  {
    id: 'relocation_travel_passports',
    label: 'Relocation, travel, and passports',
    summary: 'Travel and relocation issues need geographic restrictions, notice duties, passport authority, travel dates, and child-return safeguards.',
    intentTriggers: ['relocation', 'move away', 'passport', 'travel', 'vacation notice'],
    triggerPatterns: [
      /\b(relocat(?:e|ion)|move away|move out of|geographic restriction|passport|travel|vacation|international|flight|itinerary)\b/i,
    ],
    documentRetrievalBuckets: [
      {
        bucket: 'controlling_specific_clause',
        purpose: 'Find geographic restriction, travel notice, and passport terms.',
        queries: ['geographic restriction', 'passport', 'travel', 'itinerary', 'notice of travel', 'international travel'],
      },
      {
        bucket: 'exception_priority_language',
        purpose: 'Find consent, notice, or emergency exceptions.',
        queries: ['written consent', 'advance notice', 'unless agreed', 'emergency travel', 'return the child'],
      },
      {
        bucket: 'later_modification_language',
        purpose: 'Check whether the restriction was modified.',
        queries: ['restriction modified', 'geographic restriction lifted', 'amended order', 'temporary travel order'],
      },
    ],
    orderHierarchy: ['geographic restriction', 'passport/travel clause', 'notice and consent clause', 'temporary travel order', 'later modification'],
    statutoryAndLocalRuleTargets: ['state relocation statute', 'passport restriction rule', 'local temporary injunction', 'international travel form instructions'],
    requiredEvidence: ['travel notice', 'itinerary', 'passport possession proof', 'messages about consent', 'child-return plan'],
    counterarguments: ['required notice was not given', 'travel exceeds allowed area', 'consent was not written', 'return date or itinerary is missing'],
    courtSafeResponseDrafts: {
      neutral: 'Before agreeing to travel or relocation, I need to compare the request to the order, including notice, consent, itinerary, and return-date requirements.',
    },
    proSeRiskLevel: 'high',
    filingReadinessRequirements: ['geographic restriction', 'travel dates', 'passport status', 'notice/consent proof', 'return plan'],
  },
  {
    id: 'communication_notice',
    label: 'Communication platform and notice provisions',
    summary: 'Communication disputes require the ordered platform, notice method, response timing, prohibited conduct language, and the complete thread.',
    intentTriggers: ['AppClose', 'OurFamilyWizard', 'email notice', 'communication provision', 'notice'],
    triggerPatterns: [
      /\b(appclose|ourfamilywizard|talkingparents|co[-\s]?parent app|communication platform|notice|email notice|text message|message thread)\b/i,
    ],
    documentRetrievalBuckets: [
      {
        bucket: 'controlling_specific_clause',
        purpose: 'Find the required communication method.',
        queries: ['AppClose', 'OurFamilyWizard', 'communication', 'notice', 'email', 'text message', 'parenting app'],
      },
      {
        bucket: 'competing_general_clause',
        purpose: 'Find general civility or information-sharing language.',
        queries: ['civil communication', 'reasonable notice', 'keep informed', 'non-emergency communication'],
      },
      {
        bucket: 'definition_language',
        purpose: 'Find what counts as written notice.',
        queries: ['written notice', 'electronic service', 'email', 'deemed received', 'notice is effective'],
      },
    ],
    orderHierarchy: ['specific platform clause', 'notice method clause', 'emergency exception', 'complete message thread', 'later agreement in writing'],
    statutoryAndLocalRuleTargets: ['state notice rule', 'local parenting-app order', 'electronic service rule', 'standing order communication provision'],
    requiredEvidence: ['complete thread', 'sent and received timestamps', 'ordered platform clause', 'screenshots or export', 'any response deadline'],
    counterarguments: ['notice was sent through the wrong channel', 'thread is incomplete', 'message was not received', 'tone distracts from the legal issue'],
    courtSafeResponseDrafts: {
      neutral: 'I am keeping communication on the ordered platform and focused on the child, the order, and the logistics that need a response.',
    },
    proSeRiskLevel: 'low',
    filingReadinessRequirements: ['ordered communication method', 'complete thread', 'notice timestamp', 'requested response or relief'],
  },
  {
    id: 'protective_order_family_violence',
    label: 'Protective-order and family-violence overlap',
    summary: 'Protective-order overlap requires safety triage, alleged conduct, existing orders, contact restrictions, hearing details, and service status.',
    intentTriggers: ['protective order', 'family violence', 'stalking', 'threatened to hurt', 'no contact'],
    triggerPatterns: [
      /\b(protective order|restraining order|family violence|domestic violence|stalking|no contact|threaten(?:ed|ing)? to (?:hurt|harm|kill)|strangl(?:e|ed|ation)|weapon)\b/i,
    ],
    documentRetrievalBuckets: [
      {
        bucket: 'controlling_specific_clause',
        purpose: 'Find protective, no-contact, possession, or exchange restrictions.',
        queries: ['protective order', 'no contact', 'stay away', 'family violence', 'supervised exchange', 'temporary ex parte'],
      },
      {
        bucket: 'exception_priority_language',
        purpose: 'Find exceptions for child exchanges or emergency contact.',
        queries: ['except for child exchange', 'through third party', 'law enforcement', 'emergency contact'],
      },
      {
        bucket: 'later_modification_language',
        purpose: 'Check whether a later family or protective order changed contact rules.',
        queries: ['protective order supersedes', 'modified protective order', 'temporary ex parte expires', 'later order'],
      },
    ],
    orderHierarchy: ['active protective order', 'temporary ex parte order', 'family court order', 'exchange/contact exception', 'later modification'],
    statutoryAndLocalRuleTargets: ['state protective-order statute', 'family-violence finding statute', 'local protective-order hearing rule', 'service rule'],
    requiredEvidence: ['safety incident timeline', 'messages/threats', 'police or medical records if available', 'existing order', 'hearing/service notice'],
    counterarguments: ['allegations are unsupported', 'contact exception applies', 'order expired or was modified', 'service or notice is disputed'],
    courtSafeResponseDrafts: {
      neutral: 'I am not going to argue about labels. I am going to document the conduct, preserve the messages, and follow any active court order.',
    },
    proSeRiskLevel: 'critical',
    filingReadinessRequirements: ['immediate safety status', 'active protective order status', 'incident dates', 'contact restrictions', 'hearing/service details'],
  },
  {
    id: 'fee_waiver_cost_access',
    label: 'Fee waivers and inability-to-afford forms',
    summary: 'Fee-waiver issues need county/state, official fee source, income/benefits facts, and the required inability-to-afford form.',
    intentTriggers: ['fee waiver', 'cannot afford', 'filing fee', 'inability to afford', 'legal aid'],
    triggerPatterns: [
      /\b(fee waiver|waive fees?|inability to afford|can'?t afford|cannot afford|filing fee|court costs?|legal aid|law library)\b/i,
    ],
    documentRetrievalBuckets: [
      {
        bucket: 'definition_language',
        purpose: 'Find fee-waiver or cost language in forms and notices.',
        queries: ['statement of inability to afford', 'fee waiver', 'court costs', 'filing fee', 'pauper affidavit'],
      },
      {
        bucket: 'controlling_specific_clause',
        purpose: 'Find filing or service-fee requirements in the court packet.',
        queries: ['filing fee', 'service fee', 'clerk', 'e-filing', 'costs taxed'],
      },
      {
        bucket: 'competing_general_clause',
        purpose: 'Find local filing, service, or e-filing instructions.',
        queries: ['local rule', 'e-file', 'clerk instructions', 'self help forms', 'official form'],
      },
    ],
    orderHierarchy: ['official fee schedule', 'fee-waiver form instruction', 'local e-filing rule', 'service-fee rule', 'court order on costs'],
    statutoryAndLocalRuleTargets: ['state fee-waiver rule', 'official county fee schedule', 'e-filing rule', 'legal-aid intake rules'],
    requiredEvidence: ['county and state', 'income/benefits facts', 'official form', 'filing type', 'service method'],
    counterarguments: ['fee source is outdated', 'form is county-specific', 'service fee is separate from filing fee', 'income facts are incomplete'],
    courtSafeResponseDrafts: {
      neutral: 'Before estimating costs, I would verify the official county fee schedule and whether an inability-to-afford form applies.',
    },
    proSeRiskLevel: 'low',
    filingReadinessRequirements: ['state', 'county', 'filing type', 'fee-waiver need', 'income/benefits facts', 'official form'],
  },
  {
    id: 'discovery_subpoena_evidence',
    label: 'Discovery, subpoenas, and evidence requests',
    summary: 'Discovery issues require the request, response deadline, objection grounds, production format, and whether subpoenas need court or local-rule compliance.',
    intentTriggers: ['discovery', 'subpoena', 'request for production', 'interrogatories', 'evidence request'],
    triggerPatterns: [
      /\b(discovery|subpoenas?|request for production|interrogator(?:y|ies)|request for admission|produce documents|evidence request|deposition)\b/i,
    ],
    documentRetrievalBuckets: [
      {
        bucket: 'controlling_specific_clause',
        purpose: 'Find the specific discovery request or subpoena command.',
        queries: ['request for production', 'interrogatories', 'request for admission', 'subpoena', 'produce documents'],
      },
      {
        bucket: 'exception_priority_language',
        purpose: 'Find deadlines, objections, protective limits, or privilege language.',
        queries: ['objection', 'privilege', 'protective order', 'deadline', 'within 30 days', 'unduly burdensome'],
      },
      {
        bucket: 'definition_language',
        purpose: 'Find definitions and instructions for production.',
        queries: ['definitions', 'instructions', 'electronically stored information', 'responsive documents'],
      },
    ],
    orderHierarchy: ['discovery request or subpoena', 'court scheduling order', 'protective order', 'local discovery rule', 'privilege or objection grounds'],
    statutoryAndLocalRuleTargets: ['state discovery rule', 'subpoena rule', 'local standing discovery order', 'protective-order rule'],
    requiredEvidence: ['complete request or subpoena', 'service date', 'response deadline', 'documents requested', 'privacy/privilege concerns'],
    counterarguments: ['request is overbroad', 'deadline was not triggered by service', 'privilege/privacy applies', 'records are not in possession or control'],
    courtSafeResponseDrafts: {
      neutral: 'I need to review the exact request, service date, deadline, and any objection grounds before producing or objecting.',
    },
    proSeRiskLevel: 'high',
    filingReadinessRequirements: ['complete discovery request', 'service date', 'response deadline', 'objection grounds', 'production plan'],
  },
];

export const FAMILY_LAW_ISSUE_PACK_IDS = FAMILY_LAW_ISSUE_PACKS.map((pack) => pack.id);

export function getFamilyLawIssuePacksByIds(ids: FamilyLawIssuePackId[]) {
  const idSet = new Set(ids);
  return FAMILY_LAW_ISSUE_PACKS.filter((pack) => idSet.has(pack.id));
}

export function detectFamilyLawIssuePackIds(...parts: Array<string | null | undefined>): FamilyLawIssuePackId[] {
  const text = parts.filter(Boolean).join('\n');
  if (!text.trim()) return [];

  return FAMILY_LAW_ISSUE_PACKS
    .filter((pack) => pack.triggerPatterns.some((pattern) => pattern.test(text)))
    .map((pack) => pack.id);
}

export function detectedFamilyLawIssuePacks(...parts: Array<string | null | undefined>) {
  return getFamilyLawIssuePacksByIds(detectFamilyLawIssuePackIds(...parts));
}

export function priorityForIssuePack(pack: FamilyLawIssuePack): 'urgent' | 'high' | 'medium' | 'later' {
  if (pack.proSeRiskLevel === 'critical') return 'urgent';
  if (pack.proSeRiskLevel === 'high') return 'high';
  if (pack.proSeRiskLevel === 'medium') return 'medium';
  return 'later';
}
