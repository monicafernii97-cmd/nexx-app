/**
 * Connecticut Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Connecticut Default jurisdiction profile. */
export const CT_DEFAULT_PROFILE = createStateDefaultProfile('CT', 'Connecticut');
