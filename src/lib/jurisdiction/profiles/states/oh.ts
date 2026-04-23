/**
 * Ohio Default Jurisdiction Profile
 *
 * Enriched profile with Ohio-specific formatting rules.
 * Status: enriched_pending_review — awaiting manual verification
 * against Ohio Rules of Civil Procedure and local court requirements.
 *
 * Key differences from US default:
 * - Caption style: generic_state_caption
 * - Cause label: "Case No."
 * - Certificate of service required on separate page
 *
 * TODO: Verify against Ohio Rules of Civil Procedure Rule 5(B)
 * TODO: Verify county-specific requirements (Cuyahoga, Franklin, Hamilton)
 * TODO: Confirm caption format per Ohio court of common pleas rules
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Ohio Default jurisdiction profile. */
export const OH_DEFAULT_PROFILE = createStateDefaultProfile('OH', 'Ohio', {
  accuracyStatus: 'enriched_pending_review',
  sourceNotes: [
    {
      label: 'Ohio Rules of Civil Procedure — Rule 5',
      url: 'https://www.supremecourt.ohio.gov/rules/civil',
      reviewedAt: '2026-04-23',
      reviewedBy: 'automated_scaffold',
    },
  ],
  overrides: {
    caption: {
      style: 'generic_state_caption',
      causeLabel: 'Case No.',
      useThreeColumnTable: false,
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
  },
});
