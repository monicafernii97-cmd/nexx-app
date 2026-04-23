/**
 * Utah Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Utah Default jurisdiction profile. */
export const UT_DEFAULT_PROFILE = createStateDefaultProfile('UT', 'Utah');
