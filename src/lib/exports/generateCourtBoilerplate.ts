/**
 * generateCourtBoilerplate.ts
 *
 * Auto-generates standard legal boilerplate sections (Certificate of Service,
 * Prayer) so the user never has to write them manually. The modal shows
 * generated text for confirmation with Use This / Edit / Send to NEXchat.
 */

import type { CourtIdentity } from './resolveCourtIdentity';

// ═══════════════════════════════════════════════════════════════
// Service method options (for Certificate of Service)
// ═══════════════════════════════════════════════════════════════

/** Service methods the user can select when Certificate of Service is needed. */
export const SERVICE_METHOD_OPTIONS = [
  { value: 'eservice', label: 'E-service / eFileTexas' },
  { value: 'email', label: 'Email' },
  { value: 'appclose', label: 'AppClose' },
  { value: 'certified_mail', label: 'Certified mail, return receipt requested' },
  { value: 'hand_delivery', label: 'Hand delivery' },
  { value: 'other', label: 'Other' },
] as const;

export type ServiceMethodValue = (typeof SERVICE_METHOD_OPTIONS)[number]['value'];

// ═══════════════════════════════════════════════════════════════
// Certificate of Service
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a standard Certificate of Service using the resolved identity.
 *
 * @param identity - Resolved court identity with party names
 * @param serviceMethod - Selected service method (e.g., 'email', 'eservice')
 * @param customMethodText - Custom text when serviceMethod is 'other'
 * @returns Formatted certificate of service text
 */
export function generateCertificateOfService(
  identity: CourtIdentity,
  serviceMethod: ServiceMethodValue,
  customMethodText?: string,
): string {
  // Resolve names from best available source — no silent placeholders in final mode.
  // The finalization guard (assertCourtDocumentFinalizable) is the hard stop;
  // here we try our best so the preview and final output are clean.
  const filingName = identity.filingPartyLegalName || '[Filing Party]';
  const opposingName = identity.opposingPartyLegalName
    || (identity.filingPartyRole === 'petitioner'
        ? identity.captionRespondentName
        : identity.captionPetitionerName)
    || '[Opposing Party]';
  const today = formatDate(new Date());

  const methodLabel = serviceMethod === 'other'
    ? (customMethodText?.trim() || '[method]')
    : SERVICE_METHOD_OPTIONS.find(o => o.value === serviceMethod)?.label ?? serviceMethod;

  return [
    'CERTIFICATE OF SERVICE',
    '',
    `I certify that a true and correct copy of the foregoing document was served on ${opposingName} on ${today} by ${methodLabel.toLowerCase()}.`,
    '',
    '',
    '______________________________',
    filingName,
    identity.isProSe ? 'Pro Se' : '',
  ].filter((line, i) => i < 7 || line !== '').join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Prayer Section
// ═══════════════════════════════════════════════════════════════

/**
 * Generate a neutral default Prayer section based on document type.
 *
 * @param identity - Resolved court identity
 * @param documentKind - Document type (e.g., 'motion', 'petition', 'response')
 * @returns Formatted prayer section text
 */
export function generatePrayerSection(
  identity: CourtIdentity,
  documentKind: string,
): string {
  const partyLabel = identity.filingPartyRole === 'respondent'
    ? 'Respondent'
    : 'Petitioner';
  const partyName = identity.filingPartyLegalName || partyLabel;

  // Document-specific prayer variations
  const kind = documentKind.toLowerCase();

  if (kind.includes('temporary') || kind.includes('tro')) {
    return [
      'PRAYER',
      '',
      `${partyName} respectfully requests that the Court grant temporary orders as requested herein, and for all other relief, both general and special, to which ${partyLabel} may be justly entitled.`,
    ].join('\n');
  }

  if (kind.includes('modification')) {
    return [
      'PRAYER',
      '',
      `${partyName} respectfully requests that the Court modify the prior order as requested herein, and for all other relief, both general and special, to which ${partyLabel} may be justly entitled.`,
    ].join('\n');
  }

  if (kind.includes('enforcement')) {
    return [
      'PRAYER',
      '',
      `${partyName} respectfully requests that the Court enforce the prior order as requested herein, find the opposing party in contempt, and grant all other relief, both general and special, to which ${partyLabel} may be justly entitled.`,
    ].join('\n');
  }

  if (kind.includes('response') || kind.includes('answer')) {
    return [
      'PRAYER',
      '',
      `${partyName} respectfully requests that the Court deny the relief sought by the opposing party and grant all other relief, both general and special, to which ${partyLabel} may be justly entitled.`,
    ].join('\n');
  }

  // Default — covers motion, petition, affidavit, and unrecognized types
  return [
    'PRAYER',
    '',
    `${partyName} respectfully requests that the Court grant the relief requested in this filing and all further relief, both general and special, to which ${partyLabel} may be justly entitled.`,
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Format a Date as "Month Day, Year" (e.g., "May 3, 2026"). */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
