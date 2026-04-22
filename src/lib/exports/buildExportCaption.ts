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
 * Uses jurisdiction profile + party data to determine layout.
 */

import type { ExportCaption } from './types';

// ═══════════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════════

/** Input for caption construction. */
export type CaptionBuildInput = {
  style: ExportCaption['style'];
  courtName?: string;
  causeNumber?: string;
  petitionerName?: string;
  respondentName?: string;
  childrenNames?: string[];
  state?: string;
  county?: string;
};

// ═══════════════════════════════════════════════════════════════
// Builder
// ═══════════════════════════════════════════════════════════════

/**
 * Build an ExportCaption from party data and jurisdiction settings.
 *
 * @param input - Caption construction input
 * @returns Fully-populated ExportCaption
 */
export function buildExportCaption(input: CaptionBuildInput): ExportCaption {
  switch (input.style) {
    case 'texas_pleading':
      return buildTexasCaption(input);
    case 'federal_caption':
      return buildFederalCaption(input);
    case 'in_re_caption':
      return buildInReCaption(input);
    case 'generic_state_caption':
    default:
      return buildGenericCaption(input);
  }
}

// ═══════════════════════════════════════════════════════════════
// Style-Specific Builders
// ═══════════════════════════════════════════════════════════════

function buildTexasCaption(input: CaptionBuildInput): ExportCaption {
  const county = input.county || '_______________';
  const courtLine = input.courtName || 'DISTRICT COURT';
  const cause = input.causeNumber || '_______________';

  // SAPCR: IN THE INTEREST OF {children}
  if (input.childrenNames?.length) {
    const childLines = input.childrenNames.map((name) => name.toUpperCase());
    return {
      style: 'texas_pleading',
      causeLine: `No. ${cause}`,
      leftLines: [
        'IN THE INTEREST OF',
        ...childLines,
        input.childrenNames.length === 1 ? 'A CHILD' : 'CHILDREN',
      ],
      centerLines: ['§', '§', '§', '§'],
      rightLines: [`IN THE ${courtLine}`, `${county.toUpperCase()} COUNTY, TEXAS`],
    };
  }

  // General Texas: Petitioner v. Respondent
  return {
    style: 'texas_pleading',
    causeLine: `No. ${cause}`,
    leftLines: [(input.petitionerName || 'PETITIONER').toUpperCase()],
    centerLines: ['§', 'VS.', '§'],
    rightLines: [
      `IN THE ${courtLine}`,
      `${county.toUpperCase()} COUNTY, TEXAS`,
    ],
  };
}

function buildFederalCaption(input: CaptionBuildInput): ExportCaption {
  const courtLine = input.courtName || 'UNITED STATES DISTRICT COURT';
  const cause = input.causeNumber || '_______________';

  return {
    style: 'federal_caption',
    causeLine: `Civil Action No. ${cause}`,
    leftLines: [
      (input.petitionerName || 'PLAINTIFF').toUpperCase(),
      '',
      'v.',
      '',
      (input.respondentName || 'DEFENDANT').toUpperCase(),
    ],
    centerLines: [],
    rightLines: [courtLine.toUpperCase()],
  };
}

function buildInReCaption(input: CaptionBuildInput): ExportCaption {
  const cause = input.causeNumber || '_______________';
  const courtLine = input.courtName || 'DISTRICT COURT';

  const subject =
    input.childrenNames?.length
      ? input.childrenNames.map((n) => n.toUpperCase()).join(', ')
      : (input.petitionerName || 'APPLICANT').toUpperCase();

  return {
    style: 'in_re_caption',
    causeLine: `No. ${cause}`,
    leftLines: ['IN RE:', subject],
    centerLines: [],
    rightLines: [courtLine.toUpperCase()],
  };
}

function buildGenericCaption(input: CaptionBuildInput): ExportCaption {
  const cause = input.causeNumber || '_______________';

  return {
    style: 'generic_state_caption',
    causeLine: `Case No. ${cause}`,
    leftLines: [(input.petitionerName || 'PETITIONER').toUpperCase()],
    centerLines: [],
    rightLines: [
      'v.',
      (input.respondentName || 'RESPONDENT').toUpperCase(),
    ],
  };
}
