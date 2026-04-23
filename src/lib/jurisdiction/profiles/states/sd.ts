/**
 * South Dakota Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** South Dakota Default jurisdiction profile. */
export const SD_DEFAULT_PROFILE = createStateDefaultProfile('SD', 'South Dakota');
