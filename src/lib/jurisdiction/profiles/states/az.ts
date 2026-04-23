/**
 * Arizona Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Arizona Default jurisdiction profile. */
export const AZ_DEFAULT_PROFILE = createStateDefaultProfile('AZ', 'Arizona');
