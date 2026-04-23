/**
 * Ohio Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Ohio Default jurisdiction profile. */
export const OH_DEFAULT_PROFILE = createStateDefaultProfile('OH', 'Ohio');
