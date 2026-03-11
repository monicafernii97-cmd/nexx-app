/**
 * Legal Document Template Library
 *
 * Comprehensive library of family law document templates organized by category.
 * Each template defines the structure (sections) — formatting comes from courtRules.ts.
 *
 * Based on nationwide family law practice with Texas as the primary reference.
 */

import type { DocumentTemplate, DocumentSection } from './types';

// ── Reusable section builders ─────────────────────────────────

const caption: DocumentSection = {
  id: 'caption', type: 'caption', required: true,
  guidance: 'Auto-populated from user profile: cause number, party names, court, county, state.',
};

/** Builds a title section definition for a document template. */
const title = (label: string): DocumentSection => ({
  id: 'title', type: 'title', title: label, required: true,
  guidance: 'Bold, ALL CAPS, centered. Auto-generated from template.',
});

const courtAddress: DocumentSection = {
  id: 'court-address', type: 'court_address', required: true,
  guidance: 'TO THE HONORABLE JUDGE OF SAID COURT:',
};

const introduction: DocumentSection = {
  id: 'intro', type: 'introduction', required: true,
  guidance: 'Opening paragraph identifying the filer and the purpose of the document.',
};

const bodySections: DocumentSection = {
  id: 'body', type: 'body_sections', required: true,
  guidance: 'Organized with Roman numeral headings: I. Background, II. Argument, III. Request for Relief.',
};

const bodyNumbered: DocumentSection = {
  id: 'body-numbered', type: 'body_numbered', required: true,
  guidance: 'Numbered paragraphs (1., 2., 3., ...) each containing one fact or statement.',
};

const prayer: DocumentSection = {
  id: 'prayer', type: 'prayer_for_relief', required: true,
  guidance: 'WHEREFORE, PREMISES CONSIDERED, [Party] respectfully requests that the Court...',
};

const signatureBlock: DocumentSection = {
  id: 'signature', type: 'signature_block', required: true,
  guidance: 'Respectfully submitted, name, role, address, phone, email.',
};

const certificateOfService: DocumentSection = {
  id: 'cos', type: 'certificate_of_service', required: true,
  guidance: 'CERTIFICATE OF SERVICE — certify true and correct copy served via e-filing.',
};

const verification: DocumentSection = {
  id: 'verification', type: 'verification', required: false,
};

const judgeSignature: DocumentSection = {
  id: 'judge-sig', type: 'judge_signature', required: true,
  guidance: 'SIGNED on this ___ day of ______, 20__. _______ JUDGE PRESIDING',
};

const approvalLine: DocumentSection = {
  id: 'approval', type: 'approval_line', required: false,
  guidance: 'APPROVED AS TO FORM ONLY: /s/ [name]',
};

const notaryBlock: DocumentSection = {
  id: 'notary', type: 'notary_block', required: false,
  guidance: 'SWORN TO AND SUBSCRIBED before me...',
};

const hrule: DocumentSection = {
  id: 'hrule', type: 'horizontal_rule', required: true,
};

// ── Standard motion section set ───────────────────────────────
/** Builds the standard section set for motions (caption → title → address → intro → body → prayer → sig → COS). */
const standardMotionSections = (titleText: string): DocumentSection[] => [
  caption,
  title(titleText),
  courtAddress,
  introduction,
  bodySections,
  prayer,
  signatureBlock,
  certificateOfService,
];

// ── Standard response section set ─────────────────────────────
/** Builds the standard section set for responses/answers (same as motion sections). */
const standardResponseSections = (titleText: string): DocumentSection[] => [
  caption,
  title(titleText),
  courtAddress,
  introduction,
  bodySections,
  prayer,
  signatureBlock,
  certificateOfService,
];

// ── Standard order section set ────────────────────────────────
/** Builds the standard section set for proposed orders (caption → title → intro → body → judge sig → approval). */
const standardOrderSections = (titleText: string): DocumentSection[] => [
  caption,
  title(titleText),
  introduction,
  bodySections,
  judgeSignature,
  approvalLine,
];


// ═══════════════════════════════════════════════════════════════
// 1. PRIMARY CASE-STARTING DOCUMENTS (PETITIONS)
// ═══════════════════════════════════════════════════════════════

const petitions: DocumentTemplate[] = [
  {
    id: 'petition-divorce-children',
    title: 'Original Petition for Divorce (With Children)',
    category: 'petition',
    caseTypes: ['divorce_with_children'],
    description: 'Initiates a divorce proceeding when minor children are involved.',
    sections: standardMotionSections('ORIGINAL PETITION FOR DIVORCE'),
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: true,
    stateVariants: { 'California': 'Petition for Dissolution of Marriage', 'New York': 'Complaint for Divorce' },
  },
  {
    id: 'petition-divorce-no-children',
    title: 'Original Petition for Divorce (Without Children)',
    category: 'petition',
    caseTypes: ['divorce_without_children'],
    description: 'Initiates a divorce proceeding with no minor children.',
    sections: standardMotionSections('ORIGINAL PETITION FOR DIVORCE'),
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: true,
    stateVariants: { 'California': 'Petition for Dissolution of Marriage' },
  },
  {
    id: 'petition-establish-parentage',
    title: 'Petition to Establish Parent-Child Relationship',
    category: 'petition',
    caseTypes: ['paternity', 'custody_establishment'],
    description: 'Establishes legal parentage and requests custody/support orders.',
    sections: standardMotionSections('PETITION TO ESTABLISH PARENT-CHILD RELATIONSHIP'),
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'petition-modify-pcr',
    title: 'Petition to Modify Parent-Child Relationship',
    category: 'petition',
    caseTypes: ['custody_modification', 'sapcr'],
    description: 'Requests modification of an existing custody, visitation, or support order.',
    sections: standardMotionSections('PETITION TO MODIFY PARENT-CHILD RELATIONSHIP'),
    requiresDeclaration: true,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'petition-custody',
    title: 'Petition for Custody',
    category: 'petition',
    caseTypes: ['custody_establishment'],
    description: 'Requests the court to establish custody arrangements.',
    sections: standardMotionSections('PETITION FOR CUSTODY'),
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'petition-child-support',
    title: 'Petition for Child Support',
    category: 'petition',
    caseTypes: ['child_support'],
    description: 'Requests the court to establish child support obligations.',
    sections: standardMotionSections('PETITION FOR CHILD SUPPORT'),
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'petition-protective-order',
    title: 'Petition for Protective Order',
    category: 'petition',
    caseTypes: ['protective_order'],
    description: 'Requests a protective order to prevent family violence or harassment.',
    sections: standardMotionSections('APPLICATION FOR PROTECTIVE ORDER'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'petition-enforcement',
    title: 'Petition for Enforcement of Court Order',
    category: 'petition',
    caseTypes: ['enforcement'],
    description: 'Requests the court to enforce an existing court order.',
    sections: standardMotionSections('MOTION FOR ENFORCEMENT'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'petition-modify-child-support',
    title: 'Petition to Modify Child Support',
    category: 'petition',
    caseTypes: ['child_support_modification'],
    description: 'Requests modification of an existing child support order.',
    sections: standardMotionSections('PETITION TO MODIFY CHILD SUPPORT'),
    requiresDeclaration: true,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'petition-relocate',
    title: 'Petition to Relocate with Child',
    category: 'petition',
    caseTypes: ['relocation'],
    description: 'Requests court permission to relocate with a minor child.',
    sections: standardMotionSections('PETITION TO RELOCATE WITH CHILD'),
    requiresDeclaration: true,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'petition-terminate-parental-rights',
    title: 'Petition to Terminate Parental Rights',
    category: 'petition',
    caseTypes: ['termination'],
    description: 'Requests the court to terminate parental rights.',
    sections: standardMotionSections('PETITION TO TERMINATE PARENTAL RIGHTS'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
];


// ═══════════════════════════════════════════════════════════════
// 2. MOTIONS — Temporary & Immediate Relief
// ═══════════════════════════════════════════════════════════════

const motionsTemporary: DocumentTemplate[] = [
  {
    id: 'motion-temporary-orders',
    title: 'Motion for Temporary Orders',
    category: 'motion_temporary',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr'],
    description: 'Requests temporary orders pending final resolution.',
    sections: standardMotionSections("PETITIONER'S MOTION FOR TEMPORARY ORDERS"),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-emergency-temporary-orders',
    title: 'Emergency Motion for Temporary Orders',
    category: 'motion_temporary',
    caseTypes: ['divorce_with_children', 'custody_modification', 'sapcr', 'protective_order'],
    description: 'Emergency request for immediate temporary orders without standard notice.',
    sections: standardMotionSections('EMERGENCY MOTION FOR TEMPORARY ORDERS'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-temporary-custody',
    title: 'Motion for Temporary Custody',
    category: 'motion_temporary',
    caseTypes: ['divorce_with_children', 'custody_establishment', 'custody_modification'],
    description: 'Requests temporary custody pending final hearing.',
    sections: standardMotionSections('MOTION FOR TEMPORARY CUSTODY'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-temporary-child-support',
    title: 'Motion for Temporary Child Support',
    category: 'motion_temporary',
    caseTypes: ['divorce_with_children', 'child_support', 'sapcr'],
    description: 'Requests temporary child support pending final order.',
    sections: standardMotionSections('MOTION FOR TEMPORARY CHILD SUPPORT'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-tro',
    title: 'Motion for Temporary Restraining Order',
    category: 'motion_temporary',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'protective_order'],
    description: 'Requests TRO to prevent specific conduct by the opposing party.',
    sections: standardMotionSections('MOTION FOR TEMPORARY RESTRAINING ORDER'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
];


// ═══════════════════════════════════════════════════════════════
// 3. MOTIONS — Case Procedure
// ═══════════════════════════════════════════════════════════════

const motionsProcedure: DocumentTemplate[] = [
  {
    id: 'motion-continuance',
    title: 'Motion for Continuance',
    category: 'motion_procedure',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'enforcement', 'child_support', 'other'],
    description: 'Requests the court to postpone a scheduled hearing or trial.',
    sections: standardMotionSections('MOTION FOR CONTINUANCE'),
    requiresDeclaration: false,
    requiresProposedOrder: true,
    supportsExhibits: false,
  },
  {
    id: 'motion-set-hearing',
    title: 'Motion to Set Hearing',
    category: 'motion_procedure',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'enforcement', 'other'],
    description: 'Requests the court to schedule a hearing.',
    sections: standardMotionSections('MOTION TO SET HEARING'),
    requiresDeclaration: false,
    requiresProposedOrder: true,
    supportsExhibits: false,
  },
  {
    id: 'motion-dismiss',
    title: 'Motion to Dismiss',
    category: 'motion_procedure',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'enforcement', 'other'],
    description: 'Requests the court to dismiss a case or claim.',
    sections: standardMotionSections('MOTION TO DISMISS'),
    requiresDeclaration: false,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-strike',
    title: 'Motion to Strike',
    category: 'motion_procedure',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'other'],
    description: 'Requests the court to strike specific pleadings or evidence.',
    sections: standardMotionSections('MOTION TO STRIKE'),
    requiresDeclaration: false,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-amend',
    title: 'Motion for Leave to Amend Pleadings',
    category: 'motion_procedure',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'other'],
    description: 'Requests permission to file amended pleadings.',
    sections: standardMotionSections('MOTION FOR LEAVE TO AMEND'),
    requiresDeclaration: false,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-transfer-venue',
    title: 'Motion to Transfer Venue',
    category: 'motion_procedure',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'other'],
    description: 'Requests the case be transferred to a different county or court.',
    sections: standardMotionSections('MOTION TO TRANSFER VENUE'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
];


// ═══════════════════════════════════════════════════════════════
// 4. MOTIONS — Custody & Parenting
// ═══════════════════════════════════════════════════════════════

const motionsCustody: DocumentTemplate[] = [
  {
    id: 'motion-modify-custody',
    title: 'Motion to Modify Custody',
    category: 'motion_custody',
    caseTypes: ['custody_modification', 'sapcr'],
    description: 'Requests modification of existing custody or conservatorship order.',
    sections: standardMotionSections('MOTION TO MODIFY CUSTODY'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-modify-visitation',
    title: 'Motion to Modify Visitation / Parenting Time',
    category: 'motion_custody',
    caseTypes: ['custody_modification', 'sapcr', 'visitation'],
    description: 'Requests modification of visitation or possession schedule.',
    sections: standardMotionSections('MOTION TO MODIFY POSSESSION AND ACCESS'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-restrict-travel',
    title: 'Motion to Restrict Travel with Child',
    category: 'motion_custody',
    caseTypes: ['custody_modification', 'sapcr', 'divorce_with_children'],
    description: 'Requests restrictions on travel with the child, especially international travel.',
    sections: standardMotionSections('MOTION TO RESTRICT TRAVEL WITH CHILD'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-require-mediation',
    title: 'Motion to Compel Mediation',
    category: 'motion_custody',
    caseTypes: ['custody_modification', 'sapcr', 'divorce_with_children', 'divorce_without_children'],
    description: 'Requests the court to order parties to mediation.',
    sections: standardMotionSections('MOTION TO COMPEL MEDIATION'),
    requiresDeclaration: false,
    requiresProposedOrder: true,
    supportsExhibits: false,
  },
  {
    id: 'motion-modify-child-support',
    title: 'Motion to Modify Child Support',
    category: 'motion_custody',
    caseTypes: ['child_support_modification', 'sapcr'],
    description: 'Requests modification of existing child support obligations.',
    sections: standardMotionSections('MOTION TO MODIFY CHILD SUPPORT'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
];


// ═══════════════════════════════════════════════════════════════
// 5. MOTIONS — Enforcement
// ═══════════════════════════════════════════════════════════════

const motionsEnforcement: DocumentTemplate[] = [
  {
    id: 'motion-enforcement',
    title: 'Motion for Enforcement',
    category: 'motion_enforcement',
    caseTypes: ['enforcement', 'sapcr', 'custody_modification'],
    description: 'Requests the court to enforce a prior court order.',
    sections: standardMotionSections('MOTION FOR ENFORCEMENT'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-contempt',
    title: 'Motion for Contempt',
    category: 'motion_enforcement',
    caseTypes: ['enforcement', 'sapcr', 'custody_modification'],
    description: 'Requests a finding of contempt for violation of a court order.',
    sections: standardMotionSections('MOTION FOR CONTEMPT'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-sanctions',
    title: 'Motion for Sanctions',
    category: 'motion_enforcement',
    caseTypes: ['enforcement', 'sapcr', 'custody_modification', 'other'],
    description: 'Requests monetary or other sanctions for bad-faith conduct.',
    sections: standardMotionSections('MOTION FOR SANCTIONS'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
];


// ═══════════════════════════════════════════════════════════════
// 6. MOTIONS — Discovery
// ═══════════════════════════════════════════════════════════════

const motionsDiscovery: DocumentTemplate[] = [
  {
    id: 'motion-compel-discovery',
    title: 'Motion to Compel Discovery',
    category: 'motion_discovery',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'other'],
    description: 'Requests the court to order the opposing party to respond to discovery.',
    sections: standardMotionSections('MOTION TO COMPEL DISCOVERY'),
    requiresDeclaration: false,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
  {
    id: 'motion-in-limine',
    title: 'Motion in Limine',
    category: 'motion_discovery',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'other'],
    description: 'Pre-trial motion to exclude certain evidence from being presented.',
    sections: standardMotionSections('MOTION IN LIMINE'),
    requiresDeclaration: false,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
];


// ═══════════════════════════════════════════════════════════════
// 7. RESPONSES
// ═══════════════════════════════════════════════════════════════

const responses: DocumentTemplate[] = [
  {
    id: 'response-petition',
    title: 'Response to Petition / Answer',
    category: 'response',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'child_support', 'other'],
    description: 'Formal response to an original petition or complaint.',
    sections: standardResponseSections('ORIGINAL ANSWER'),
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: true,
    stateVariants: { 'California': 'Response to Petition', 'New York': 'Answer' },
  },
  {
    id: 'response-motion-temporary-orders',
    title: 'Response to Motion for Temporary Orders',
    category: 'response',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr'],
    description: 'Responds to a motion for temporary orders.',
    sections: standardResponseSections("RESPONDENT'S RESPONSE TO MOTION FOR TEMPORARY ORDERS"),
    requiresDeclaration: true,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'response-motion-continuance',
    title: 'Response to Motion for Continuance',
    category: 'response',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'enforcement', 'other'],
    description: 'Responds to a motion requesting postponement of a hearing.',
    sections: standardResponseSections("PETITIONER'S RESPONSE TO RESPONDENT'S MOTION FOR CONTINUANCE"),
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'response-motion-dismiss',
    title: 'Response to Motion to Dismiss',
    category: 'response',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'other'],
    description: 'Opposes a motion to dismiss the case.',
    sections: standardResponseSections('RESPONSE TO MOTION TO DISMISS'),
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'response-motion-enforcement',
    title: 'Response to Motion for Enforcement',
    category: 'response',
    caseTypes: ['enforcement', 'sapcr', 'custody_modification'],
    description: 'Responds to a motion seeking enforcement of a court order.',
    sections: standardResponseSections('RESPONSE TO MOTION FOR ENFORCEMENT'),
    requiresDeclaration: true,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'response-motion-contempt',
    title: 'Response to Motion for Contempt',
    category: 'response',
    caseTypes: ['enforcement', 'sapcr', 'custody_modification'],
    description: 'Responds to a motion alleging contempt of court.',
    sections: standardResponseSections('RESPONSE TO MOTION FOR CONTEMPT'),
    requiresDeclaration: true,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
];

// ═══════════════════════════════════════════════════════════════
// 8. COUNTER FILINGS
// ═══════════════════════════════════════════════════════════════

const counterFilings: DocumentTemplate[] = [
  {
    id: 'counter-petition-modify',
    title: 'Counter-Petition to Modify Parent-Child Relationship',
    category: 'counter_filing',
    caseTypes: ['custody_modification', 'sapcr'],
    description: 'Counter-petition asserting own modification claims.',
    sections: standardMotionSections('COUNTER-PETITION TO MODIFY PARENT-CHILD RELATIONSHIP'),
    requiresDeclaration: true,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'counter-petition-divorce',
    title: 'Counter-Petition for Divorce',
    category: 'counter_filing',
    caseTypes: ['divorce_with_children', 'divorce_without_children'],
    description: 'Files a counter-petition in response to a divorce petition.',
    sections: standardMotionSections('COUNTER-PETITION FOR DIVORCE'),
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'counter-motion-temporary-orders',
    title: 'Counter-Motion for Temporary Orders',
    category: 'counter_filing',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr'],
    description: 'Cross-motion requesting different temporary orders.',
    sections: standardMotionSections('COUNTER-MOTION FOR TEMPORARY ORDERS'),
    requiresDeclaration: true,
    requiresProposedOrder: true,
    supportsExhibits: true,
  },
];


// ═══════════════════════════════════════════════════════════════
// 9. NOTICES
// ═══════════════════════════════════════════════════════════════

const notices: DocumentTemplate[] = [
  {
    id: 'notice-hearing',
    title: 'Notice of Hearing',
    category: 'notice_hearing',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'enforcement', 'other'],
    description: 'Formal notice of a scheduled hearing to the opposing party.',
    sections: [caption, title('NOTICE OF HEARING'), courtAddress, bodyNumbered, signatureBlock, certificateOfService],
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: false,
  },
  {
    id: 'notice-filing',
    title: 'Notice of Filing',
    category: 'notice_filing',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'enforcement', 'other'],
    description: 'Notice that a document has been filed with the court.',
    sections: [caption, title('NOTICE OF FILING'), courtAddress, bodyNumbered, signatureBlock, certificateOfService],
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'notice-mediation',
    title: 'Notice of Mediation',
    category: 'notice_case_status',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr'],
    description: 'Notice that mediation has been scheduled.',
    sections: [caption, title('NOTICE OF MEDIATION'), courtAddress, bodyNumbered, signatureBlock, certificateOfService],
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: false,
  },
  {
    id: 'notice-nonsuit',
    title: 'Notice of Non-Suit',
    category: 'notice_case_status',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'other'],
    description: 'Notice of voluntary dismissal of claims.',
    sections: [caption, title('NOTICE OF NON-SUIT'), courtAddress, bodyNumbered, signatureBlock, certificateOfService],
    requiresDeclaration: false,
    requiresProposedOrder: true,
    supportsExhibits: false,
  },
  {
    id: 'notice-intent-relocate',
    title: 'Notice of Intent to Relocate',
    category: 'notice_parenting',
    caseTypes: ['custody_modification', 'sapcr', 'relocation'],
    description: 'Required notice of intent to relocate with a child.',
    sections: [caption, title('NOTICE OF INTENT TO RELOCATE'), courtAddress, bodyNumbered, signatureBlock, certificateOfService],
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: false,
  },
];


// ═══════════════════════════════════════════════════════════════
// 10. DECLARATIONS & AFFIDAVITS
// ═══════════════════════════════════════════════════════════════

const declarations: DocumentTemplate[] = [
  {
    id: 'unsworn-declaration',
    title: 'Unsworn Declaration',
    category: 'declaration',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'enforcement', 'other'],
    description: 'Unsworn declaration signed under penalty of perjury (TX Civ. Prac. & Rem. Code §132.001).',
    sections: [
      caption,
      title('UNSWORN DECLARATION OF [NAME]'),
      { id: 'intro', type: 'introduction', required: true, guidance: 'I, [Name], declare under penalty of perjury that the following statements are true and correct.' },
      bodyNumbered,
      { id: 'exhibit-auth', type: 'body_numbered', required: false, guidance: 'The attached exhibits are true and correct copies of the documents referenced herein.' },
      { id: 'perjury', type: 'body_numbered', required: true, guidance: 'I declare under penalty of perjury that the foregoing is true and correct. Executed on this ___ day of ______, 20__.' },
      signatureBlock,
    ],
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
  {
    id: 'sworn-affidavit',
    title: 'Sworn Affidavit',
    category: 'declaration',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'enforcement', 'other'],
    description: 'Sworn affidavit requiring notarization.',
    sections: [
      caption,
      title('AFFIDAVIT OF [NAME]'),
      { id: 'before-me', type: 'introduction', required: true, guidance: 'BEFORE ME, the undersigned authority, personally appeared [Name], who after being duly sworn, stated as follows:' },
      bodyNumbered,
      { id: 'further-affiant', type: 'body_numbered', required: true, guidance: 'Further affiant sayeth not.' },
      signatureBlock,
      notaryBlock,
    ],
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: true,
  },
];


// ═══════════════════════════════════════════════════════════════
// 11. PROPOSED ORDERS
// ═══════════════════════════════════════════════════════════════

const orders: DocumentTemplate[] = [
  {
    id: 'proposed-order-temporary',
    title: 'Proposed Temporary Orders',
    category: 'order',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr'],
    description: 'Proposed temporary orders for the court to sign.',
    sections: standardOrderSections('TEMPORARY ORDERS'),
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: false,
  },
  {
    id: 'proposed-order-continuance',
    title: 'Proposed Order on Motion for Continuance',
    category: 'order',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'enforcement', 'other'],
    description: 'Proposed order granting or denying a continuance.',
    sections: standardOrderSections('ORDER ON MOTION FOR CONTINUANCE'),
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: false,
  },
  {
    id: 'proposed-order-mediation',
    title: 'Proposed Order Referring to Mediation',
    category: 'order',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr'],
    description: 'Proposed order referring the parties to mediation.',
    sections: standardOrderSections('ORDER REFERRING CASE TO MEDIATION'),
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: false,
  },
];


// ═══════════════════════════════════════════════════════════════
// 12. CERTIFICATES
// ═══════════════════════════════════════════════════════════════

const certificates: DocumentTemplate[] = [
  {
    id: 'certificate-of-service',
    title: 'Certificate of Service (Standalone)',
    category: 'certificate',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'enforcement', 'other'],
    description: 'Standalone certificate of service for separate filing.',
    sections: [caption, title('CERTIFICATE OF SERVICE'), bodyNumbered, signatureBlock],
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: false,
  },
  {
    id: 'certificate-of-conference',
    title: 'Certificate of Conference',
    category: 'certificate',
    caseTypes: ['divorce_with_children', 'divorce_without_children', 'custody_modification', 'sapcr', 'other'],
    description: 'Certifies that the parties conferred before filing a motion.',
    sections: [caption, title('CERTIFICATE OF CONFERENCE'), bodyNumbered, signatureBlock],
    requiresDeclaration: false,
    requiresProposedOrder: false,
    supportsExhibits: false,
  },
];


// ═══════════════════════════════════════════════════════════════
// FULL TEMPLATE LIBRARY — Exported
// ═══════════════════════════════════════════════════════════════

export const TEMPLATE_LIBRARY: DocumentTemplate[] = [
  ...petitions,
  ...motionsTemporary,
  ...motionsProcedure,
  ...motionsCustody,
  ...motionsEnforcement,
  ...motionsDiscovery,
  ...responses,
  ...counterFilings,
  ...notices,
  ...declarations,
  ...orders,
  ...certificates,
];

/**
 * Get a template by its ID. Returns a deep copy to prevent shared-state mutation.
 */
export function getTemplate(id: string): DocumentTemplate | undefined {
  const template = TEMPLATE_LIBRARY.find(t => t.id === id);
  return template ? structuredClone(template) : undefined;
}

/**
 * Get templates filtered by category. Returns deep copies to prevent shared-state mutation.
 */
export function getTemplatesByCategory(category: string): DocumentTemplate[] {
  return TEMPLATE_LIBRARY
    .filter(t => t.category === category)
    .map(t => structuredClone(t));
}

/**
 * Get templates relevant to a specific case type. Returns deep copies to prevent shared-state mutation.
 */
export function getTemplatesForCaseType(caseType: string): DocumentTemplate[] {
  return TEMPLATE_LIBRARY
    .filter(t => t.caseTypes.includes(caseType as never))
    .map(t => structuredClone(t));
}

/**
 * Search templates by keyword in title or description. Returns deep copies to prevent shared-state mutation.
 */
export function searchTemplates(query: string): DocumentTemplate[] {
  const lower = query.toLowerCase();
  return TEMPLATE_LIBRARY
    .filter(
      t => t.title.toLowerCase().includes(lower) || t.description.toLowerCase().includes(lower)
    )
    .map(t => structuredClone(t));
}

/**
 * Category labels for the UI
 */
export const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  petition: 'Petitions & Complaints',
  motion_temporary: 'Temporary & Emergency Motions',
  motion_procedure: 'Procedural Motions',
  motion_custody: 'Custody & Parenting Motions',
  motion_enforcement: 'Enforcement Motions',
  motion_discovery: 'Discovery Motions',
  motion_resolution: 'Case Resolution Motions',
  response: 'Responses & Answers',
  counter_filing: 'Counter-Petitions & Cross-Motions',
  notice_hearing: 'Hearing Notices',
  notice_filing: 'Filing Notices',
  notice_case_status: 'Case Status Notices',
  notice_parenting: 'Parenting & Custody Notices',
  declaration: 'Declarations & Affidavits',
  order: 'Proposed Orders',
  certificate: 'Certificates',
  exhibit: 'Exhibit Documents',
  other: 'Other Documents',
};
