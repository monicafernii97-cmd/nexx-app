/**
 * South Carolina Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** South Carolina Default jurisdiction profile. */
export const SC_DEFAULT_PROFILE = createStateDefaultProfile('SC', 'South Carolina');
