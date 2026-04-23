/**
 * New Jersey Default Jurisdiction Profile
 *
 * Enriched profile with New Jersey-specific formatting rules.
 * Status: enriched_pending_review — awaiting manual verification
 * against NJ Rules of Court.
 *
 * Key differences from US default:
 * - Caption style: generic_state_caption
 * - Cause label: "Docket No."
 * - Certificate of service required on separate page
 *
 * TODO: Verify against NJ Rules of Court 1:5-1 (service)
 * TODO: Verify Superior Court vs Tax Court formatting differences
 * TODO: Confirm Bergen/Essex/Hudson county-specific requirements
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** New Jersey Default jurisdiction profile. */
export const NJ_DEFAULT_PROFILE = createStateDefaultProfile('NJ', 'New Jersey', {
  accuracyStatus: 'enriched_pending_review',
  sourceNotes: [
    {
      label: 'New Jersey Rules of Court — Rule 1:5-1',
      url: 'https://www.njcourts.gov/attorneys/rules-of-court',
      reviewedAt: '2026-04-23',
      reviewedBy: 'automated_scaffold',
    },
  ],
  overrides: {
    caption: {
      style: 'generic_state_caption',
      causeLabel: 'Docket No.',
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
