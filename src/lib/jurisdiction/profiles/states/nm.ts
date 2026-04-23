/**
 * New Mexico Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** New Mexico Default jurisdiction profile. */
export const NM_DEFAULT_PROFILE = createStateDefaultProfile('NM', 'New Mexico');
