/**
 * Georgia Default Jurisdiction Profile
 *
 * Enriched profile with Georgia-specific formatting rules.
 * Status: enriched_pending_review — awaiting manual verification
 * against Georgia Civil Practice Act.
 *
 * Key differences from US default:
 * - Caption style: generic_state_caption
 * - Cause label: "Civil Action File No."
 * - Certificate of service required
 *
 * TODO: Verify against Georgia Civil Practice Act § 9-11-5
 * TODO: Verify Fulton/DeKalb/Gwinnett county-specific requirements
 * TODO: Confirm GA superior court formatting conventions
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Georgia Default jurisdiction profile. */
export const GA_DEFAULT_PROFILE = createStateDefaultProfile('GA', 'Georgia', {
  accuracyStatus: 'enriched_pending_review',
  sourceNotes: [
    {
      label: 'Georgia Civil Practice Act — § 9-11-5',
      url: 'https://law.justia.com/codes/georgia/title-9/chapter-11/',
      reviewedAt: '2026-04-23',
      reviewedBy: 'automated_scaffold',
    },
  ],
  overrides: {
    caption: {
      style: 'generic_state_caption',
      causeLabel: 'Civil Action File No.',
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
