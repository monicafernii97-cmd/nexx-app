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

  // Normalize inputs upfront — whitespace-only → undefined (Invariant P3)
  const norm = {
    ...input,
    customCaption: input.customCaption?.trim() || undefined,
    causeNumber: input.causeNumber?.trim() || undefined,
    courtName: input.courtName?.trim() || undefined,
    county: input.county?.trim() || undefined,
    captionPetitionerName: input.captionPetitionerName?.trim() || undefined,
    captionRespondentName: input.captionRespondentName?.trim() || undefined,
  };

  // Compute effective style first so validation can be style-aware
  const forceSAPCR = isSAPCR(norm) &&
    (norm.style === 'texas_pleading' || norm.style === 'generic_state_caption');
  const effectiveStyle = forceSAPCR ? 'texas_pleading' : norm.style;

  // Custom caption: validate required legal pieces (style-aware)
  if (norm.customCaption) {
    const custom = norm.customCaption;
    if (!norm.causeNumber && !/cause\s*no|case\s*no|civil\s*action/i.test(custom)) {
      validationErrors.push({ field: 'causeNumber', message: 'Custom caption is missing a cause number.' });
    }
    if (!norm.courtName && !/court/i.test(custom)) {
      validationErrors.push({ field: 'courtName', message: 'Custom caption is missing a court designation.' });
    }
    // County is only required for state-level captions (not federal or in_re)
    const needsCounty = effectiveStyle === 'texas_pleading' || effectiveStyle === 'generic_state_caption';
    if (needsCounty && !norm.county && !/county/i.test(custom)) {
      validationErrors.push({ field: 'county', message: 'Custom caption is missing county.' });
    }
  }

  let caption: ExportCaption;
  switch (effectiveStyle) {
    case 'texas_pleading':
      caption = buildTexasCaption(norm, forceSAPCR);
      break;
    case 'federal_caption':
      caption = buildFederalCaption(norm);
      break;
    case 'in_re_caption':
      caption = buildInReCaption(norm);
      break;
    case 'generic_state_caption':
    default:
      caption = buildGenericCaption(norm);
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

  // SAPCR: IN THE INTEREST OF {children}
  if (forceSAPCR || input.childrenNames?.length) {
    const childLines = (input.childrenNames ?? []).flatMap(formatTexasSapcrChildName);
    const childLabel = (input.childrenNames?.length ?? 0) === 1 ? 'A CHILD' : 'CHILDREN';
    const rightLines = [
      `IN THE ${courtLine.toUpperCase()}`,
      '',
      ...(input.judicialDistrict ? [input.judicialDistrict.toUpperCase(), ''] : []),
      `${county.toUpperCase()} COUNTY, TEXAS`,
    ];
    const rowCount = Math.max(childLines.length + 2, rightLines.length);
    return {
      style: 'texas_pleading',
      causeLine: `${causeLabel} ${cause}`,
      leftLines: [
        'IN THE INTEREST OF',
        ...childLines,
        childLabel,
      ],
      centerLines: Array(rowCount).fill('§'),
      rightLines,
    };
  }

  // Build right lines: court + judicial district as separate lines
  const rightLines: string[] = [`IN THE ${courtLine.toUpperCase()}`];
  if (input.judicialDistrict) {
    rightLines.push(input.judicialDistrict.toUpperCase());
  }
  rightLines.push(`${county.toUpperCase()} COUNTY, TEXAS`);

  // General Texas: Petitioner v. Respondent
  return {
    style: 'texas_pleading',
    causeLine: `${causeLabel} ${cause}`,
    leftLines: [
      (input.captionPetitionerName || 'PETITIONER').toUpperCase(),
      '',
      'VS.',
      '',
      (input.captionRespondentName || 'RESPONDENT').toUpperCase(),
    ],
    centerLines: ['§', '§', '§'],
    rightLines,
  };
}

function formatTexasSapcrChildName(name: string): string[] {
  const normalized = name.trim().replace(/\s+/g, ' ').toUpperCase();
  if (!normalized) return [];
  if (normalized.length <= 26) return [normalized];

  const lines: string[] = [];
  let current = '';
  for (const word of normalized.split(' ')) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= 26 || !current) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
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

