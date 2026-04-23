/**
 * Maine Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Maine Default jurisdiction profile. */
export const ME_DEFAULT_PROFILE = createStateDefaultProfile('ME', 'Maine');
