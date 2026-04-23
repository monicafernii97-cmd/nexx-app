/**
 * Family Court Override
 *
 * Reusable court-type delta applied on top of state profiles
 * when the case is in a family court.
 */

import type { JurisdictionProfile } from '../../types';

export const FAMILY_COURT_OVERRIDE: Partial<JurisdictionProfile> = {
  scope: {
    courtType: 'family_court',
  },

  sections: {
    prayerHeadingRequired: true,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  courtDocument: {
    prayerHeadingRequired: true,
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  court: {
    captionStyle: 'generic_state_caption',
    certificateSeparatePage: true,
    signatureKeepTogether: true,
    verificationKeepTogether: true,
  },

  exhibit: {
    labelStyleDefault: 'alpha',
    coverPageRequired: true,
    indexRequired: true,
    stampedTitleRequired: true,
    batesEnabledDefault: false,
    batesPosition: 'footer-right',
    coverSummaryTone: 'formal_neutral',
  },
};
