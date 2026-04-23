/**
 * Tennessee Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Tennessee Default jurisdiction profile. */
export const TN_DEFAULT_PROFILE = createStateDefaultProfile('TN', 'Tennessee');
