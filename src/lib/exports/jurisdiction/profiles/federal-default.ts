/**
 * Federal Default Export Jurisdiction Profile
 *
 * Inherits from shared base, overrides federal-specific settings.
 */

import type { JurisdictionProfile } from '../types';
import { BASE_EXPORT_PROFILE } from './base';

export const FEDERAL_DEFAULT_EXPORT_PROFILE: JurisdictionProfile = {
  ...BASE_EXPORT_PROFILE,
  key: 'federal-default',
  name: 'Federal Default',
  courtType: 'federal',
  typography: {
    ...BASE_EXPORT_PROFILE.typography,
    bodyAlign: 'justify',
  },
  court: {
    ...BASE_EXPORT_PROFILE.court!,
    captionStyle: 'federal_caption',
    certificateSeparatePage: true,
  },
  exhibit: {
    ...BASE_EXPORT_PROFILE.exhibit!,
    labelStyleDefault: 'numeric',
    coverPageRequired: true,
    stampedTitleRequired: true,
    batesEnabledDefault: true,
    coverSummaryTone: 'formal_neutral',
  },
  summary: {
    ...BASE_EXPORT_PROFILE.summary!,
    timelineAsTable: true,
  },
};
