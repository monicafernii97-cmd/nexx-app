/**
 * Indiana Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Indiana Default jurisdiction profile. */
export const IN_DEFAULT_PROFILE = createStateDefaultProfile('IN', 'Indiana');
