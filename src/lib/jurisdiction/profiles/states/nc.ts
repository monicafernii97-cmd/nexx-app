/**
 * North Carolina Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** North Carolina Default jurisdiction profile. */
export const NC_DEFAULT_PROFILE = createStateDefaultProfile('NC', 'North Carolina');
