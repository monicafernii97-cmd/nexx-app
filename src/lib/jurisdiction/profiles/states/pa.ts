/**
 * Pennsylvania Default Jurisdiction Profile
 *
 * Enriched profile with Pennsylvania-specific formatting rules.
 * Status: enriched_pending_review — awaiting manual verification
 * against PA Rules of Civil Procedure.
 *
 * Key differences from US default:
 * - Caption style: generic_state_caption
 * - Cause label: "No." (PA uses "No." not "Case No.")
 * - Certificate of service required
 *
 * TODO: Verify against PA Rules of Civil Procedure Rule 440
 * TODO: Verify Philadelphia/Allegheny county-specific requirements
 * TODO: Confirm PA e-filing formatting requirements
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Pennsylvania Default jurisdiction profile. */
export const PA_DEFAULT_PROFILE = createStateDefaultProfile('PA', 'Pennsylvania', {
  accuracyStatus: 'enriched_pending_review',
  sourceNotes: [
    {
      label: 'Pennsylvania Rules of Civil Procedure — Rule 440',
      url: 'https://www.pacodeandbulletin.gov/Display/pacode?file=/secure/pacode/data/231/subpartAToc.html',
      reviewedAt: '2026-04-23',
      reviewedBy: 'automated_scaffold',
    },
  ],
  overrides: {
    caption: {
      style: 'generic_state_caption',
      causeLabel: 'No.',
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
