/**
 * Illinois Default Jurisdiction Profile
 *
 * Enriched profile with Illinois-specific formatting rules.
 * Status: enriched_pending_review — awaiting manual verification
 * against IL Supreme Court Rules and local court requirements.
 *
 * Key differences from US default:
 * - Caption style: generic_state_caption
 * - Body text: justified, Times New Roman 12pt (standard)
 * - 1-inch margins (standard for IL courts)
 * - Certificate of service required on separate page
 *
 * TODO: Verify against IL Supreme Court Rule 10-101 (e-filing standards)
 * TODO: Verify county-specific requirements (Cook, DuPage, Lake)
 * TODO: Confirm caption/cause line format per IL circuit rules
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Illinois Default jurisdiction profile. */
export const IL_DEFAULT_PROFILE = createStateDefaultProfile('IL', 'Illinois', {
  accuracyStatus: 'enriched_pending_review',
  sourceNotes: [
    {
      label: 'Illinois Supreme Court Rules — Article X: E-Filing',
      url: 'https://www.illinoiscourts.gov/courts/supreme-court/supreme-court-rules',
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

    // TODO: Verify IL exhibit labeling conventions (alpha vs numeric)
    // TODO: Verify IL Bates numbering requirements
  },
});
