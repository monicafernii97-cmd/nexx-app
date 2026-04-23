/**
 * Wisconsin Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Wisconsin Default jurisdiction profile. */
export const WI_DEFAULT_PROFILE = createStateDefaultProfile('WI', 'Wisconsin');
