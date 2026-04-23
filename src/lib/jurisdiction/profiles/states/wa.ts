/**
 * Washington Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Washington Default jurisdiction profile. */
export const WA_DEFAULT_PROFILE = createStateDefaultProfile('WA', 'Washington');
