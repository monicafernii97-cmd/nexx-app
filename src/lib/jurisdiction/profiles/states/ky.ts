/**
 * Kentucky Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Kentucky Default jurisdiction profile. */
export const KY_DEFAULT_PROFILE = createStateDefaultProfile('KY', 'Kentucky');
