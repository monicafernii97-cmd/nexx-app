/**
 * Illinois Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Illinois Default jurisdiction profile. */
export const IL_DEFAULT_PROFILE = createStateDefaultProfile('IL', 'Illinois');
