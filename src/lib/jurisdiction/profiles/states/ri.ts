/**
 * Rhode Island Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Rhode Island Default jurisdiction profile. */
export const RI_DEFAULT_PROFILE = createStateDefaultProfile('RI', 'Rhode Island');
