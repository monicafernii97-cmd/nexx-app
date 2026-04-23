/**
 * Kansas Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Kansas Default jurisdiction profile. */
export const KS_DEFAULT_PROFILE = createStateDefaultProfile('KS', 'Kansas');
