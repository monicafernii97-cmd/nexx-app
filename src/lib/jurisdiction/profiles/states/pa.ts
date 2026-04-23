/**
 * Pennsylvania Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Pennsylvania Default jurisdiction profile. */
export const PA_DEFAULT_PROFILE = createStateDefaultProfile('PA', 'Pennsylvania');
