/**
 * West Virginia Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** West Virginia Default jurisdiction profile. */
export const WV_DEFAULT_PROFILE = createStateDefaultProfile('WV', 'West Virginia');
