/**
 * Export Caption Builder
 *
 * Constructs court-style ExportCaption blocks supporting:
 * - Texas SAPCR ("IN THE INTEREST OF")
 * - Texas general (Petitioner v. Respondent)
 * - Federal caption
 * - Generic state caption
 * - IN RE caption
 *
 * Invariant 4: No ambiguous names.
 * Uses captionPetitionerName / captionRespondentName only.
 * Uses jurisdiction profile + party data to determine layout.
 */

import type { ExportCaption } from './types';

// ═══════════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════════

/**
 * Input for caption construction.
 *
 * All party fields use explicit caption-role names:
 * - captionPetitionerName = actual petitioner (never filing party)
 * - captionRespondentName = actual respondent (never filing party)
 * - filingPartyLegalName = whoever files this document (separate)
 */
export type CaptionBuildInput = {
  style: ExportCaption['style'];
  courtName?: string;
  judicialDistrict?: string;
  causeNumber?: string;
  causeLabel?: string;
  captionPetitionerName?: string;
  captionRespondentName?: string;
  childrenNames?: string[];
  state?: string;
  county?: string;
  caseType?: string;
  caseTitleFormat?: string;
  customCaption?: string;
};

/** Validation errors from caption construction. */
export type CaptionValidationError = {
  field: string;
  message: string;
};

/** Result of caption construction with optional validation errors. */
export type CaptionBuildResult = {
  caption: ExportCaption;
  validationErrors: CaptionValidationError[];
};

// ═══════════════════════════════════════════════════════════════
// SAPCR Detection
// ═══════════════════════════════════════════════════════════════

/**
 * Detect whether this filing is SAPCR (Suit Affecting Parent-Child Relationship).
 * When SAPCR, never fall back to Name v. Name.
 */
function isSAPCR(input: CaptionBuildInput): boolean {
  if (input.caseTitleFormat === 'in_interest_of') return true;
  if ((input.childrenNames?.length ?? 0) > 0) return true;
  if (input.caseType && /sapcr|parent.child|custody|modification/i.test(input.caseType)) return true;
  return false;
}

// ═══════════════════════════════════════════════════════════════
// Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build an ExportCaption from party data and jurisdiction settings.
 *
 * If SAPCR is detected, forces in-re/SAPCR caption style regardless
 * of the requested style. Never falls back to Name v. Name for SAPCR.
 *
 * @param input - Caption construction input
 * @returns Caption with any validation errors
 */
export function buildExportCaption(input: CaptionBuildInput): CaptionBuildResult {
  const validationErrors: CaptionValidationError[] = [];

  // Custom caption: validate required legal pieces
  if (input.customCaption?.trim()) {
    const custom = input.customCaption.trim();
    if (!input.causeNumber && !/cause\s*no|case\s*no|civil\s*action/i.test(custom)) {
      validationErrors.push({ field: 'causeNumber', message: 'Custom caption is missing a cause number.' });
    }
    if (!input.courtName && !/court/i.test(custom)) {
      validationErrors.push({ field: 'courtName', message: 'Custom caption is missing a court designation.' });
    }
    if (!input.county && !/county/i.test(custom)) {
      validationErrors.push({ field: 'county', message: 'Custom caption is missing county.' });
    }
  }

  // Force SAPCR caption when detected
  const forceSAPCR = isSAPCR(input);
  const effectiveStyle = forceSAPCR ? 'texas_pleading' : input.style;

  let caption: ExportCaption;
  switch (effectiveStyle) {
    case 'texas_pleading':
      caption = buildTexasCaption(input, forceSAPCR);
      break;
    case 'federal_caption':
      caption = buildFederalCaption(input);
      break;
    case 'in_re_caption':
      caption = buildInReCaption(input);
      break;
    case 'generic_state_caption':
    default:
      caption = buildGenericCaption(input);
      break;
  }

  return { caption, validationErrors };
}

// ═══════════════════════════════════════════════════════════════
// Style-Specific Builders
// ═══════════════════════════════════════════════════════════════

function buildTexasCaption(input: CaptionBuildInput, forceSAPCR: boolean): ExportCaption {
  const county = input.county || '_______________';
  const courtLine = input.courtName || 'DISTRICT COURT';
  const cause = input.causeNumber || '_______________';
  const causeLabel = input.causeLabel ?? 'CAUSE NO.';

  // Build right lines: court + judicial district as separate lines
  const rightLines: string[] = [`IN THE ${courtLine.toUpperCase()}`];
  if (input.judicialDistrict) {
    rightLines.push(input.judicialDistrict.toUpperCase());
  }
  rightLines.push(`${county.toUpperCase()} COUNTY, TEXAS`);

  // SAPCR: IN THE INTEREST OF {children}
  if (forceSAPCR || input.childrenNames?.length) {
    const childLines = (input.childrenNames ?? []).map((name) => name.toUpperCase());
    const childLabel = (input.childrenNames?.length ?? 0) === 1 ? 'A CHILD' : 'CHILDREN';
    return {
      style: 'texas_pleading',
      causeLine: `${causeLabel} ${cause}`,
      leftLines: [
        'IN THE INTEREST OF',
        ...childLines,
        childLabel,
      ],
      centerLines: ['§', '§', '§', '§'],
      rightLines,
    };
  }

  // General Texas: Petitioner v. Respondent
  return {
    style: 'texas_pleading',
    causeLine: `${causeLabel} ${cause}`,
    leftLines: [(input.captionPetitionerName || 'PETITIONER').toUpperCase()],
    centerLines: ['§', 'VS.', '§'],
    rightLines,
  };
}

function buildFederalCaption(input: CaptionBuildInput): ExportCaption {
  const courtLine = input.courtName || 'UNITED STATES DISTRICT COURT';
  const cause = input.causeNumber || '_______________';
  const causeLabel = input.causeLabel ?? 'Civil Action No.';

  return {
    style: 'federal_caption',
    causeLine: `${causeLabel} ${cause}`,
    leftLines: [
      (input.captionPetitionerName || 'PLAINTIFF').toUpperCase(),
      '',
      'v.',
      '',
      (input.captionRespondentName || 'DEFENDANT').toUpperCase(),
    ],
    centerLines: [],
    rightLines: [courtLine.toUpperCase()],
  };
}

function buildInReCaption(input: CaptionBuildInput): ExportCaption {
  const cause = input.causeNumber || '_______________';
  const courtLine = input.courtName || 'DISTRICT COURT';
  const causeLabel = input.causeLabel ?? 'No.';

  const subject =
    input.childrenNames?.length
      ? input.childrenNames.map((n) => n.toUpperCase()).join(', ')
      : (input.captionPetitionerName || 'APPLICANT').toUpperCase();

  return {
    style: 'in_re_caption',
    causeLine: `${causeLabel} ${cause}`,
    leftLines: ['IN RE:', subject],
    centerLines: [],
    rightLines: [courtLine.toUpperCase()],
  };
}

function buildGenericCaption(input: CaptionBuildInput): ExportCaption {
  const cause = input.causeNumber || '_______________';
  const causeLabel = input.causeLabel ?? 'Case No.';

  return {
    style: 'generic_state_caption',
    causeLine: `${causeLabel} ${cause}`,
    leftLines: [(input.captionPetitionerName || 'PETITIONER').toUpperCase()],
    centerLines: [],
    rightLines: [
      'v.',
      (input.captionRespondentName || 'RESPONDENT').toUpperCase(),
    ],
  };
}

