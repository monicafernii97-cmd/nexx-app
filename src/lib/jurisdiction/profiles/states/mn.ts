/**
 * Minnesota Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Minnesota Default jurisdiction profile. */
export const MN_DEFAULT_PROFILE = createStateDefaultProfile('MN', 'Minnesota');
