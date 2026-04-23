/**
 * Georgia Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Georgia Default jurisdiction profile. */
export const GA_DEFAULT_PROFILE = createStateDefaultProfile('GA', 'Georgia');
