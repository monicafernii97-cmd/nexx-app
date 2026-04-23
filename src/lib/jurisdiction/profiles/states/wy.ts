/**
 * Wyoming Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Wyoming Default jurisdiction profile. */
export const WY_DEFAULT_PROFILE = createStateDefaultProfile('WY', 'Wyoming');
