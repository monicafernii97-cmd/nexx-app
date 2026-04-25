/**
 * Required Section Derivation
 *
 * Given a DocumentType, returns the ordered list of sections
 * required for a complete court document of that type.
 *
 * Rules:
 * - Deterministic (no AI, no network)
 * - Ordered (sections appear in filing order)
 * - Extensible (jurisdiction overrides can be added later)
 */

import type { DocumentType, RequiredSectionDef } from './types';

// ═══════════════════════════════════════════════════════════════
// Section Definitions by Document Type
// ═══════════════════════════════════════════════════════════════

const COMMON_SHELL: RequiredSectionDef[] = [
  { id: 'caption', heading: 'Case Caption', required: true, placeholder: 'Court, parties, and case number will be populated from your court settings.' },
  { id: 'title', heading: 'Document Title', required: true, placeholder: 'The title of the filing (e.g., "Motion for Summary Judgment").' },
];

const COMMON_TAIL: RequiredSectionDef[] = [
  { id: 'prayer', heading: 'Prayer for Relief', required: true, placeholder: 'AI will draft the formal closing request for the court.' },
  { id: 'signature', heading: 'Signature Block', required: true, placeholder: 'Respectfully submitted block with attorney/party identification.' },
  { id: 'certificate', heading: 'Certificate of Service', required: true, placeholder: 'Certification of service on opposing parties.' },
];

/** Sections keyed by document type. Order matters. */
const SECTION_DEFS: Record<DocumentType, RequiredSectionDef[]> = {
  motion: [
    ...COMMON_SHELL,
    { id: 'introduction', heading: 'Introduction', required: false, placeholder: 'Opening framing of the legal issue and requested relief.' },
    { id: 'factual_background', heading: 'Factual Background', required: true, placeholder: 'Chronological factual basis supporting the motion.' },
    { id: 'legal_standard', heading: 'Legal Standard', required: false, placeholder: 'Applicable legal standard for the requested relief.' },
    { id: 'argument', heading: 'Argument', required: true, placeholder: 'Legal arguments applying facts to the governing standard.' },
    ...COMMON_TAIL,
  ],

  petition: [
    ...COMMON_SHELL,
    { id: 'introduction', heading: 'Introduction', required: false, placeholder: 'Opening framing of the petition.' },
    { id: 'factual_background', heading: 'Factual Background', required: true, placeholder: 'Facts supporting the petition.' },
    { id: 'grounds', heading: 'Grounds for Relief', required: true, placeholder: 'Legal basis for the petition.' },
    ...COMMON_TAIL,
    { id: 'verification', heading: 'Verification', required: true, placeholder: 'Sworn statement attesting to the truth of the petition.' },
  ],

  response: [
    ...COMMON_SHELL,
    { id: 'introduction', heading: 'Introduction', required: false, placeholder: 'Opening framing of the response.' },
    { id: 'factual_background', heading: 'Factual Background', required: true, placeholder: 'Facts from the responding party\'s perspective.' },
    { id: 'argument', heading: 'Argument', required: true, placeholder: 'Legal arguments responding to the movant\'s claims.' },
    ...COMMON_TAIL,
  ],

  notice: [
    ...COMMON_SHELL,
    { id: 'body', heading: 'Notice Body', required: true, placeholder: 'Content of the notice being provided to parties or the court.' },
    ...COMMON_TAIL,
  ],

  affidavit: [
    ...COMMON_SHELL,
    { id: 'body', heading: 'Affidavit Body', required: true, placeholder: 'Numbered paragraphs of sworn testimony.' },
    { id: 'signature', heading: 'Signature Block', required: true, placeholder: 'Signature under oath with notary provision.' },
    { id: 'certificate', heading: 'Certificate of Service', required: false, placeholder: 'Service certification if filed separately.' },
  ],

  declaration: [
    ...COMMON_SHELL,
    { id: 'body', heading: 'Declaration Body', required: true, placeholder: 'Numbered paragraphs of declaration under penalty of perjury.' },
    { id: 'signature', heading: 'Signature Block', required: true, placeholder: 'Signature under penalty of perjury.' },
    { id: 'certificate', heading: 'Certificate of Service', required: false, placeholder: 'Service certification if filed separately.' },
  ],

  order: [
    ...COMMON_SHELL,
    { id: 'recitals', heading: 'Recitals', required: false, placeholder: 'Background and procedural history leading to this order.' },
    { id: 'findings', heading: 'Findings', required: false, placeholder: 'Court\'s findings of fact and conclusions of law.' },
    { id: 'order_body', heading: 'Order', required: true, placeholder: 'IT IS ORDERED paragraphs specifying the court\'s directives.' },
    { id: 'signature', heading: 'Judge Signature Block', required: true, placeholder: 'Signature line for the presiding judge.' },
  ],

  complaint: [
    ...COMMON_SHELL,
    { id: 'parties', heading: 'Parties', required: true, placeholder: 'Identification of plaintiffs and defendants.' },
    { id: 'jurisdiction', heading: 'Jurisdiction & Venue', required: true, placeholder: 'Basis for subject matter jurisdiction and venue.' },
    { id: 'factual_allegations', heading: 'Factual Allegations', required: true, placeholder: 'Numbered paragraphs stating the facts.' },
    { id: 'causes_of_action', heading: 'Causes of Action', required: true, placeholder: 'Legal claims with elements and supporting facts.' },
    ...COMMON_TAIL,
  ],

  answer: [
    ...COMMON_SHELL,
    { id: 'responses', heading: 'Responses to Allegations', required: true, placeholder: 'Admit, deny, or insufficient knowledge responses to each allegation.' },
    { id: 'affirmative_defenses', heading: 'Affirmative Defenses', required: false, placeholder: 'Any affirmative defenses asserted.' },
    ...COMMON_TAIL,
  ],

  request: [
    ...COMMON_SHELL,
    { id: 'body', heading: 'Request Body', required: true, placeholder: 'Content of the request.' },
    ...COMMON_TAIL,
  ],

  unknown: [
    ...COMMON_SHELL,
    { id: 'body', heading: 'Document Body', required: true, placeholder: 'Main content of the document.' },
    ...COMMON_TAIL,
  ],
};

// ═══════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════

/**
 * Derive the ordered list of required sections for a document type.
 *
 * @param documentType - Classified document type
 * @returns Ordered section definitions
 */
export function deriveRequiredSections(documentType: DocumentType): RequiredSectionDef[] {
  return SECTION_DEFS[documentType] ?? SECTION_DEFS.unknown;
}

/**
 * Get only the section IDs that are marked as required (blockers).
 */
export function getRequiredSectionIds(documentType: DocumentType): string[] {
  return deriveRequiredSections(documentType)
    .filter(s => s.required)
    .map(s => s.id);
}
