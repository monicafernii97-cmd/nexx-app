/**
 * Maryland Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Maryland Default jurisdiction profile. */
export const MD_DEFAULT_PROFILE = createStateDefaultProfile('MD', 'Maryland');
