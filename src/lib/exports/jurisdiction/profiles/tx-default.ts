/**
 * Texas Default Export Jurisdiction Profile
 *
 * Inherits from shared base, overrides TX-specific settings.
 */

import type { JurisdictionProfile } from '../types';
import { BASE_EXPORT_PROFILE } from './base';

export const TX_DEFAULT_EXPORT_PROFILE: JurisdictionProfile = {
  ...BASE_EXPORT_PROFILE,
  key: 'tx-default',
  name: 'Texas Default',
  state: 'texas',
  typography: {
    ...BASE_EXPORT_PROFILE.typography,
    bodyAlign: 'justify',
  },
  court: {
    ...BASE_EXPORT_PROFILE.court!,
    captionStyle: 'texas_pleading',
    certificateSeparatePage: true,
  },
  exhibit: {
    ...BASE_EXPORT_PROFILE.exhibit!,
    coverPageRequired: true,
    stampedTitleRequired: true,
    coverSummaryTone: 'formal_neutral',
  },
};
