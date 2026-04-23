/**
 * Idaho Default Jurisdiction Profile
 *
 * Inherits US default via factory. Override specific fields as state
 * formatting research is completed.
 */

import { createStateDefaultProfile } from './createStateDefaultProfile';

/** Idaho Default jurisdiction profile. */
export const ID_DEFAULT_PROFILE = createStateDefaultProfile('ID', 'Idaho');
