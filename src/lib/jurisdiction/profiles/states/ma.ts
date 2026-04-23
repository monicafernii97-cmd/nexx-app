/**
 * Massachusetts Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Massachusetts Default jurisdiction profile. */
export const MA_DEFAULT_PROFILE = createStateDefaultProfile('MA', 'Massachusetts');
