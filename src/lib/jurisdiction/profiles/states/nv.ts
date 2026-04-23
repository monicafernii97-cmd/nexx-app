/**
 * Nevada Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Nevada Default jurisdiction profile. */
export const NV_DEFAULT_PROFILE = createStateDefaultProfile('NV', 'Nevada');
